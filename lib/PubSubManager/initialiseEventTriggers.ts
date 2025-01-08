import * as pgp from "pg-promise";
import { PubSubManager } from "./PubSubManager";
import { getIsSuperUser } from "../Prostgles";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import { DELETE_DISCONNECTED_APPS_QUERY } from "./orphanTriggerCheck";
import { DB_OBJ_NAMES } from "./getPubSubManagerInitQuery";

const asValue = (v: any) => pgp.as.format("$1", [v]);

export async function initialiseEventTriggers(this: PubSubManager) {
  const { watchSchema } = this.dboBuilder.prostgles.opts;
  if (watchSchema && !(await getIsSuperUser(this.db))) {
    console.warn(
      "prostgles watchSchema requires superuser db user. Will not watch using event triggers"
    );
  }

  try {
    /** We use these names because they include schema where necessary */
    const allTableNames = Object.keys(this.dbo).filter((k) => this.dbo[k]?.tableOrViewInfo);
    const tableFilterQuery =
      allTableNames.length ?
        `OR table_name NOT IN (${allTableNames.map((tblName) => asValue(tblName)).join(", ")})`
      : "";
    const query = pgp.as.format(
      `
        BEGIN;--  ISOLATION LEVEL SERIALIZABLE;
        
        /**                                 
         * ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
         *  Drop stale triggers
         * */
        DO
        $do$
          DECLARE trg RECORD;
            q   TEXT;
            ev_trg_needed BOOLEAN := FALSE;
            ev_trg_exists BOOLEAN := FALSE;
            is_super_user BOOLEAN := FALSE;
        BEGIN

            /**
             *  Delete disconnected app records, this will delete related triggers
             * */
            ${DELETE_DISCONNECTED_APPS_QUERY};

            DELETE FROM prostgles.app_triggers
            WHERE app_id NOT IN (SELECT id FROM prostgles.apps)
            ${tableFilterQuery}
            ;
            
            /** IS THIS STILL NEEDED? Delete existing triggers without locking 
            */
              LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;
              EXECUTE format(
                $q$

                  CREATE TEMP TABLE %1$I AS --ON COMMIT DROP AS
                  SELECT * FROM prostgles.app_triggers;

                  DELETE FROM prostgles.app_triggers;

                  INSERT INTO prostgles.app_triggers
                  SELECT * FROM %1$I;

                  DROP TABLE IF EXISTS %1$I;
                $q$, 
                ${asValue("triggers_" + this.appId)}
              );
            
            ${SCHEMA_WATCH_EVENT_TRIGGER_QUERY}
            
        END
        $do$; 


        COMMIT;
      `,
      { EVENT_TRIGGER_TAGS }
    );

    await this.db
      .tx((t) => t.any(query))
      .catch((e: any) => {
        console.error("prepareTriggers failed: ", e);
        throw e;
      });

    return true;
  } catch (e) {
    console.error("prepareTriggers failed: ", e);
    throw e;
  }
}

const SCHEMA_WATCH_EVENT_TRIGGER_QUERY = `

  is_super_user := EXISTS (select 1 from pg_user where usename = CURRENT_USER AND usesuper IS TRUE);

  /* DROP the old buggy schema watch trigger */
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_event_trigger
    WHERE evtname = 'prostgles_schema_watch_trigger'
  ) AND is_super_user IS TRUE 
  THEN
    DROP EVENT TRIGGER IF EXISTS prostgles_schema_watch_trigger;
  END IF;

  ev_trg_needed := EXISTS (
    SELECT 1 FROM prostgles.apps 
    WHERE watching_schema_tag_names IS NOT NULL
  );
  ev_trg_exists := EXISTS (
    SELECT 1 FROM pg_catalog.pg_event_trigger
    WHERE evtname = ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
  );

  /* DROP stale event trigger */
  IF 
    is_super_user IS TRUE 
    AND ev_trg_needed IS FALSE 
    AND ev_trg_exists IS TRUE 
  THEN

      SELECT format(
        $$ 
          DROP EVENT TRIGGER IF EXISTS %I ; 
          DROP EVENT TRIGGER IF EXISTS %I ; 
        $$
        , ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
        , ${asValue(DB_OBJ_NAMES.schema_watch_trigger_drop)}
      )
      INTO q;
      EXECUTE q;

  /* CREATE event trigger */
  ELSIF 
      is_super_user IS TRUE 
      AND ev_trg_needed IS TRUE 
      AND ev_trg_exists IS FALSE 
  THEN

      DROP EVENT TRIGGER IF EXISTS ${DB_OBJ_NAMES.schema_watch_trigger};
      CREATE EVENT TRIGGER ${DB_OBJ_NAMES.schema_watch_trigger} 
      ON ddl_command_end
      WHEN TAG IN (\${EVENT_TRIGGER_TAGS:csv})
      EXECUTE PROCEDURE ${DB_OBJ_NAMES.schema_watch_func}();

      DROP EVENT TRIGGER IF EXISTS ${DB_OBJ_NAMES.schema_watch_trigger_drop};
      CREATE EVENT TRIGGER ${DB_OBJ_NAMES.schema_watch_trigger_drop} 
      ON sql_drop
      --WHEN TAG IN (\${EVENT_TRIGGER_TAGS:csv})
      EXECUTE PROCEDURE ${DB_OBJ_NAMES.schema_watch_func}();

  END IF;
`;
