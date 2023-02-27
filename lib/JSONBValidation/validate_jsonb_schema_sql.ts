

export const VALIDATE_SCHEMA_FUNCNAME = "prostgles.validate_jsonb_schema" as const;
export const validate_jsonb_schema_sql = `
DROP FUNCTION IF EXISTS ${VALIDATE_SCHEMA_FUNCNAME}(jsonb_schema text, data jsonb, checked_path text[]);

CREATE OR REPLACE FUNCTION ${VALIDATE_SCHEMA_FUNCNAME}(jsonb_schema TEXT, data JSONB, checked_path TEXT[] DEFAULT ARRAY[]::TEXT[]) RETURNS boolean AS 
$f$
DECLARE
  sub_schema RECORD;
  array_element RECORD;
  schema JSONB;
  path text;
  allowed_types text[] = '{any,boolean,number,integer,string,boolean[],number[],integer[],string[],any[]}';
  typeStr TEXT = NULL; 
  optional boolean;
  nullable boolean; 
  colname TEXT;

  extra_keys TEXT[];
BEGIN
  path = concat_ws(', ', 
    'Path: ' || array_to_string(checked_path, '.'), 
    'Data: ' || data::TEXT, 
    'JSONBSchema: ' || schema::TEXT
  );
  colname = COALESCE(checked_path[1], '');

  IF length(jsonb_schema) = 0 THEN
    RAISE EXCEPTION 'Empty schema. %', path USING HINT = path, COLUMN = colname; 
  END IF;

  /* 'string' */
  IF ARRAY[jsonb_schema] <@ allowed_types THEN
    schema = jsonb_build_object('type', jsonb_schema);
  /* { "type": ... } */ 
  ELSIF BTRIM(jsonb_schema) ILIKE '{%' THEN
    schema = jsonb_schema::JSONB;
  ELSE
    RAISE EXCEPTION $$Invalid schema. Expecting 'typename' or { "type": "typename" } but received: %, %$$, jsonb_schema, path USING HINT = path, COLUMN = colname; 
  END IF;


  nullable = COALESCE((schema->'nullable')::BOOLEAN, FALSE);
  IF data IS NULL OR jsonb_typeof(data) = 'null' THEN
    IF NOT nullable THEN
      RAISE EXCEPTION 'Is not nullable. %', path USING HINT = path, COLUMN = colname; 
    ELSE
      RETURN true;
    END IF;
  END IF;
  
  IF schema ? 'enum' THEN 
    IF 
      jsonb_typeof(schema->'enum') != 'array' OR 
      jsonb_array_length(schema->'enum') < 1 
    THEN
      RAISE EXCEPTION 'Invalid schema enum (%) .Must be a non empty array %', schema->'enum', path USING HINT = path, COLUMN = colname; 
    END IF;
    
    IF NOT jsonb_build_array(data) <@ (schema->'enum') THEN
      RAISE EXCEPTION 'Data not in allowed enum list (%), %', schema->'enum', path USING HINT = path, COLUMN = colname; 
    END IF;

  ELSIF schema ? 'type' THEN    
    
    IF jsonb_typeof(schema->'type') = 'string' THEN
      typeStr = schema->>'type';
      IF NOT ARRAY[typeStr] <@ allowed_types THEN
        RAISE EXCEPTION 'Bad schema type type %, allowed types: %. %',typeStr, allowed_types, path USING HINT = path, COLUMN = colname; 
      END IF;
      
      /** Primitive array */
      IF typeStr LIKE '%[]' THEN
 
        typeStr = left(typeStr, -2);

        IF jsonb_typeof(data) != 'array' THEN
          RAISE EXCEPTION 'Types not matching. Expecting an array. %', path USING HINT = path, COLUMN = colname;
        END IF;

        FOR array_element IN
          SELECT value, row_number() OVER() -1 as idx
          FROM jsonb_array_elements(data)
        LOOP
          IF NOT ${VALIDATE_SCHEMA_FUNCNAME}(
              CASE WHEN schema->'allowedValues' IS NOT NULL THEN 
                jsonb_build_object('type', typeStr, 'allowedValues', schema->'allowedValues')::TEXT
              ELSE typeStr END, 
              array_element.value, 
              checked_path || array_element.idx::TEXT
          ) THEN
            
            RETURN FALSE;
          END IF;
        END LOOP;

        RETURN TRUE;

      /** Primitive */
      ELSE 

        IF (
          typeStr = 'number' AND jsonb_typeof(data) != typeStr OR
          (typeStr = 'integer' AND (jsonb_typeof(data) != 'number' OR ceil(data::NUMERIC) != floor(data::NUMERIC))) OR
          typeStr = 'boolean' AND jsonb_typeof(data) != typeStr OR
          typeStr = 'string' AND jsonb_typeof(data) != typeStr OR
          typeStr = 'any' AND jsonb_typeof(data) = 'null'
        ) THEN
          RAISE EXCEPTION 'Data type not matching. Expected: %, Actual: %, %', typeStr, jsonb_typeof(data), path USING HINT = path, COLUMN = colname; 
        END IF;

        IF schema ? 'allowedValues' AND NOT(jsonb_build_array(data) <@ (schema->'allowedValues')) THEN
          IF (
            SELECT COUNT(distinct jsonb_typeof(value))
            FROM jsonb_array_elements(schema->'allowedValues')
          ) > 1 THEN
            RAISE EXCEPTION 'Invalid schema. schema.allowedValues (%) contains more than one data type . %', schema->>'allowedValues', path USING HINT = path, COLUMN = colname;
          END IF;

          IF EXISTS(
            SELECT 1
            FROM jsonb_array_elements(schema->'allowedValues')
            WHERE jsonb_typeof(value) != jsonb_typeof(data)
          ) THEN
            RAISE EXCEPTION 'Invalid schema. schema.allowedValues (%) contains contains values not matchine the schema.type %', schema->>'allowedValues', path USING HINT = path, COLUMN = colname; 
          END IF;

          RAISE EXCEPTION 'Data not in allowedValues (%). %', schema->>'allowedValues', path USING HINT = path, COLUMN = colname; 

        END IF;

      END IF;

    /* Object */
    ELSIF jsonb_typeof(schema->'type') = 'object' THEN

      IF jsonb_typeof(data) != 'object' THEN
        RAISE EXCEPTION E'Expecting an object: \n %', path USING HINT = path, COLUMN = colname; 
      END IF;

      extra_keys = ARRAY(SELECT k FROM (
        SELECT jsonb_object_keys(data) as k
        EXCEPT
        SELECT jsonb_object_keys(schema->'type') as k
      ) t);

      IF array_length(extra_keys, 1) > 0 THEN
        RAISE EXCEPTION E'Object contains invalid keys: % \n %', 
          array_to_string(extra_keys, ', '), path USING HINT = path, COLUMN = colname; 
      END IF;
      
      FOR sub_schema IN
        SELECT key, value
        FROM jsonb_each(schema->'type')
      LOOP
        optional = COALESCE((sub_schema.value->'optional')::BOOLEAN, FALSE);
        IF NOT (data ? sub_schema.key) THEN
          
          IF NOT optional THEN
            RAISE EXCEPTION 'Types not matching. Required property (%) is missing. %',sub_schema.key , path USING HINT = path, COLUMN = colname; 
          ELSE
            RETURN true; 
          END IF;
        END IF;

        IF NOT ${VALIDATE_SCHEMA_FUNCNAME}(
          -- sub_schema.value::TEXT, 
          CASE WHEN jsonb_typeof(sub_schema.value) = 'string' THEN TRIM(both '"' from sub_schema.value::TEXT) ELSE sub_schema.value::TEXT END,
          data->sub_schema.key, 
          checked_path || sub_schema.key
        ) THEN
          RETURN false;
        END IF;

      END LOOP;
    ELSE 
      RAISE EXCEPTION 'Unexpected schema.type ( % ), %',jsonb_typeof(schema->'type'), path USING HINT = path, COLUMN = colname; 
    END IF; 

  /* oneOf: [{ key_name: { type: "string" } }] */
  ELSIF schema ? 'oneOf' THEN
    IF jsonb_typeof(schema->'oneOf') != 'array' THEN
      RAISE EXCEPTION 'Unexpected oneOf schema. Expecting an array of objects but received: % , %',schema->>'oneOf', path USING HINT = path, COLUMN = colname; 
    END IF;

    FOR sub_schema IN
      SELECT jsonb_build_object('type', value) as value
      FROM jsonb_array_elements(schema->'oneOf')
    LOOP

      BEGIN

        IF ${VALIDATE_SCHEMA_FUNCNAME}(
          sub_schema.value::TEXT, 
          data, 
          checked_path
        ) THEN
          RETURN true;
        END IF;

      /* Ignore exceptions in case the last schema will match */
      EXCEPTION WHEN others THEN
      END;
    END LOOP;

    RAISE EXCEPTION 'Could not validate against any oneOf schemas ( % ), %', schema->>'oneOf', path USING HINT = path, COLUMN = colname;  

  /* arrayOf: { key_name: { type: "string" } } */
  ELSIF jsonb_typeof(schema->'arrayOf') = 'object' THEN
    IF jsonb_typeof(data) != 'array' THEN
      RAISE EXCEPTION 'Is not an array. %', path USING HINT = path, COLUMN = colname; 
    END IF;

    FOR array_element IN 
      SELECT value, row_number() OVER() -1 as idx  
      FROM jsonb_array_elements(data)
    LOOP
      IF NOT ${VALIDATE_SCHEMA_FUNCNAME}(
        (schema - 'arrayOf' || jsonb_build_object('type', schema->'arrayOf'))::TEXT, -- RENAME
        array_element.value, checked_path || array_element.idx::TEXT
      ) THEN
        RETURN false;
      END IF; 
    END LOOP;
  
  ELSE
    RAISE EXCEPTION 'Unexpected schema: %, %', schema, path USING HINT = path, COLUMN = colname; 
  END IF;
  
  RETURN true;
END;
$f$ LANGUAGE 'plpgsql' IMMUTABLE;

COMMENT ON FUNCTION ${VALIDATE_SCHEMA_FUNCNAME}  
IS $$Used to validate jsonb data against a schema:
validate_jsonb_schema(
  '{ "type": { "a": "number[]" } }', 
  '{ "a": [2] }'
)
$$;
 

/* TESTS */

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '"a"'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '2'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ 
    "oneOf": [
      { "a": "string" } , 
      {
        "a": {
          "type": "boolean", 
          "allowedValues": [false], 
          "optional": true 
        }
      }
    ] 
  }', 
  '{ "a": false }'
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "arrayOf": { "a": "string", "narr": { "arrayOf": { "a": { "type": "string", "optional": false, "nullable": true } } } } }', 
  '[{ "a": "ddd", "narr": [{ "a": null }] }]'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "type": { "a": { "type": "integer[]", "allowedValues": [2] } } }'::TEXT, 
  '{ "a": [2, 2] }'
); 

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "type": { "a": { "type": "string[]", "allowedValues": ["2"] } } }'::TEXT, 
  '{ "a": ["2"] }'
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "type": "any"}', '{}');

SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "type": { "a": { "enum": ["a"] } } }', '{ "a": "a"}');

SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "arrayOf": { "a": { "enum": ["a"] } } }', '[{ "a": "a"}]');

`;