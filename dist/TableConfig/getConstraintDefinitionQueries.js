"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConstraintDefinitionQueries = void 0;
const prostgles_types_1 = require("prostgles-types");
const getConstraintDefinitionQueries = ({ tableConf, tableName }) => {
    if ("constraints" in tableConf && tableConf.constraints) {
        const { constraints } = tableConf;
        if (!constraints) {
            return undefined;
        }
        const queries = [];
        if (Array.isArray(constraints)) {
            return constraints.map(c => `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD ${c}`);
        }
        else {
            const constraintNames = (0, prostgles_types_1.getKeys)(tableConf.constraints);
            constraintNames.map(constraintName => {
                const _cnstr = constraints[constraintName];
                const constraintDef = typeof _cnstr === "string" ? _cnstr : `${_cnstr.type} (${_cnstr.content})`;
                /** Drop constraints with the same name */
                // const existingConstraint = constraints.some(c => c.conname === constraintName);
                // if(existingConstraint){
                //   if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
                // }
                queries.push(`ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD CONSTRAINT ${(0, prostgles_types_1.asName)(constraintName)} ${constraintDef} ;`);
            });
            return queries;
        }
    }
};
exports.getConstraintDefinitionQueries = getConstraintDefinitionQueries;
//# sourceMappingURL=getConstraintDefinitionQueries.js.map