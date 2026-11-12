const VALIDATE_SCHEMA_FUNC_NAME = "prostgles.validate_jsonb_schema";

export const VALIDATE_SCHEMA_FUNCTION_SQL_TEST = `

/* TESTS */

/* Unknown and any accept null, including record values and array elements. */
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "unknown" }', 'null'::JSONB);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "any" }', 'null'::JSONB);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "record": { "values": { "type": "unknown" } } }',
  '{ "limit": null }'::JSONB
);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "unknown[]" }', '[null, 1]'::JSONB);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "any[]" }', '[null, 1]'::JSONB);

/* Unknown and any must enforce allowedValues for null scalars and array elements. */
DO $tests$
DECLARE
  schema_type TEXT;
  null_data JSONB;
BEGIN
  FOREACH schema_type IN ARRAY ARRAY['unknown', 'any', 'unknown[]', 'any[]'] LOOP
    null_data = CASE WHEN schema_type LIKE '%[]' THEN '[null]'::JSONB ELSE 'null'::JSONB END;
    IF ${VALIDATE_SCHEMA_FUNC_NAME}(
      jsonb_build_object('type', schema_type, 'allowedValues', '["active"]'::JSONB)::TEXT,
      null_data,
      '{ "silent": true }'::JSONB
    ) IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'Null must be rejected when absent from allowedValues (%)', schema_type;
    END IF;

    IF ${VALIDATE_SCHEMA_FUNC_NAME}(
      jsonb_build_object('type', schema_type, 'allowedValues', '[null, "active"]'::JSONB)::TEXT,
      null_data
    ) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Null must be accepted when included in allowedValues (%)', schema_type;
    END IF;
  END LOOP;
END;
$tests$;

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "enum": ["a", "b", 2] }', 
  '"a"'::JSONB
);


SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{"a": 1, "b": 2 }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{"a": 1 }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{ }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "record": { "keysEnum": ["a", "b"]    } }', 
  '{"a": 1, "b": 2 }'::JSONB
);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "enum": ["a", "b", 2] }', 
  '2'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
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

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "arrayOfType": { "a": "string", "narr": { "arrayOfType": { "a": { "type": "string", "optional": false, "nullable": true } } } } }', 
  '[{ "a": "ddd", "narr": [{ "a": null }] }]'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "type": { "a": { "type": "integer[]", "allowedValues": [2] } } }'::TEXT, 
  '{ "a": [2, 2] }'
); 

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}(
  '{ "type": { "a": { "type": "string[]", "allowedValues": ["2"] } } }'::TEXT, 
  '{ "a": ["2"] }'
);

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "any"}', '{}');

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": { "a": { "enum": ["a"] } } }', '{ "a": "a"}');

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "arrayOfType": { "a": { "enum": ["a"] } } }', '[{ "a": "a"}]');


SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "RowLookup", "table": "tblName" }', '{}');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "RowLookup[]", "table": "tblName" }', '[{}]');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "ValueLookup", "table": "tblName", "column": "colName" }', '1');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "ValueLookup[]", "table": "tblName", "column": "colName" }', '[1, 2]');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "TableLookup" }', '"tblName"'::JSONB);
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "TableLookup[]" }', '["tblName"]');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "ColumnLookup" }', '{ "table": "tblName", "column": "colName" }');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "ColumnLookup[]" }', '[{ "table": "tblName", "column": "colName" }]');

SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "time"}', '"22:22"');
SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "type": "Date"}', '"2222-22-22"');


SELECT ${VALIDATE_SCHEMA_FUNC_NAME}('{ "oneOf": ["number"]}','2');
`;
