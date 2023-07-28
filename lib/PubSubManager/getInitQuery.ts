
import { asValue, PubSubManager } from "./PubSubManager";
const { version } = require("../../package.json");

export const DB_OBJ_NAMES = {
  trigger_add_remove_func: "prostgles.trigger_add_remove_func",
  data_watch_func: "prostgles.prostgles_trigger_function",
  schema_watch_func: "prostgles.schema_watch_func",
  schema_watch_trigger: "prostgles_schema_watch_trigger_new"
} as const;

export const getInitQuery = async function(this: PubSubManager): Promise<string> { 

  const getQuery = async (withoutHash = false): Promise<string> => {
    const { schema_md5 = "none" } = withoutHash? {} : await this.db.oneOrNone("SELECT md5($1) as schema_md5", [await getQuery(true)]);
    
    return `

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

    /* Drop older version.  */
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') THEN

      /* The seemingly useless IF nesting is done to prevent pg evaluating the entire condition and throw a 'schema_md5 column does not exist' */
      IF
        /* Cannot check schema version */
        NOT EXISTS(
          SELECT 1 
          FROM information_schema.columns 
          WHERE  table_schema = 'prostgles'
          AND    table_name   = 'versions'
          AND   column_name   = 'schema_md5'
        )
      THEN
        DROP SCHEMA IF EXISTS prostgles CASCADE;
      ELSIF
        /* There is no newer schema */
        NOT EXISTS(
          SELECT 1 
          FROM prostgles.versions
          WHERE schema_md5 <> ${asValue(schema_md5)}
          AND version >= ${asValue(version)}
        )
      THEN
        DROP SCHEMA IF EXISTS prostgles CASCADE;

      END IF;

    END IF;


    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.schemata 
        WHERE schema_name = 'prostgles'
      ) 
    THEN 

        CREATE SCHEMA IF NOT EXISTS prostgles;
        COMMENT ON SCHEMA prostgles IS 'Used by prostgles-server to enable data/schema change tracking through subscribe/sync/watchSchema';

        CREATE TABLE IF NOT EXISTS prostgles.versions(
          version TEXT PRIMARY KEY,
          schema_md5 TEXT NOT NULL,
          added_at TIMESTAMP NOT NULL DEFAULT now()
        );
        COMMENT ON TABLE prostgles.versions IS 'Stores the prostgles schema creation query hash and package version number to identify when a newer schema needs to be re-created';

        INSERT INTO prostgles.versions(version, schema_md5) 
        VALUES(${asValue(version)}, ${asValue(schema_md5)}) 
        ON CONFLICT DO NOTHING;


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


        CREATE OR REPLACE FUNCTION prostgles.user(key text default null)
        RETURNS TEXT AS $$
        DECLARE user_text text;
        DECLARE user_jsonb JSONB = '{}'::JSONB;
        BEGIN
          user_text := current_setting('prostgles.user', true);
          IF length(user_text) > 0 THEN
            user_jsonb := user_text::JSONB;
          END IF;
        
          IF length(key) > 0 THEN
            RETURN jsonb_extract_path(user_jsonb, key);
          END IF;
          RETURN user_jsonb;
        END;
        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION prostgles."user" IS 'Used for row level security';

        CREATE TABLE IF NOT EXISTS prostgles.apps (
          id                  TEXT PRIMARY KEY DEFAULT prostgles.random_string(),
          added               TIMESTAMP DEFAULT NOW(),
          application_name    TEXT,
          last_check          TIMESTAMP NOT NULL DEFAULT NOW(),
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
          PRIMARY KEY (app_id, table_name, condition) /* This unique index limits the condition column value to be less than 'SELECT current_setting('block_size'); */
        );
        COMMENT ON TABLE prostgles.app_triggers IS 'Tables and conditions that are currently subscribed/synced';


        CREATE OR REPLACE VIEW prostgles.v_triggers AS
        SELECT *
          , (ROW_NUMBER() OVER( ORDER BY table_name, condition ))::text AS id 
          , ROW_NUMBER() OVER(PARTITION BY app_id, table_name ORDER BY table_name, condition ) - 1 AS c_id
        FROM prostgles.app_triggers;
        COMMENT ON VIEW prostgles.v_triggers IS 'Augment trigger table with natural IDs and per app IDs';


        CREATE OR REPLACE FUNCTION ${DB_OBJ_NAMES.data_watch_func}() RETURNS TRIGGER 
        AS $$

            DECLARE t_ids TEXT[];
            DECLARE c_ids INTEGER[];  
            DECLARE err_c_ids INTEGER[]; 
            DECLARE unions TEXT := '';          
            DECLARE query TEXT := '';            
            DECLARE v_trigger RECORD;
            DECLARE has_errors BOOLEAN := FALSE;
            
            DECLARE err_text    TEXT;
            DECLARE err_detail  TEXT;
            DECLARE err_hint    TEXT;
                    
            DECLARE view_def_query TEXT := '';   

            BEGIN

                -- PERFORM pg_notify('debug', concat_ws(' ', 'TABLE', TG_TABLE_NAME, TG_OP));

                SELECT string_agg(
                  format(
                    $c$ 
                      SELECT CASE WHEN EXISTS( 
                        SELECT 1 FROM %I WHERE %s 
                      ) THEN %s::text END AS t_ids 
                    $c$, 
                    table_name, 
                    condition, 
                    id 
                  ),
                  E' UNION \n ' 
                ) 
                INTO unions
                FROM prostgles.v_triggers
                WHERE table_name = TG_TABLE_NAME;


                /* unions = 'old_table union new_table' or any one of the tables */
                IF unions IS NOT NULL THEN

                    SELECT  
                      format(
                        E'WITH %I AS (\n %s \n) ', 
                        TG_TABLE_NAME, 
                        concat_ws(
                          E' UNION ALL \n ',
                          CASE WHEN (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN ' SELECT * FROM old_table ' END,
                          CASE WHEN (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN ' SELECT * FROM new_table ' END 
                        )
                      ) 
                      || 
                      COALESCE((
                        SELECT ', ' || string_agg(format(E' %I AS ( \n %s \n ) ', related_view_name, related_view_def), ', ')
                        FROM (
                          SELECT DISTINCT related_view_name, related_view_def 
                          FROM prostgles.v_triggers
                          WHERE table_name = TG_TABLE_NAME
                          AND related_view_name IS NOT NULL
                          AND related_view_def  IS NOT NULL
                        ) t
                      ), '')
                      || 
                      format(
                        $c$
                            SELECT ARRAY_AGG(DISTINCT t.t_ids)
                            FROM ( 
                              %s 
                            ) t
                        $c$, unions
                      )
                    INTO query; 

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

                        FOR v_trigger IN
                            SELECT app_id, string_agg(c_id::text, ',') as cids
                            FROM prostgles.v_triggers
                            WHERE id = ANY(t_ids) 
                            OR has_errors
                            GROUP BY app_id
                        LOOP
                            
                            PERFORM pg_notify( 
                              ${asValue(this.NOTIF_CHANNEL.preffix)} || v_trigger.app_id , 
                              LEFT(concat_ws(
                                ${asValue(PubSubManager.DELIMITER)},

                                ${asValue(this.NOTIF_TYPE.data)}, 
                                COALESCE(TG_TABLE_NAME, 'MISSING'), 
                                COALESCE(TG_OP, 'MISSING'), 
                                CASE WHEN has_errors 
                                  THEN concat_ws('; ', 'error', err_text, err_detail, err_hint, 'query: ' || query ) 
                                  ELSE COALESCE(v_trigger.cids, '') 
                                END
                                ${this.dboBuilder.prostgles.opts.DEBUG_MODE? (", COALESCE(current_query(), 'current_query ??'), (select json_agg(t)::TEXT FROM (SELECT * from old_table) t), query") : ""}
                              ), 7999/4) -- Some chars are 2bytes -> 'Ω'
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
        COMMENT ON FUNCTION ${DB_OBJ_NAMES.data_watch_func} IS 'Prostgles internal function used to notify when data in the table changed';

        CREATE OR REPLACE FUNCTION ${DB_OBJ_NAMES.trigger_add_remove_func}() RETURNS TRIGGER 
        AS $$

            DECLARE operations TEXT[] := ARRAY['insert', 'update', 'delete'];
            DECLARE op TEXT;
            DECLARE query TEXT;
            DECLARE trw RECORD;            
            DECLARE start_time BIGINT;            
            
            BEGIN
                
                start_time := EXTRACT(EPOCH FROM now()) * 1000;

                --RAISE NOTICE 'prostgles.app_triggers % ', TG_OP;

                /* If no other listeners (app_triggers) left on table then DROP actual table data watch triggers */
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

                /* If newly added listeners on table then CREATE table data watch triggers */
                ELSIF TG_OP = 'INSERT' THEN
                      

                    --RAISE NOTICE 'INSERT trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.triggers) , ' 0 ');
                    --RAISE NOTICE 'INSERT trigger_add_remove_func new_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM new_table), ' 0 ');

                    /* Loop through newly added tables to add data watch triggers */
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
                                FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}();
                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                            $q$,  
                            'prostgles_triggers_' || trw.table_name || '_insert', trw.table_name                                                
                        ) || format(
                            $q$ 
                                DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                CREATE TRIGGER %1$I
                                AFTER UPDATE ON %2$I
                                REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
                                FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}();
                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                            $q$,  
                            'prostgles_triggers_' || trw.table_name || '_update', trw.table_name   
                        ) || format(
                            $q$ 
                                DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                CREATE TRIGGER %1$I
                                AFTER DELETE ON %2$I
                                REFERENCING OLD TABLE AS old_table
                                FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}();
                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                            $q$,
                            'prostgles_triggers_' || trw.table_name || '_delete', trw.table_name  
                        );

                        --RAISE NOTICE ' % ', query;

                        
                        query := format(
                            $q$
                                DO $e$ 
                                BEGIN
                                    /* ${ PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
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

                /** Notify all apps about trigger table change */
                PERFORM pg_notify( 
                  ${asValue(this.NOTIF_CHANNEL.preffix)}, 
                  LEFT(concat_ws(
                    ${asValue(PubSubManager.DELIMITER)}, 
                    ${asValue(this.NOTIF_TYPE.data_trigger_change)},
                    json_build_object(
                      'TG_OP',TG_OP, 
                      'TG_TAG',TG_TAG, 
                      'TG_event',TG_event,
                      'duration', (EXTRACT(EPOCH FROM now()) * 1000) - start_time
                    )
                  ), 7999/4)
                );

                RETURN NULL;
            END;

        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION ${DB_OBJ_NAMES.trigger_add_remove_func} IS 'Used to add/remove table watch triggers concurrently ';

        DROP TRIGGER IF EXISTS prostgles_triggers_insert ON prostgles.app_triggers;
        CREATE TRIGGER prostgles_triggers_insert
        AFTER INSERT ON prostgles.app_triggers
        REFERENCING NEW TABLE AS new_table
        FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.trigger_add_remove_func}();
      
        DROP TRIGGER IF EXISTS prostgles_triggers_delete ON prostgles.app_triggers;
        CREATE TRIGGER prostgles_triggers_delete
        AFTER DELETE ON prostgles.app_triggers
        REFERENCING OLD TABLE AS old_table
        FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.trigger_add_remove_func}();
      

        CREATE OR REPLACE FUNCTION ${DB_OBJ_NAMES.schema_watch_func}() RETURNS event_trigger AS $$
            
            DECLARE curr_query TEXT := '';                                       
            DECLARE app RECORD;
            
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
                    
                    FOR app IN 
                      SELECT * FROM prostgles.apps WHERE watching_schema IS TRUE
                    LOOP
                      PERFORM pg_notify( 
                        ${asValue(this.NOTIF_CHANNEL.preffix)} || app.id, 
                        LEFT(concat_ws(
                          ${asValue(PubSubManager.DELIMITER)}, 
                          ${asValue(this.NOTIF_TYPE.schema)}, tg_tag , TG_event, curr_query
                        ), 7999/4)
                      );
                    END LOOP;

                END IF;

            END;
        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION ${DB_OBJ_NAMES.schema_watch_func} IS 'Prostgles internal function used to notify when schema has changed';

    END IF;

END
$do$;


COMMIT;
`};

  const res = getQuery();
  
  return res;
}