"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate_jsonb_schema_sql = exports.JSONB_DATA_TYPES = exports.VALIDATE_SCHEMA_FUNCNAME = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const raiseException = (err) => `
IF (context->'silent')::BOOLEAN = TRUE THEN
  RETURN FALSE;
ELSE
  RAISE EXCEPTION ${err} USING HINT = path, COLUMN = colname, TABLE = tablename, CONSTRAINT = 'validate_jsonb_schema: ' || jsonb_pretty(jsonb_schema::JSONB);
END IF;
`;
exports.VALIDATE_SCHEMA_FUNCNAME = "validate_jsonb_schema";
exports.JSONB_DATA_TYPES = [
    ...prostgles_types_1.DATA_TYPES,
    "Lookup", "Lookup[]"
];
exports.validate_jsonb_schema_sql = `

/* 
* ${PubSubManager_1.PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
*/

DROP FUNCTION IF EXISTS ${exports.VALIDATE_SCHEMA_FUNCNAME}(jsonb_schema text, data jsonb, checked_path text[]) CASCADE;
--DROP FUNCTION IF EXISTS ${exports.VALIDATE_SCHEMA_FUNCNAME}(jsonb_schema text, data jsonb, context JSONB, checked_path text[]);

CREATE OR REPLACE FUNCTION ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  jsonb_schema TEXT, 
  data JSONB, 
  context JSONB DEFAULT '{}'::JSONB, /* { table: string; column: string; silent: boolean } */
  checked_path TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS boolean AS 
$f$
DECLARE
  sub_schema RECORD;
  array_element RECORD;
  obj_key_val RECORD;
  schema JSONB;
  path text;
  allowed_types text[] = '{${exports.JSONB_DATA_TYPES.join(",")}}';
  typeStr TEXT = NULL; 
  optional boolean;
  nullable boolean; 
  colname TEXT = COALESCE(context->>'column', '');
  tablename TEXT = COALESCE(context->>'table', '');
  oneof JSONB;
  arrayof JSONB;
  lookup_data_def_schema TEXT = $d$  
    { 
      "type": { "enum": ["data", "data-def"] },
      "table": "string",
      "column": "string",
      "lookup": { "type": "any", "optional": true },
      "isArray": { "type": "boolean", "optional": true },
      "filter": { "optional": true, "type": "any" },
      "isFullRow": { "optional": true, "type": {
        "displayColumns": { "optional": true, "type": "string[]" }
      }},
      "searchColumns": { "optional": true, "type": "string[]" },
      "showInRowCard": { "optional": true, "type": "any" }
    }  
  
  $d$;
  lookup_schema_schema TEXT = $d$  
    { 
      "type": { "enum": ["schema"] },
      "object": { "enum": ["table", "column"] },
      "isArray": { "type": "boolean", "optional": true },
      "lookup": { "type": "any", "optional": true },
      "filter": { "optional": true, "type": "any" }
    }  
  $d$;

  extra_keys TEXT[];

  /* Used for oneOf schema errors */
  v_state   TEXT;
  v_msg     TEXT;
  v_detail  TEXT;
  v_hint    TEXT;
  v_context TEXT;
  v_one_of_errors TEXT;

