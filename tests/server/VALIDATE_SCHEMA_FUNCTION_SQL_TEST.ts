const VALIDATE_SCHEMA_FUNCNAME = "prostgles.validate_jsonb_schema";

export const VALIDATE_SCHEMA_FUNCTION_SQL_TEST = `

/* TESTS */

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '"a"'::JSONB
);


SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{"a": 1, "b": 2 }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{"a": 1 }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"] , "values": { "enum": [1, 2] } } }', 
  '{ }'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "record": { "keysEnum": ["a", "b"]    } }', 
  '{"a": 1, "b": 2 }'::JSONB
);
SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "enum": ["a", "b", 2] }', 
  '2'::JSONB
);

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
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

SELECT ${VALIDATE_SCHEMA_FUNCNAME}(
  '{ "arrayOfType": { "a": "string", "narr": { "arrayOfType": { "a": { "type": "string", "optional": false, "nullable": true } } } } }', 
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

SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "arrayOfType": { "a": { "enum": ["a"] } } }', '[{ "a": "a"}]');


SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "data", "table": "tblName", "column": "colName" } }', '{}');
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "data", "table": "tblName", "column": "colName", "isArray": true } }', '[{}]');
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "table" } }', '"tblName"'::JSONB);
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "table", "isArray": true } }', '["tblName"]');
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "column" } }', '{  "table": "tblName", "column": "colName" }');
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "lookup": { "type": "schema", "object": "column", "isArray": true } }', '{  "table": "tblName", "column": ["colName"] }');

SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "type": "time"}', '"22:22"');
SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "type": "Date"}', '"2222-22-22"');


SELECT ${VALIDATE_SCHEMA_FUNCNAME}('{ "oneOf": ["number"]}','2');
`;
