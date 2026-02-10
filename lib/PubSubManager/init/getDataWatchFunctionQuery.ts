import { DB_OBJ_NAMES } from "./getPubSubManagerInitQuery";
import { getAppCheckQuery } from "../orphanTriggerCheck";
import { asValue, DELIMITER, NOTIF_CHANNEL, NOTIF_TYPE } from "../PubSubManagerUtils";

/**
 * Error:
 * could not identify an equality operator for type json', code: '42883'
 */
export const udtNamesWithoutEqualityComparison = ["json", "xml"];
export const getDataWatchFunctionQuery = (debugMode: boolean | undefined) => {
  const dataWatchFunctionQuery = `
  
        CREATE OR REPLACE FUNCTION ${DB_OBJ_NAMES.data_watch_func}() RETURNS TRIGGER 
        AS $$

            DECLARE t_ids TEXT[];
            DECLARE c_ids INTEGER[];  
            DECLARE err_c_ids INTEGER[]; 
            DECLARE condition_checks_union_query TEXT := '';          
            DECLARE query TEXT := '';            
            DECLARE v_trigger RECORD;
            DECLARE has_errors BOOLEAN := FALSE;
            
            DECLARE err_text    TEXT;
            DECLARE err_detail  TEXT;
            DECLARE err_hint    TEXT;
                    
            DECLARE view_def_query TEXT := '';   

            DECLARE escaped_table  TEXT;
 
            DECLARE _columns_info JSONB := NULL;

            DECLARE changed_columns _TEXT := NULL; 

            BEGIN
 
                escaped_table := concat_ws('.', CASE WHEN TG_TABLE_SCHEMA <> CURRENT_SCHEMA THEN format('%I', TG_TABLE_SCHEMA) END, format('%I', TG_TABLE_NAME));
            
                ${CHANGED_COLUMNS_CHECK}

                SELECT string_agg(
                  format(
                    $c$ 
                      SELECT CASE WHEN EXISTS( 
                        SELECT 1 
                        FROM %s 
                        WHERE %s 
                      ) THEN %s::text END AS t_id
                    $c$, 
                    table_name, 
                    condition, 
                    id 
                  ),
                  E' UNION \n ' 
                ) 
                INTO condition_checks_union_query
                FROM prostgles.v_triggers
                WHERE table_name = escaped_table; 


                /* condition_checks_union_query = 'old_table union new_table' or any one of the tables */
                IF condition_checks_union_query IS NOT NULL THEN

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
                        SELECT ', ' || string_agg(format(E' %s AS ( \n %s \n ) ', related_view_name, related_view_def), ', ')
                        FROM (
                          SELECT DISTINCT related_view_name, related_view_def 
                          FROM prostgles.v_triggers
                          WHERE table_name = escaped_table
                          AND related_view_name IS NOT NULL
                          AND related_view_def  IS NOT NULL
                        ) t
                      ), '')
                      || 
                      format(
                        $c$
                            SELECT ARRAY_AGG(DISTINCT t.t_id)
                            FROM ( 
                              %s 
                            ) t
                        $c$, 
                        condition_checks_union_query
                      )
                    INTO query; 

                    BEGIN 
                      EXECUTE query INTO t_ids; 

                      EXCEPTION WHEN OTHERS THEN
                        
                        has_errors := TRUE;

                        GET STACKED DIAGNOSTICS 
                          err_text = MESSAGE_TEXT,
                          err_detail = PG_EXCEPTION_DETAIL,
                          err_hint = PG_EXCEPTION_HINT;

                    END;

                    --RAISE NOTICE 'has_errors: % ', has_errors;
                    --RAISE NOTICE 'condition_checks_union_query: % , cids: %', condition_checks_union_query, c_ids;

                    IF (t_ids IS NOT NULL OR has_errors) THEN

                        FOR v_trigger IN
                            SELECT app_id, string_agg(c_id::text, ',') as cids
                            FROM prostgles.v_triggers
                            WHERE id = ANY(t_ids) 
                            OR has_errors
                            GROUP BY app_id
                        LOOP
                            
                            PERFORM pg_notify( 
                              ${asValue(NOTIF_CHANNEL.preffix)} || v_trigger.app_id , 
                              LEFT(concat_ws(
                                ${asValue(DELIMITER)},

                                ${asValue(NOTIF_TYPE.data)}, 
                                COALESCE(escaped_table, 'MISSING'), 
                                COALESCE(TG_OP, 'MISSING'), 
                                CASE WHEN has_errors 
                                  THEN concat_ws('; ', 'error', err_text, err_detail, err_hint, 'query: ' || query ) 
                                  ELSE COALESCE(v_trigger.cids, '') 
                                END,
                                COALESCE(changed_columns::TEXT, '')
                                ${debugMode ? ", COALESCE(current_query(), 'current_query ??'), ' ', query" : ""}
                              ), 7999/4) -- Some chars are 2bytes -> 'Ω'
                            );
                        END LOOP;


                        IF has_errors THEN

                          DELETE FROM prostgles.app_triggers;
                          RAISE NOTICE 'trigger dropped due to exception: % % %', err_text, err_detail, err_hint;

                        END IF;
                        
                    END IF;
                END IF;

                ${getAppCheckQuery()}

                RETURN NULL;
               
            END;

        $$ LANGUAGE plpgsql;
        COMMENT ON FUNCTION ${DB_OBJ_NAMES.data_watch_func} IS 'Prostgles internal function used to notify when data in the table changed';

  `;

  /** Ensure every execute is followed by EXCEPTION catch to ensure we remove stale schema/faulty triggers */
  const queryLines = dataWatchFunctionQuery
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  queryLines.forEach((line, lineIndex) => {
    const nextLine = queryLines[lineIndex + 1] ?? "";
    if (
      line.toUpperCase().startsWith("EXECUTE") &&
      !nextLine.toUpperCase().startsWith("EXCEPTION")
    ) {
      throw new Error(
        `Every EXECUTE statement in the data watch function must be followed by an EXCEPTION block to catch errors and avoid stale triggers. Problematic line: ${line}`,
      );
    }
  });

  return dataWatchFunctionQuery;
};

