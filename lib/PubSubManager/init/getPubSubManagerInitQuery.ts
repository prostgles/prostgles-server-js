import { tryCatchV2 } from "prostgles-types";
import { DboBuilder } from "../../DboBuilder/DboBuilder";
import { pgp } from "../../DboBuilder/DboBuilderTypes";
import {
  asValue,
  DELIMITER,
  EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID,
  NOTIF_CHANNEL,
  NOTIF_TYPE,
} from "../PubSubManagerUtils";
import { getAppCheckQuery } from "../orphanTriggerCheck";
import { version } from "../../../package.json";
import { getDataWatchFunctionQuery } from "./getDataWatchFunctionQuery";

export const DB_OBJ_NAMES = {
  trigger_add_remove_func: "prostgles.trigger_add_remove_func",
  data_watch_func: "prostgles.prostgles_trigger_function",
  schema_watch_func: "prostgles.schema_watch_func",
  schema_watch_trigger: "prostgles_schema_watch_trigger_new",
  schema_watch_trigger_drop: "prostgles_schema_watch_trigger_new_drop",
} as const;

const PROSTGLES_SCHEMA_EXISTS_QUERY = `
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_schema = 'prostgles'
  AND   table_name   = 'versions'
  AND   column_name   = 'schema_md5'
`;
const PROSTGLES_SCHEMA_VERSION_OK_QUERY = `
  SELECT 1 
  FROM prostgles.versions
  WHERE (string_to_array(version, '.')::int[] > string_to_array(\${version}, '.')::int[])
  OR (string_to_array(version, '.')::int[] = string_to_array(\${version}, '.')::int[])
  AND schema_md5 = \${schema_md5}
`;