BEGIN
  path = concat_ws(', ', 
    'Path: ' || array_to_string(checked_path, '.'), 
    'Data: ' || data::TEXT, 
    'JSONBSchema: ' || schema::TEXT
  );

  IF length(jsonb_schema) = 0 THEN
    ${raiseException(`'Empty schema. %', path`)}
  END IF;

  /* Sometimes text comes double quoted from jsonb, e.g.: '"string"' */
  jsonb_schema = CASE WHEN jsonb_schema::text ilike '"%"' THEN  LEFT(RIGHT(jsonb_schema::text, -1), -1) ELSE jsonb_schema END;

  /* 'string' */
  IF ARRAY[jsonb_schema] <@ allowed_types THEN
    schema = jsonb_build_object('type', jsonb_schema);
  /* { "type": ... } */ 
  ELSIF BTRIM(replace(jsonb_schema,E'\n','')) ILIKE '{%' THEN
    schema = jsonb_schema::JSONB;
  ELSE
    ${raiseException(`$$Invalid schema. Expecting 'typename' or { "type": "typename" } but received: %, %$$, jsonb_schema, path`)} 
  END IF;


  nullable = COALESCE((schema->>'nullable')::BOOLEAN, FALSE);
  IF data IS NULL OR jsonb_typeof(data) = 'null' THEN
    IF NOT nullable THEN
      ${raiseException(`'Is not nullable. %', path`)}  
    ELSE
      RETURN true;
    END IF;
  END IF;
  
  IF schema ? 'enum' THEN 
    IF 
      jsonb_typeof(schema->'enum') != 'array' OR 
      jsonb_array_length(schema->'enum') < 1 
    THEN
      ${raiseException(`'Invalid schema enum (%) .Must be a non empty array %', schema->'enum', path`)}  
    END IF;
    
    IF NOT jsonb_build_array(data) <@ (schema->'enum') THEN
      ${raiseException(`'Data not in allowed enum list (%), %', schema->'enum', path`)}  
    END IF;

  ELSIF schema ? 'lookup' THEN

    /* TODO: Finish validating data-def */
    IF (schema->'lookup'->>'type' = 'data-def') THEN
      RETURN TRUE;
    END IF;

    /* Validate lookup schema */
    IF NOT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
      '{ "oneOfType": [' || concat_ws(',',lookup_data_def_schema, lookup_schema_schema)  || '] }',
      schema->'lookup',
      context,
      checked_path || '.schema'::TEXT
    ) THEN
      
      RETURN FALSE;
    END IF;

    RETURN ${exports.VALIDATE_SCHEMA_FUNCNAME}(
      CASE WHEN schema->'lookup'->>'type' = 'data-def' THEN
        lookup_data_def_schema
      WHEN schema->'lookup'->>'type' = 'schema' THEN 
        ( 
          CASE WHEN schema->'lookup'->>'object' = 'table' THEN 
            'string' || (CASE WHEN (schema->'lookup'->'isArray')::BOOLEAN THEN '[]' ELSE '' END)
          ELSE 
            '{ "type": { "table": "string", "column": "string' || (CASE WHEN (schema->'lookup'->'isArray')::BOOLEAN THEN '[]' ELSE '' END) || '" } }' 
          END
        )
      ELSE 
        (CASE WHEN (schema->'lookup'->'isArray')::BOOLEAN THEN 'any[]' ELSE 'any' END)
      END,
      data,
      context,
      checked_path
    );

  ELSIF schema ? 'type' THEN    
    
    IF jsonb_typeof(schema->'type') = 'string' THEN
      typeStr = schema->>'type';
      IF NOT ARRAY[typeStr] <@ allowed_types THEN
        ${raiseException(`'Bad schema type "%", allowed types: %. %',typeStr, allowed_types, path`)}  
      END IF;
      
      /** Primitive array */
      IF typeStr LIKE '%[]' THEN
 
        typeStr = left(typeStr, -2);

        IF jsonb_typeof(data) != 'array' THEN
          ${raiseException(`'Types not matching. Expecting an array. %', path`)}  
        END IF;

        FOR array_element IN
          SELECT value, row_number() OVER() -1 as idx
          FROM jsonb_array_elements(data)
        LOOP
          IF NOT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
              CASE WHEN schema->'allowedValues' IS NOT NULL THEN 
                jsonb_build_object('type', typeStr, 'allowedValues', schema->'allowedValues')::TEXT
              ELSE typeStr END, 
              array_element.value, 
              context,
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
          ${raiseException(`'Data type not matching. Expected: %, Actual: %, %', typeStr, jsonb_typeof(data), path`)}  
        END IF;

        IF schema ? 'allowedValues' AND NOT(jsonb_build_array(data) <@ (schema->'allowedValues')) THEN
          IF (
            SELECT COUNT(distinct jsonb_typeof(value))
            FROM jsonb_array_elements(schema->'allowedValues')
          ) > 1 THEN
            ${raiseException(`'Invalid schema. schema.allowedValues (%) contains more than one data type . %', schema->>'allowedValues', path`)}  
          END IF;

          IF EXISTS(
            SELECT 1
            FROM jsonb_array_elements(schema->'allowedValues')
            WHERE jsonb_typeof(value) != jsonb_typeof(data)
          ) THEN
            ${raiseException(`'Invalid schema. schema.allowedValues (%) contains contains values not matchine the schema.type %', schema->>'allowedValues', path`)}  
          END IF;

          ${raiseException(`'Data not in allowedValues (%). %', schema->>'allowedValues', path`)}  

        END IF;

      END IF;

    /* Object */
    ELSIF jsonb_typeof(schema->'type') = 'object' THEN

      IF jsonb_typeof(data) != 'object' THEN
        ${raiseException(`E'Expecting an object: \n %', path`)}  
      END IF;

      extra_keys = ARRAY(SELECT k FROM (
        SELECT jsonb_object_keys(data) as k
        EXCEPT
        SELECT jsonb_object_keys(schema->'type') as k
      ) t);

      IF array_length(extra_keys, 1) > 0 THEN
        ${raiseException(`E'Object contains % invalid keys: [ % ] \n %', array_length(extra_keys)::TEXT, array_to_string(extra_keys, ', '), path`)}  
      END IF;
      
      FOR sub_schema IN
        SELECT key, value
        FROM jsonb_each(schema->'type')
      LOOP

        optional = COALESCE((sub_schema.value->>'optional')::BOOLEAN, FALSE);
        IF NOT (data ? sub_schema.key) THEN
          IF NOT optional THEN
            ${raiseException(`'Types not matching. Required property ("%") is missing. %', sub_schema.key , path`)}  
          END IF;

        ELSIF NOT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
          -- sub_schema.value::TEXT, 
          CASE WHEN jsonb_typeof(sub_schema.value) = 'string' THEN TRIM(both '"' from sub_schema.value::TEXT) ELSE sub_schema.value::TEXT END,
          data->sub_schema.key, 
          context,
          checked_path || sub_schema.key
        ) THEN
          RETURN false;
        END IF;

      END LOOP;

      RETURN TRUE;
    ELSE 
      ${raiseException(`'Unexpected schema.type ( % ), %',jsonb_typeof(schema->'type'), path`)}  
    END IF; 

  /* oneOfType: [{ key_name: { type: "string" } }] */
  ELSIF (schema ? 'oneOf' OR schema ? 'oneOfType') THEN 

    oneof = COALESCE(schema->'oneOf', schema->'oneOfType');

    IF jsonb_typeof(oneof) != 'array' THEN
      ${raiseException(`'Unexpected oneOf schema. Expecting an array of objects but received: % , %', oneof::TEXT, path`)}  
    END IF;

    FOR sub_schema IN
      SELECT CASE WHEN schema ? 'oneOfType' THEN jsonb_build_object('type', value) ELSE value END as value, 
        row_number() over() - 1 as idx
      FROM jsonb_array_elements(oneof)
    LOOP

      BEGIN

        IF ${exports.VALIDATE_SCHEMA_FUNCNAME}(
          sub_schema.value::TEXT, 
          data, 
          context,
          checked_path
        ) THEN
          RETURN true;
        END IF;

      /* Ignore exceptions in case the last schema will match */
      EXCEPTION WHEN others THEN

        GET STACKED DIAGNOSTICS
          v_state   = returned_sqlstate,
          v_msg     = message_text,
          v_detail  = pg_exception_detail,
          v_hint    = pg_exception_hint,
          v_context = pg_exception_context;

        /* Ignore duplicate errors */
        IF v_one_of_errors IS NULL OR v_one_of_errors NOT ilike '%' || v_msg || '%' THEN
          v_one_of_errors = concat_ws(
            E'\n\n', 
            v_one_of_errors,  
            concat_ws(
              ', ', 
              'Schema index ' || sub_schema.idx::TEXT || ' error:', 
              'state: ' || v_state, 
              'message: ' || v_msg,
              'detail: ' || v_detail,
              'hint: ' || v_hint
              -- 'context: ' || v_context
            )
          );
        END IF;
      END;

    END LOOP;

    ${raiseException(`E'No oneOf schemas matching:\n  % ), %', v_one_of_errors, path`)}  

  /* arrayOfType: { key_name: { type: "string" } } */
  ELSIF (schema ? 'arrayOf' OR schema ? 'arrayOfType') THEN

    arrayof = COALESCE(schema->'arrayOf', schema->'arrayOfType');

    IF jsonb_typeof(data) != 'array' THEN
      ${raiseException(`'% is not an array.', path`)}  
    END IF;

    FOR array_element IN 
      SELECT value, row_number() OVER() -1 as idx  
      FROM jsonb_array_elements(data)
    LOOP
      IF NOT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
        ( CASE WHEN schema ? 'arrayOf' 
          THEN 
            schema->'arrayOf' 
          ELSE 
          (schema - 'arrayOfType' || jsonb_build_object('type', schema->'arrayOfType')) 
          END
        )::TEXT,
        array_element.value, 
        context,
        checked_path || array_element.idx::TEXT
      ) THEN
        RETURN false;
      END IF; 
    END LOOP;
  
  /* record: { keysEnum?: string[], values?: FieldType } */
  ELSIF schema ? 'record' THEN
    IF 
      jsonb_typeof(schema->'record') != 'object' OR 
      NOT (schema->'record') ? 'keysEnum' 
      AND NOT (schema->'record') ? 'values'
    THEN
      ${raiseException(`'Invalid/empty record schema. Expecting a non empty record of: { keysEnum?: string[]; values?: FieldType } : %, %', schema, path`)}  
    END IF;

    IF jsonb_typeof(data) != 'object' THEN
      ${raiseException(`'% is not an object.', path`)}  
    END IF;

    FOR obj_key_val IN
      SELECT jsonb_build_object('key',  key, 'value', value) as obj
      FROM jsonb_each(data)
    LOOP
      RETURN (CASE WHEN NOT (schema->'record') ? 'keysEnum' THEN TRUE ELSE ${exports.VALIDATE_SCHEMA_FUNCNAME}( 
        jsonb_build_object('enum', schema->'record'->'keysEnum')::TEXT,
        (obj_key_val.obj)->'key', 
        context,
        checked_path || ARRAY[(obj_key_val.obj)->>'key']
      ) END) 
      AND 
      (CASE WHEN NOT (schema->'record') ? 'values' THEN TRUE ELSE ${exports.VALIDATE_SCHEMA_FUNCNAME}(
        schema->'record'->>'values', 
        (obj_key_val.obj)->'value', 
        context,
        checked_path || ARRAY[(obj_key_val.obj)->>'key']
      ) END);
    END LOOP;

  ELSE
    ${raiseException(`'Unexpected schema: %, %', schema, path`)}
  END IF;
  
  RETURN true;