/**
 * TODO: check columns for specific t_id trigger conditions
 */
const CHANGED_COLUMNS_CHECK = `
-- Determine changed columns for UPDATE operations
IF TG_OP = 'UPDATE' THEN
 
  IF NOT EXISTS (
    SELECT 1
    FROM prostgles.v_triggers  
    WHERE table_name = escaped_table
    /* If any value is null it means some condition is tracking all columns so we need to check them all */
    AND columns_info IS NULL
  ) THEN

    SELECT columns_info
    INTO _columns_info
    FROM prostgles.v_triggers
    WHERE table_name = escaped_table
    AND columns_info IS NOT NULL;
  
    IF _columns_info IS NOT NULL THEN
      query := format(
        $c$
          WITH changed AS (
            SELECT column_name
            FROM jsonb_object_keys(%L) as column_name
            WHERE EXISTS (
              SELECT 1 
              FROM old_table o 
              LEFT JOIN new_table n 
              ON %s 
              WHERE %s
            )
          )
          SELECT array_agg(column_name) 
          FROM changed;
        $c$,
        _columns_info->'tracked_columns',
        _columns_info->>'join_condition',
        _columns_info->>'where_statement'
      );

      BEGIN
        EXECUTE query INTO changed_columns;
        EXCEPTION WHEN OTHERS THEN
          
          has_errors := TRUE;

          GET STACKED DIAGNOSTICS 
            err_text = MESSAGE_TEXT,
            err_detail = PG_EXCEPTION_DETAIL,
            err_hint = PG_EXCEPTION_HINT;
      END;

      /* It is possible to get no changes */
      changed_columns := COALESCE(changed_columns, '{}');

    END IF;  

  END IF;
END IF;

`;

/**
 * Given:
 * 1. two transition tables (old_table and new_table)
 * 2. a list of primary keys
 * 3. a list of trigger conditions and their tracked columns
 *
 * Identify which conditions which columns have changed for each condition.
 *  - If a condition is met in only one of the transition tables, it is considered that all columns changed for that condition
 *  - If a condition is met in both transition tables, we need to check which columns have changed
 */