const getInitQuery = (debugMode: boolean | undefined, pgVersion: number) => {
  const canReplaceTriggers = pgVersion >= 140006;
  const createTriggerQuery =
    canReplaceTriggers ?
      `CREATE OR REPLACE TRIGGER %1$I`
    : `
    DROP TRIGGER IF EXISTS %1$I ON %2$s;
    CREATE TRIGGER %1$I
    `;

  return `
BEGIN; -- TRANSACTION ISOLATION LEVEL SERIALIZABLE;

--SET  TRANSACTION ISOLATION LEVEL SERIALIZABLE;

/* 
* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
*/

DO
$do$
BEGIN

    /* Drop older version.  */
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') THEN

      /* The seemingly useless IF nesting is done to prevent pg evaluating the entire condition and throw a 'schema_md5 column does not exist' */
      IF
        /* Backwards compatibility. Cannot check schema version */
        NOT EXISTS(
          ${PROSTGLES_SCHEMA_EXISTS_QUERY}
        )
      THEN
        DROP SCHEMA IF EXISTS prostgles CASCADE;
      ELSIF
        /* There is no newer version or same same version but different schema */
        NOT EXISTS (
          ${PROSTGLES_SCHEMA_VERSION_OK_QUERY}
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
        VALUES(${asValue(version)}, \${schema_md5}) 
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
 
        CREATE OR REPLACE FUNCTION prostgles.user_id()
        RETURNS UUID AS $$ 
        BEGIN
          RETURN prostgles.user('id')::UUID;
        END;
        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION prostgles.user_id IS 'Session user id';

        CREATE OR REPLACE FUNCTION prostgles.user_type()
        RETURNS TEXT AS $$ 
        BEGIN
          RETURN prostgles.user('type')::TEXT;
        END;
        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION prostgles.user_type IS 'Session user type'; 

        CREATE TABLE IF NOT EXISTS prostgles.apps (
          id                  TEXT PRIMARY KEY DEFAULT prostgles.random_string(),
          added               TIMESTAMP DEFAULT NOW(),
          application_name    TEXT,
          watching_schema_tag_names     _TEXT,
          check_frequency_ms  INTEGER NOT NULL  
        );
        COMMENT ON TABLE prostgles.apps IS 'Keep track of prostgles server apps connected to db to combine common triggers. Heartbeat used due to no logout triggers in postgres';

        CREATE TABLE IF NOT EXISTS prostgles.app_triggers (
          app_id          TEXT NOT NULL,
          table_name      TEXT NOT NULL,
          condition       TEXT NOT NULL,
          condition_hash  TEXT NOT NULL,
          
          /** If defined, will check which columns changed which will then be used in the sub notification logic */
          columns_info    JSONB ,

          /* The view from the root subscription, found in the condition.
              We need this because old_table/new_table data is not reflected in the view inside the AFTER trigger
          */
          related_view_name     TEXT, 
          related_view_def      TEXT, /* view definition */

          inserted        TIMESTAMP NOT NULL DEFAULT NOW(),
          last_used       TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (app_id, table_name, condition_hash)
        );
        COMMENT ON TABLE prostgles.app_triggers IS 'Tables and conditions that are currently subscribed/synced';


        CREATE OR REPLACE VIEW prostgles.v_triggers AS
        SELECT *
          , (ROW_NUMBER() OVER( ORDER BY table_name, condition ))::text AS id 
          , ROW_NUMBER() OVER(PARTITION BY app_id, table_name ORDER BY table_name, condition ) - 1 AS c_id
        FROM prostgles.app_triggers;
        COMMENT ON VIEW prostgles.v_triggers IS 'Augment trigger table with natural IDs and per app IDs';

        ${getDataWatchFunctionQuery(debugMode)}

        CREATE OR REPLACE FUNCTION ${DB_OBJ_NAMES.trigger_add_remove_func}() RETURNS TRIGGER 
        AS $$

            DECLARE operations TEXT[] := ARRAY['insert', 'update', 'delete'];
            DECLARE op TEXT;
            DECLARE query TEXT;
            DECLARE trg_name TEXT;
            DECLARE trw RECORD;           
            DECLARE app RECORD; 
            DECLARE start_time BIGINT;
            DECLARE changed_triggers_count integer;        
            
            BEGIN
                
                start_time := EXTRACT(EPOCH FROM now()) * 1000;

                --RAISE NOTICE 'prostgles.app_triggers % ', TG_OP;

                /* If no other listeners (app_triggers) left on table then DISABLE actual table data watch triggers */
                IF TG_OP = 'DELETE' THEN

                    --RAISE NOTICE 'DELETE trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.app_triggers) , ' 0 ');
                    --RAISE NOTICE 'DELETE trigger_add_remove_func old_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM old_table), ' 0 ');
                    
                    SELECT count(*) 
                    FROM old_table 
                    INTO changed_triggers_count;
                    
                    /* Disable actual triggers if needed */
                    FOR trw IN 
                        SELECT DISTINCT table_name 
                        FROM old_table ot
                        WHERE NOT EXISTS (
                          SELECT 1 
                          FROM prostgles.app_triggers t 
                          WHERE t.table_name = ot.table_name
                        )
                        AND EXISTS (
                          SELECT trigger_name 
                          FROM information_schema.triggers 
                          WHERE trigger_name IN (
                            concat_ws('_', 'prostgles_triggers', table_name, 'insert'),
                            concat_ws('_', 'prostgles_triggers', table_name, 'update'),
                            concat_ws('_', 'prostgles_triggers', table_name, 'delete')
                          )
                        )
                    LOOP

                        FOREACH op IN ARRAY operations
                        LOOP 
                            trg_name := concat_ws('_', 'prostgles_triggers', trw.table_name, op);
                             
                            EXECUTE format(' ALTER TABLE %s DISABLE TRIGGER %I ;', trw.table_name, trg_name);
                        END LOOP;
                                      
                    END LOOP;

                /* If newly added listeners on table then CREATE table data watch triggers */
                ELSIF TG_OP = 'INSERT' THEN
                      
                    SELECT count(*) 
                    FROM new_table 
                    INTO changed_triggers_count;
 
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

                        /* Table is valid 
                        AND  EXISTS (
                            SELECT 1 
                            FROM information_schema.tables 
                            WHERE  table_schema = 'public'
                            AND    table_name   = nt.table_name
                        )
                        */
                    LOOP

                        IF (
                          SELECT COUNT(*) 
                          FROM information_schema.triggers
                          WHERE trigger_name IN (
                            'prostgles_triggers_' || trw.table_name || '_insert',
                            'prostgles_triggers_' || trw.table_name || '_update',
                            'prostgles_triggers_' || trw.table_name || '_delete'
                          )
                        ) = 3
                        THEN
                          query := concat_ws(E'\n', 
                            format(' ALTER TABLE %s ENABLE TRIGGER %I ;', trw.table_name, 'prostgles_triggers_' || trw.table_name || '_insert'),
                            format(' ALTER TABLE %s ENABLE TRIGGER %I ;', trw.table_name, 'prostgles_triggers_' || trw.table_name || '_update'),
                            format(' ALTER TABLE %s ENABLE TRIGGER %I ;', trw.table_name, 'prostgles_triggers_' || trw.table_name || '_delete')
                          );
                        ELSE 

                          query := format(
                              $q$ 
                                  ${createTriggerQuery}
                                  AFTER INSERT ON %2$s
                                  REFERENCING NEW TABLE AS new_table
                                  FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}();
                                  /* removed to allow less privileges for a user to create subscriptions
                                    COMMENT ON TRIGGER %1$I ON %2$s IS 'Prostgles internal trigger used to notify when data in the table changed';
                                  */
                              $q$,  
                              'prostgles_triggers_' || trw.table_name || '_insert', 
                              trw.table_name                                                
                          ) ||
                          format(
                              $q$ 
                                ${createTriggerQuery}
                                AFTER UPDATE ON %2$s
                                REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
                                FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}();
                              $q$,  
                              'prostgles_triggers_' || trw.table_name || '_update', 
                              trw.table_name   
                          ) || 
                          format(
                              $q$ 
                                  ${createTriggerQuery}
                                  AFTER DELETE ON %2$s
                                  REFERENCING OLD TABLE AS old_table
                                  FOR EACH STATEMENT EXECUTE PROCEDURE ${DB_OBJ_NAMES.data_watch_func}(); 
                              $q$,
                              'prostgles_triggers_' || trw.table_name || '_delete', 
                              trw.table_name  
                          );
                        END IF;


                        --RAISE NOTICE ' % ', query;

                        
                        query := format(
                            $q$
                                DO $e$ 
                                BEGIN
                                    /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
                                    %s

                                END $e$;
                            $q$,
                            query
                        ) ;
                        

                        EXECUTE query;
                                    
                    END LOOP;

                END IF;

                /** Notify all apps about trigger table change */
                IF changed_triggers_count > 0 THEN
                  FOR app IN 
                    SELECT * FROM prostgles.apps
                  LOOP
                    PERFORM pg_notify( 
                      ${asValue(NOTIF_CHANNEL.preffix)} || app.id, 
                      LEFT(concat_ws(
                        ${asValue(DELIMITER)}, 
                        ${asValue(NOTIF_TYPE.data_trigger_change)},
                        json_build_object(
                          'TG_OP', TG_OP, 
                          'duration', (EXTRACT(EPOCH FROM now()) * 1000) - start_time,
                          'query', ${debugMode ? "LEFT(current_query(), 400)" : "'Only shown in debug mode'"}
                        )
                      )::TEXT, 7999/4)
                    );
                  END LOOP;
                END IF;

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
            DECLARE objects_changed BOOLEAN := false;   
            
            BEGIN

                IF TG_event = 'ddl_command_end' THEN
                  objects_changed := EXISTS (
                    SELECT * 
                    FROM pg_event_trigger_ddl_commands()
                  );
                END IF;
                IF TG_event = 'sql_drop' THEN
                  objects_changed := EXISTS (
                    SELECT * 
                    FROM pg_event_trigger_dropped_objects()
                  );
                END IF;
    
                /* 
                  This event trigger will outlive a prostgles app instance. 
                  Must ensure it only fires if an app instance is running  
                */
                IF
                  objects_changed 
                  AND EXISTS (
                    SELECT 1 
                    FROM information_schema.tables 
                    WHERE  table_schema = 'prostgles'
                    AND    table_name   = 'apps'
                  )          
                THEN

                    SELECT LEFT(COALESCE(current_query(), ''), 5000)
                    INTO curr_query;
                    
                    FOR app IN 
                      SELECT * 
                      FROM prostgles.apps 
                      WHERE tg_tag = ANY(watching_schema_tag_names)
                      AND curr_query NOT ILIKE '%${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}%'
                    LOOP
                      PERFORM pg_notify( 
                        ${asValue(NOTIF_CHANNEL.preffix)} || app.id, 
                        LEFT(concat_ws(
                          ${asValue(DELIMITER)}, 
                          ${asValue(NOTIF_TYPE.schema)}, 
                          tg_tag , 
                          TG_event, 
                          ${debugMode ? "curr_query" : "'Only shown in debug mode'"}
                        ), 7999/4)
                      );
                    END LOOP;

                    ${getAppCheckQuery()}

                END IF;

            END;
        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION ${DB_OBJ_NAMES.schema_watch_func} IS 'Prostgles internal function used to notify when schema has changed';

    END IF;

END
$do$;

COMMIT;
`;
};

