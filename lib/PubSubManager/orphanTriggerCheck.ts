import { PubSubManager } from "./PubSubManager";
import { REALTIME_TRIGGER_CHECK_QUERY } from "./initPubSubManager";

/**
 * Schema and Data watch triggers (DB_OBJ_NAMES.schema_watch_func, DB_OBJ_NAMES.data_watch_func)
 * survive and continue to user resources even after the client disconnects.
 * We must therefore delete apps that do not have active connections
 */

const queryIdentifier =
  "prostgles query used to keep track of which prgl backend clients are still connected";
const connectedApplicationNamesQuery = `
  SELECT DISTINCT application_name
  FROM prostgles.apps 
  WHERE application_name IN (
    SELECT application_name 
    FROM pg_catalog.pg_stat_activity
  )
`;

export const DELETE_DISCONNECTED_APPS_QUERY = `
  DELETE FROM prostgles.apps a
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_stat_activity s
    WHERE s.application_name = a.application_name
  )
`;

/** It is a function to prevent undefined EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID */
export const getAppCheckQuery = () => `
  /* 
    ${queryIdentifier}
    ${REALTIME_TRIGGER_CHECK_QUERY} 
    ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
  */
  IF
    /* prostgles schema must exist */
    EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE  table_schema = 'prostgles'
      AND    table_name   = 'apps'
    )
    /* Ensure we don't check in paralel */
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_stat_activity s
      WHERE s.query ilike '%${queryIdentifier}%'
      AND s.state = 'active'
    )
  THEN 

    IF EXISTS (
      ${connectedApplicationNamesQuery}
    ) THEN

      /* Remove disconnected apps */
      WITH deleted_apps AS (
        ${DELETE_DISCONNECTED_APPS_QUERY}
        RETURNING a.id
      )
      DELETE FROM prostgles.app_triggers
      WHERE app_id IN (
        SELECT id 
        FROM deleted_apps
      );
 
    END IF;
  END IF;
`;
