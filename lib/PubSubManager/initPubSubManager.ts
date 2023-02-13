import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { asValue, log, PubSubManager } from "./PubSubManager";
const REALTIME_TRIGGER_CHECK_QUERY = "prostgles-server internal query used to manage realtime triggers" as const;

export async function initPubSubManager(this: PubSubManager): Promise<PubSubManager | undefined> {
  if (!this.canContinue()) return undefined;

  try {
    const schema_version = 6;

    const initQuery = `
              BEGIN; --  ISOLATION LEVEL SERIALIZABLE;-- TRANSACTION ISOLATION LEVEL SERIALIZABLE;

              --SET  TRANSACTION ISOLATION LEVEL SERIALIZABLE;

              /* 
              * ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
              */

              DO
              $do$
              BEGIN

                  /* Reduce deadlocks */
                  PERFORM pg_sleep(random());

                  /* Drop older version */
                  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') THEN

                      IF
                          NOT EXISTS (
                              SELECT 1 
                              FROM information_schema.tables 
                              WHERE  table_schema = 'prostgles'
                              AND    table_name   = 'versions'
                          )
                      THEN
                          DROP SCHEMA IF EXISTS prostgles CASCADE;
                      ELSE 
                          IF NOT EXISTS(SELECT 1 FROM prostgles.versions WHERE version >= ${schema_version}) THEN
                            DROP SCHEMA IF EXISTS prostgles CASCADE;
                          END IF;
                      END IF;

                  END IF;


                  IF  NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') 
                  THEN
                      --RAISE NOTICE 'CREATE SCHEMA IF NOT EXISTS prostgles';

                      CREATE SCHEMA IF NOT EXISTS prostgles;

                      CREATE TABLE IF NOT EXISTS prostgles.versions(
                          version NUMERIC PRIMARY KEY
                      );
                      INSERT INTO prostgles.versions(version) VALUES(${schema_version}) ON CONFLICT DO NOTHING;

                      CREATE OR REPLACE FUNCTION prostgles.random_string(length INTEGER DEFAULT 33) RETURNS TEXT AS $$
                          DECLARE
                              chars TEXT[] := '{0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z}';
                              result TEXT := '';
                              i INTEGER := 0;
                          BEGIN
                          IF length < 0 THEN
                              RAISE exception 'Given length cannot be less than 0';
                          END IF;
                          FOR i IN 1..length LOOP
                              result := result || chars[1+random()*(array_length(chars, 1)-1)];
                          END LOOP;
                          RETURN result;
                          END;
                      $$ language plpgsql;
                      COMMENT ON FUNCTION prostgles.random_string IS 'UUIDs without installing pgcrypto';


                      CREATE OR REPLACE FUNCTION prostgles.debug(VARIADIC args TEXT[]) RETURNS VOID AS $$     
                          BEGIN

                              --PERFORM pg_notify('debug', concat_ws(' ', args));
                              IF
                                  NOT EXISTS (
                                      SELECT 1 
                                      FROM information_schema.tables 
                                      WHERE  table_schema = 'prostgles'
                                      AND    table_name   = 'debug'
                                  )
                              THEN
                                  CREATE TABLE IF NOT EXISTS prostgles.debug(m TEXT);
                              END IF;

                              INSERT INTO prostgles.debug(m) VALUES(concat_ws(' ', args));

                          END;
                      $$ LANGUAGE plpgsql;
                      COMMENT ON FUNCTION prostgles.debug IS 'Used for internal debugging';


                      CREATE TABLE IF NOT EXISTS prostgles.apps (
                          id                  TEXT PRIMARY KEY DEFAULT prostgles.random_string(),
                          added               TIMESTAMP DEFAULT NOW(),
                          application_name    TEXT,
                          last_check          TIMESTAMP NOT NULL DEFAULT NOW(),
                          last_check_ended    TIMESTAMP NOT NULL DEFAULT NOW(),
                          watching_schema     BOOLEAN DEFAULT FALSE,
                          check_frequency_ms  INTEGER NOT NULL  
                      );
                      COMMENT ON TABLE prostgles.apps IS 'Keep track of prostgles server apps connected to db to combine common triggers. Heartbeat used due to no logout triggers in postgres';

                      CREATE TABLE IF NOT EXISTS prostgles.app_triggers (
                          app_id          TEXT NOT NULL,
                          table_name      TEXT NOT NULL,
                          condition       TEXT NOT NULL,

                          /* The view from the root subscription, found in the condition.
                              We need this because old_table/new_table data is not reflected in the view inside the AFTER trigger
                          */
                          related_view_name     TEXT, 
                          related_view_def      TEXT, /* view definition */

                          inserted        TIMESTAMP NOT NULL DEFAULT NOW(),
                          last_used       TIMESTAMP NOT NULL DEFAULT NOW(),
                          PRIMARY KEY (app_id, table_name, condition) /* This unqique index limits the condition column value to be less than 'SELECT current_setting('block_size'); */
                      );
                      COMMENT ON TABLE prostgles.app_triggers IS 'Tables and conditions that are currently subscribed/synced';


                      CREATE OR REPLACE VIEW prostgles.v_triggers AS
                      SELECT *
                        , (ROW_NUMBER() OVER( ORDER BY table_name, condition ))::text AS id 
                        , ROW_NUMBER() OVER(PARTITION BY app_id, table_name ORDER BY table_name, condition ) - 1 AS c_id
                      FROM prostgles.app_triggers;
                      COMMENT ON VIEW prostgles.v_triggers IS 'Augment trigger table with natural IDs and per app IDs';


                      CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.data_watch_func}() RETURNS TRIGGER 
                      AS $$
              
                          DECLARE t_ids TEXT[];
                          DECLARE c_ids INTEGER[];  
                          DECLARE err_c_ids INTEGER[]; 
                          DECLARE unions TEXT := '';          
                          DECLARE query TEXT := '';            
                          DECLARE nrw RECORD;               
                          DECLARE erw RECORD;     
                          DECLARE has_errors BOOLEAN := FALSE;
                          
                          DECLARE err_text    TEXT;
                          DECLARE err_detail  TEXT;
                          DECLARE err_hint    TEXT;
                          
                          BEGIN

                              -- PERFORM pg_notify('debug', concat_ws(' ', 'TABLE', TG_TABLE_NAME, TG_OP));

                              SELECT string_agg(
                                concat_ws(
                                  E' UNION \n ',
                                  CASE WHEN (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN (p1 || ' old_table ' || p2) END,
                                  CASE WHEN (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN (p1 || ' new_table ' || p2) END 
                                ),
                                E' UNION \n '::text
                              )
                              INTO unions
                              FROM (
                                  SELECT 
                                      CASE WHEN related_view_name IS NOT NULL 
                                        /* E' is used to ensure line breaks are not escaped */
                                        THEN format(E'WITH %I AS (\n %s \n) ', 'view_nDme', 'select 1 as view_definition')
                                      ELSE 
                                        '' 
                                      END ||
                                      $z$ 
                                        SELECT CASE WHEN EXISTS( SELECT 1 FROM 
                                      $z$ AS p1,
                                      format( 
                                        $c$ 
                                          as %I WHERE %s ) THEN %s::text END AS t_ids 
                                        $c$, 
                                        table_name, condition, id 
                                      ) AS p2
                                  FROM prostgles.v_triggers
                                  WHERE table_name = TG_TABLE_NAME
                              ) t; 

                              IF unions IS NOT NULL THEN
                                  query = format(
                                      $s$
                                        SELECT ARRAY_AGG(DISTINCT t.t_ids)
                                        FROM ( %s ) t
                                      $s$, 
                                      unions
                                  );

                                  BEGIN
                                    EXECUTE query INTO t_ids;

                                    --RAISE NOTICE 'trigger fired ok';

                                  EXCEPTION WHEN OTHERS THEN
                                    
                                    has_errors := TRUE;

                                    GET STACKED DIAGNOSTICS 
                                      err_text = MESSAGE_TEXT,
                                      err_detail = PG_EXCEPTION_DETAIL,
                                      err_hint = PG_EXCEPTION_HINT;


                                  END;

                                  --RAISE NOTICE 'has_errors: % ', has_errors;
                                  --RAISE NOTICE 'unions: % , cids: %', unions, c_ids;

                                  IF (t_ids IS NOT NULL OR has_errors) THEN

                                      FOR nrw IN
                                          SELECT app_id, string_agg(c_id::text, ',') as cids
                                          FROM prostgles.v_triggers
                                          WHERE id = ANY(t_ids) 
                                          OR has_errors
                                          GROUP BY app_id
                                      LOOP
                                          
                                          PERFORM pg_notify( 
                                            ${asValue(this.NOTIF_CHANNEL.preffix)} || nrw.app_id , 
                                            concat_ws(
                                              ${asValue(PubSubManager.DELIMITER)},

                                              ${asValue(this.NOTIF_TYPE.data)}, 
                                              COALESCE(TG_TABLE_NAME, 'MISSING'), 
                                              COALESCE(TG_OP, 'MISSING'), 
                                              CASE WHEN has_errors 
                                                THEN concat_ws('; ', 'error', err_text, err_detail, err_hint ) 
                                                ELSE COALESCE(nrw.cids, '') 
                                              END
                                              ${this.dboBuilder.prostgles.opts.DEBUG_MODE? ("--, (select json_agg(t)::TEXT FROM (SELECT * from old_table) t), query") : ""}
                                            )
                                          );
                                      END LOOP;


                                      IF has_errors THEN

                                          DELETE FROM prostgles.app_triggers;
                                          RAISE NOTICE 'trigger dropped due to exception: % % %', err_text, err_detail, err_hint;

                                      END IF;

                                      
                                  END IF;
                              END IF;

      
                              RETURN NULL;
                              
                      /*
                          EXCEPTION WHEN OTHERS THEN 
                              DELETE FROM prostgles.app_triggers; -- delete all or will need to loop through all conditions to find issue;
                              RAISE NOTICE 'trigger dropped due to exception';
                              ${"--EXCEPTION_WHEN_COLUMN_WAS_RENAMED_THEN_DROP_TRIGGER"};
                          
                              

                              RETURN NULL; 
                      */
                          END;

                      --COMMIT;
                      $$ LANGUAGE plpgsql;
                      COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.data_watch_func} IS 'Prostgles internal function used to notify when data in the table changed';



                      CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.trigger_add_remove_func}() RETURNS TRIGGER 
                      AS $$
              
                          DECLARE operations TEXT[] := ARRAY['insert', 'update', 'delete'];
                          DECLARE op TEXT;
                          DECLARE query TEXT;
                          DECLARE trw RECORD;            
                          
                          BEGIN


                              --RAISE NOTICE 'prostgles.app_triggers % ', TG_OP;

                              /* If no other listeners on table then DROP triggers */
                              IF TG_OP = 'DELETE' THEN

                                  --RAISE NOTICE 'DELETE trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.app_triggers) , ' 0 ');
                                  --RAISE NOTICE 'DELETE trigger_add_remove_func old_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM old_table), ' 0 ');

                                  
                                  /* Drop actual triggers if needed */
                                  FOR trw IN 
                                      SELECT DISTINCT table_name FROM old_table ot
                                      WHERE NOT EXISTS (
                                          SELECT 1 FROM prostgles.app_triggers t 
                                          WHERE t.table_name = ot.table_name
                                      ) 
                                  LOOP

                                      FOREACH op IN ARRAY operations
                                      LOOP 
                                          --RAISE NOTICE ' DROP DATA TRIGGER FOR:  % ', trw.table_name;
                                          EXECUTE format(' DROP TRIGGER IF EXISTS %I ON %I ;' , 'prostgles_triggers_' || trw.table_name || '_' || op, trw.table_name);
                                      END LOOP;
                                                   
                                  END LOOP;

                              /* If newly added listeners on table then CREATE triggers */
                              ELSIF TG_OP = 'INSERT' THEN
                                   

                                  --RAISE NOTICE 'INSERT trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.triggers) , ' 0 ');
                                  --RAISE NOTICE 'INSERT trigger_add_remove_func new_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM new_table), ' 0 ');

                                  /* Loop through newly added tables */
                                  FOR trw IN  

                                      SELECT DISTINCT table_name 
                                      FROM new_table nt

                                      /* Table did not exist prior to this insert */
                                      WHERE NOT EXISTS (
                                          SELECT 1 
                                          FROM prostgles.app_triggers t 
                                          WHERE t.table_name = nt.table_name
                                          AND   t.inserted   < nt.inserted    -- exclude current record (this is an after trigger). Turn into before trigger?
                                      )

                                      /* Table is valid */
                                      AND  EXISTS (
                                          SELECT 1 
                                          FROM information_schema.tables 
                                          WHERE  table_schema = 'public'
                                          AND    table_name   = nt.table_name
                                      )
                                  LOOP
                                   
                                      /*
                                          RAISE NOTICE ' CREATE DATA TRIGGER FOR:  % TABLE EXISTS?', trw.table_name, SELECT EXISTS (
                                              SELECT 1 
                                              FROM information_schema.tables 
                                              WHERE  table_schema = 'public'
                                              AND    table_name   = nt.table_name
                                          );
                                      */

                                      query := format(
                                          $q$ 
                                              DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                              CREATE TRIGGER %1$I
                                              AFTER INSERT ON %2$I
                                              REFERENCING NEW TABLE AS new_table
                                              FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                              COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                          $q$,  
                                          'prostgles_triggers_' || trw.table_name || '_insert', trw.table_name                                                
                                      ) || format(
                                          $q$ 
                                              DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                              CREATE TRIGGER %1$I
                                              AFTER UPDATE ON %2$I
                                              REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
                                              FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                              COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                          $q$,  
                                          'prostgles_triggers_' || trw.table_name || '_update', trw.table_name   
                                      ) || format(
                                          $q$ 
                                              DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                              CREATE TRIGGER %1$I
                                              AFTER DELETE ON %2$I
                                              REFERENCING OLD TABLE AS old_table
                                              FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                              COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                          $q$,
                                          'prostgles_triggers_' || trw.table_name || '_delete', trw.table_name  
                                      );

                                      --RAISE NOTICE ' % ', query;

                                      
                                      query := format(
                                          $q$
                                              DO $e$ 
                                              BEGIN

                                                  IF EXISTS (
                                                      SELECT 1 
                                                      FROM information_schema.tables 
                                                      WHERE  table_schema = 'public'
                                                      AND    table_name   = %L
                                                  ) THEN

                                                      %s

                                                  END IF;

                                              END $e$;
                                          $q$,
                                          trw.table_name,
                                          query
                                      ) ;
                                      

                                      EXECUTE query;
                                                  
                                  END LOOP;

                              END IF;

      
                              RETURN NULL;
                          END;

                      $$ LANGUAGE plpgsql;
                      COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.trigger_add_remove_func} IS 'Used to add/remove table watch triggers concurrently ';

                      DROP TRIGGER IF EXISTS prostgles_triggers_insert ON prostgles.app_triggers;
                      CREATE TRIGGER prostgles_triggers_insert
                      AFTER INSERT ON prostgles.app_triggers
                      REFERENCING NEW TABLE AS new_table
                      FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.trigger_add_remove_func}();
                    
                      DROP TRIGGER IF EXISTS prostgles_triggers_delete ON prostgles.app_triggers;
                      CREATE TRIGGER prostgles_triggers_delete
                      AFTER DELETE ON prostgles.app_triggers
                      REFERENCING OLD TABLE AS old_table
                      FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.trigger_add_remove_func}();
                    

                      CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.schema_watch_func}() RETURNS event_trigger AS $$
                          
                          DECLARE curr_query TEXT := '';                                       
                          DECLARE arw RECORD;
                          
                          BEGIN
                          
                              --RAISE NOTICE 'SCHEMA_WATCH: %', tg_tag;
                  
                              /* 
                                This event trigger will outlive a prostgles app instance. 
                                Must ensure it only fires if an app instance is running  
                              */
                              IF
                                EXISTS (
                                  SELECT 1 
                                  FROM information_schema.tables 
                                  WHERE  table_schema = 'prostgles'
                                  AND    table_name   = 'apps'
                                )          
                              THEN

                                  SELECT LEFT(COALESCE(current_query(), ''), 5000)
                                  INTO curr_query;
                                  
                                  FOR arw IN 
                                    SELECT * FROM prostgles.apps WHERE watching_schema IS TRUE

                                  LOOP
                                    PERFORM pg_notify( 
                                      ${asValue(this.NOTIF_CHANNEL.preffix)} || arw.id, 
                                      concat_ws(
                                        ${asValue(PubSubManager.DELIMITER)}, 
                                        ${asValue(this.NOTIF_TYPE.schema)}, tg_tag , TG_event, curr_query
                                      )
                                    );
                                  END LOOP;

                              END IF;

                          END;
                      $$ LANGUAGE plpgsql;
                      COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.schema_watch_func} IS 'Prostgles internal function used to notify when schema has changed';

                  END IF;

              END
              $do$;


              COMMIT;
          `;

    // const prgl_exists = await this.db.oneOrNone(`
    //     DROP SCHEMA IF EXISTS prostgles CASCADE;
    //     SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles'
    // `);

    // if(!prgl_exists){
    //     await this.db.any(q); 
    // }
    await this.db.any(initQuery);
    if (!this.canContinue()) return;


    /* Prepare App id */
    if (!this.appID) {
      const raw = await this.db.one(
        "INSERT INTO prostgles.apps (check_frequency_ms, watching_schema, application_name) VALUES($1, $2, current_setting('application_name')) RETURNING *; "
        , [this.appCheckFrequencyMS, Boolean(this.onSchemaChange)]
      );
      this.appID = raw.id;

      if (!this.appCheck) {

        this.appCheck = setInterval(async () => {
          let appQ = "";
          try {   //  drop owned by api

            this.appChecking = true;

            let trgUpdateLastUsed = "",
              listeners = this.getActiveListeners();

            if (listeners.length) {
              trgUpdateLastUsed = `
                UPDATE prostgles.app_triggers
                SET last_used = CASE WHEN (table_name, condition) IN (
                    ${listeners.map(l => ` ( ${asValue(l.table_name)}, ${asValue(l.condition)} ) `).join(", ")}
                ) THEN NOW() ELSE last_used END
                WHERE app_id = ${asValue(this.appID)};
              `;
            }

            appQ = `
                          
                              DO $$
                              BEGIN

                                  /* ${REALTIME_TRIGGER_CHECK_QUERY} */
                                  /* prostgles schema must exist */
                                  IF
                                      EXISTS (
                                          SELECT 1 
                                          FROM information_schema.tables 
                                          WHERE  table_schema = 'prostgles'
                                          AND    table_name   = 'apps'
                                      )
                                  THEN

  
                                      /* Concurrency control to avoid deadlock 
                                      IF NOT EXISTS (
                                          SELECT 1 FROM prostgles.apps
                                          WHERE last_check < last_check_ended
                                          AND last_check_ended > NOW() - interval '5 minutes'
                                      ) THEN
                                      */
                                          UPDATE prostgles.apps 
                                          SET last_check = NOW()
                                          WHERE id = ${asValue(this.appID)};


  
                                          /* Delete unused triggers. Might deadlock */
                                          IF EXISTS ( SELECT 1 FROM prostgles.app_triggers)

                                              /* If this is the latest app then proceed
                                                  AND ( 
                                                      SELECT id = ${asValue(this.appID)} 
                                                      FROM prostgles.apps 
                                                      ORDER BY last_check DESC 
                                                      LIMIT 1  
                                                  ) = TRUE
                                              */
                                              
                                          THEN
  
                                              /* TODO: Fixed deadlocks */
                                              --LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;
  
                                              /* UPDATE currently used triggers */
                                              ${trgUpdateLastUsed}
  
                                              /* DELETE stale triggers for current app. Other triggers will be deleted on app startup */
                                              DELETE FROM prostgles.app_triggers
                                              WHERE app_id = ${asValue(this.appID)}
                                              AND last_used < NOW() - 4 * ${asValue(this.appCheckFrequencyMS)} * interval '1 millisecond'; -- 10 seconds at the moment
  
                                          END IF;



                                          UPDATE prostgles.apps 
                                          SET last_check_ended = NOW()
                                          WHERE id = ${asValue(this.appID)};

                                      /*
                                      END IF;    
                                      */

  
                                  END IF;

                              -- must not commit without a lock
                              --COMMIT;
                              END $$;
                          `
            await this.db.any(appQ);
            log("updated last_check");
          } catch (e: any) {
            /** In some cases a query idles and blocks everything else. Terminate all similar queries */
            this.db.any("SELECT state, pg_terminate_backend(pid) from pg_stat_activity WHERE query ilike ${qid} and pid <>  pg_backend_pid();", { qid: "%" + REALTIME_TRIGGER_CHECK_QUERY + "%" });

            /** If this database was dropped then stop interval */
            if(e?.code === "3D000"){ //  && e.message.includes(this.db.$cn.database)
              clearInterval(this.appCheck);
            }
            console.error("appCheck FAILED: \n", e, appQ);
          }

          this.appChecking = false;
        }, 0.8 * this.appCheckFrequencyMS);
      }
    }

    this.postgresNotifListenManager = new PostgresNotifListenManager(this.db, this.notifListener, this.NOTIF_CHANNEL.getFull());

    await this.prepareTriggers()

    return this;

  } catch (e) {
    console.error("PubSubManager init failed: ", e);
  }
}