END;
$f$ LANGUAGE 'plpgsql' IMMUTABLE;

COMMENT ON FUNCTION ${exports.VALIDATE_SCHEMA_FUNCNAME}  /* ${PubSubManager_1.PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
IS $$prostgles-server internal function used in column CHECK conditions to validate jsonb data against a column schema specified in tableConfig.
Example usage:
validate_jsonb_schema(
  '{ "type": { "a": "number[]" } }', 
  '{ "a": [2] }'
)
$$;
 

/* TESTS */

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '"a"'::JSONB
);


SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{"a": 1, "b": 2 }'::JSONB
);

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"]    } }', 
  '{"a": 1, "b": 2 }'::JSONB
);
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '2'::JSONB
);

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ 
    "oneOfType": [
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

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "arrayOfType": { "a": "string", "narr": { "arrayOfType": { "a": { "type": "string", "optional": false, "nullable": true } } } } }', 
  '[{ "a": "ddd", "narr": [{ "a": null }] }]'::JSONB
);

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "type": { "a": { "type": "integer[]", "allowedValues": [2] } } }'::TEXT, 
  '{ "a": [2, 2] }'
); 

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}(
  '{ "type": { "a": { "type": "string[]", "allowedValues": ["2"] } } }'::TEXT, 
  '{ "a": ["2"] }'
);

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "type": "any"}', '{}');

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "type": { "a": { "enum": ["a"] } } }', '{ "a": "a"}');

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "arrayOfType": { "a": { "enum": ["a"] } } }', '[{ "a": "a"}]');


SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "data", "table": "tblName", "column": "colName" } }', '{}');
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "data", "table": "tblName", "column": "colName", "isArray": true } }', '[{}]');
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "table" } }', '"tblName"'::JSONB);
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "table", "isArray": true } }', '["tblName"]');
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "column" } }', '{  "table": "tblName", "column": "colName" }');
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "column", "isArray": true } }', '{  "table": "tblName", "column": ["colName"] }');

SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "type": "time"}', '"22:22"');
SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "type": "Date"}', '"2222-22-22"');


SELECT ${exports.VALIDATE_SCHEMA_FUNCNAME}('{ "oneOf": ["number"]}','2');
`;