/**
 * Initialize the prostgles schema and functions needed for realtime data and schema changes
 * undefined returned if the database contains the apropriate prostgles schema
 */
export const getPubSubManagerInitQuery = async function (
  this: DboBuilder
): Promise<string | undefined> {
  const versionNum = await this.db.one("SELECT current_setting('server_version_num')::int as val");
  const initQuery = getInitQuery(this.prostgles.opts.DEBUG_MODE, versionNum.val);
  const { schema_md5 = "none" } = await this.db.oneOrNone("SELECT md5($1) as schema_md5", [
    initQuery.trim(),
  ]);
  const query = pgp.as.format(initQuery, { schema_md5, version });
  const existingSchema = await this.db.any(PROSTGLES_SCHEMA_EXISTS_QUERY);
  if (!existingSchema.length) {
    console.log("getPubSubManagerInitQuery: No prostgles.versions table found. Creating...");
    return query;
  }
  const { data: existingSchemaVersions } = await tryCatchV2(async () => {
    const existingSchemaVersions = await this.db.any(PROSTGLES_SCHEMA_VERSION_OK_QUERY, {
      schema_md5,
      version,
    });
    return existingSchemaVersions;
  });
  if (!existingSchemaVersions?.length) {
    console.log("getPubSubManagerInitQuery: Outdated prostgles schema. Re-creating...");
    return query;
  }

  return undefined;
};