const CHANGED_COLUMNS_CHECK_V2 = `
WITH 
old_table AS (
  SELECT 10 as id, 'A' as status, 100 as val, 'user@example.com' as email UNION ALL
  SELECT 1 as id, 'a' as status, 0 as val, '@dw1' as email -- Original data for other conditions
),
new_table AS (
  SELECT 10 as id, 'B' as status, 200 as val, 'user_new@example.com' as email UNION ALL
  SELECT 1 as id, 'a' as status, 0 as val, '@dw12' as email -- Original data for other conditions
),
unioned_tables AS (
  SELECT *, 'old' as "ctid" FROM old_table UNION ALL 
  SELECT *, 'old' as "ctid" FROM new_table 
),
changed_conditions AS (
  SELECT o.*, cond
  FROM unioned_tables o
  LEFT JOIN UNNEST(ARRAY[
    CASE WHEN id = 1 THEN 'cond_id_1' END, -- Original condition
    CASE WHEN status = 'B' AND id = 10 THEN 'cond_status_B_for_id_10' END -- Condition specific to new state of updated row
  ]) cond
    ON TRUE 
),
result AS (
  SELECT o.*, n.*, conds, cc
  FROM unioned_tables o
  LEFT JOIN UNNEST(ARRAY[
    CASE WHEN id = 1 THEN 'cond_id_1' END, -- Original condition
    CASE WHEN status = 'B' AND id = 10 THEN 'cond_status_B_for_id_10' END -- Condition specific to new state of updated row
  ]) conds
    ON TRUE 
  /**
  * Join only to records AND conditions that exist in both tables. 
  * This will inevitably show which columns changed for matching rows. 
  * Non matching rows will show that all columns changed 
  */
  LEFT JOIN   (
    SELECT * 
    FROM unioned_tables ut
    WHERE EXISTS (
      SELECT 1
      FROM old_table _ot
      LEFT JOIN UNNEST(ARRAY[
        CASE WHEN id = 1 THEN 'cond_id_1' END, -- Original condition
        CASE WHEN status = 'B' AND id = 10 THEN 'cond_status_B_for_id_10' END -- Condition specific to new state of updated row
      ]) conds2
        ON TRUE 
      WHERE _ot.id = ut.id
      AND conds2 IS NOT NULL
    )
    AND EXISTS (
      select 1
      from new_table _nt
      LEFT JOIN UNNEST(ARRAY[
        CASE WHEN id = 1 THEN 'cond_id_1' END, -- Original condition
        CASE WHEN status = 'B' AND id = 10 THEN 'cond_status_B_for_id_10' END -- Condition specific to new state of updated row
      ]) conds2
        ON TRUE 
      WHERE _nt.id = ut.id
      AND conds2 IS NOT NULL
    )
  ) n
    ON o.id = n.id  
  LEFT JOIN UNNEST(ARRAY[
    CASE WHEN ROW(n.*) IS NULL OR o.id IS DISTINCT FROM n.id THEN 'id' END ,
    CASE WHEN ROW(n.*) IS NULL OR o.status IS DISTINCT FROM n.status THEN 'status' END  ,
    CASE WHEN ROW(n.*) IS NULL OR o.email IS DISTINCT FROM n.email THEN 'email' END  
  ]) cc
    ON TRUE 
  WHERE conds IS NOT NULL
  AND cc IS NOT NULL
)
-- SELECT *
-- FROM result
SELECT   conds
, array_agg(DISTINCT cc)
FROM result
GROUP BY 1
`;

/**
 * Test cases:
 * 
  1. Condition not present in both tables (cond B). 
      Expected result:
      - cond_id_1: [email] 
      - cond_status_B_for_id_10: [id, email, status]
 
WITH 
old_table AS (
  SELECT 10 as id, 'A' as status, 100 as val, 'user@example.com' as email UNION ALL
  SELECT 1 as id, 'a' as status, 0 as val, '@dw1' as email -- Original data for other conditions
),
new_table AS (
  SELECT 10 as id, 'B' as status, 200 as val, 'user_new@example.com' as email UNION ALL
  SELECT 1 as id, 'a' as status, 0 as val, '@dw12' as email -- Original data for other conditions
),

LEFT JOIN UNNEST(ARRAY[
  CASE WHEN id = 1 THEN 'cond_id_1' END, -- Original condition
  CASE WHEN status = 'B' AND id = 10 THEN 'cond_status_B_for_id_10' END -- Condition specific to new state of updated row
]) conds
  ON TRUE 

 */
