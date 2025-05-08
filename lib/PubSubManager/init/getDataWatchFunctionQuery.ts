import { DB_OBJ_NAMES } from "../getPubSubManagerInitQuery";
import { getAppCheckQuery } from "../orphanTriggerCheck";
import { asValue, DELIMITER, NOTIF_CHANNEL, NOTIF_TYPE } from "../PubSubManagerUtils";

export const getDataWatchFunctionQuery = (debugMode: boolean | undefined) => {
  return `
  
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

            DECLARE escaped_table  TEXT;

            DECLARE changed_columns TEXT := NULL;

            BEGIN

                --PERFORM pg_notify('debug', concat_ws(' ', 'TABLE', TG_TABLE_NAME, TG_OP));
            

                -- Determine changed columns for UPDATE operations
                IF TG_OP = 'UPDATE' THEN
                  WITH cols AS (
                    SELECT column_name::text 
                    FROM information_schema.columns 
                    WHERE table_schema = TG_TABLE_SCHEMA 
                    AND table_name = TG_TABLE_NAME
                  ),
                  changed AS (
                    SELECT column_name
                    FROM cols
                    WHERE EXISTS (
                      SELECT 1 FROM new_table n 
                      JOIN old_table o ON TRUE 
                      WHERE n.* IS DISTINCT FROM o.*
                      LIMIT 1
                    )
                  )
                  SELECT string_agg(column_name, ',') INTO changed_columns
                  FROM changed;
                END IF;


                escaped_table := concat_ws('.', CASE WHEN TG_TABLE_SCHEMA <> CURRENT_SCHEMA THEN format('%I', TG_TABLE_SCHEMA) END, format('%I', TG_TABLE_NAME));

                SELECT string_agg(
                  format(
                    $c$ 
                      SELECT CASE WHEN EXISTS( 
                        SELECT 1 
                        FROM %s 
                        WHERE %s 
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
                WHERE table_name = escaped_table; 


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
                            SELECT ARRAY_AGG(DISTINCT t.t_ids)
                            FROM ( 
                              %s 
                            ) t
                        $c$, 
                        unions
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
                                COALESCE(changed_columns, '')
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
};
