"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColConstraints = exports.getColConstraintsQuery = exports.getConstraintDefinitionQueries = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const getConstraintDefinitionQueries = ({ tableConf, tableName }) => {
    if ("constraints" in tableConf && tableConf.constraints) {
        const { constraints } = tableConf;
        if (!constraints) {
            return undefined;
        }
        if (Array.isArray(constraints)) {
            return constraints.map(c => ({ content: c, alterQuery: `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD ${c}` }));
        }
        else {
            const constraintNames = (0, prostgles_types_1.getKeys)(tableConf.constraints);
            return constraintNames.map(constraintName => {
                const _cnstr = constraints[constraintName];
                const constraintDef = typeof _cnstr === "string" ? _cnstr : `${_cnstr.type} (${_cnstr.content})`;
                /** Drop constraints with the same name */
                // const existingConstraint = constraints.some(c => c.conname === constraintName);
                // if(existingConstraint){
                //   if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
                // }
                const alterQuery = `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD CONSTRAINT ${(0, prostgles_types_1.asName)(constraintName)} ${constraintDef};`;
                return { name: constraintName, alterQuery, content: constraintDef };
            });
        }
    }
};
exports.getConstraintDefinitionQueries = getConstraintDefinitionQueries;
const getColConstraintsQuery = ({ column, table, types }) => {
    let query = `
    SELECT *
    FROM (             
      SELECT distinct c.conname as name, c.contype as type,
        pg_get_constraintdef(c.oid) as definition, 
        nsp.nspname as schema,
      (SELECT r.relname from pg_class r where r.oid = c.conrelid) as "table", 
      (SELECT array_agg(attname::text) from pg_attribute 
      where attrelid = c.conrelid and ARRAY[attnum] <@ c.conkey) as cols
      -- (SELECT array_agg(attname::text) from pg_attribute 
      -- where attrelid = c.confrelid and ARRAY[attnum] <@ c.confkey) as fcols, 
      -- (SELECT r.relname from pg_class r where r.oid = c.confrelid) as ftable
      FROM pg_catalog.pg_constraint c
      INNER JOIN pg_catalog.pg_class rel
      ON rel.oid = c.conrelid
      INNER JOIN pg_catalog.pg_namespace nsp
      ON nsp.oid = connamespace
    ) t   
    WHERE TRUE 
  `;
    if (table)
        query += `\nAND "table" = ${(0, PubSubManager_1.asValue)(table)}`;
    if (column)
        query += `\nAND cols @> ARRAY[${(0, PubSubManager_1.asValue)(column)}]`;
    if (types?.length)
        query += `\nAND type IN (${types.map(v => (0, PubSubManager_1.asValue)(v)).join(", ")})`;
    return query;
};
exports.getColConstraintsQuery = getColConstraintsQuery;
const getColConstraints = ({ db, column, table, types }) => {
    return db.manyOrNone((0, exports.getColConstraintsQuery)({ column, table, types }));
};
exports.getColConstraints = getColConstraints;
