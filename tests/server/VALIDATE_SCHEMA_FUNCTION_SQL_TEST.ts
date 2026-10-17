const VALIDATE_SCHEMA_FUNC_NAME = "prostgles.validate_jsonb_schema";

export const VALIDATE_SCHEMA_FUNCTION_SQL_TEST = `

/* TESTS */

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
