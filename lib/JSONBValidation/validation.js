"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJSONBSchemaTSTypes = exports.validateSchema = exports.validate = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const getFieldTypeObj = (rawFieldType) => {
    if (typeof rawFieldType === "string")
        return { type: rawFieldType };
    return rawFieldType;
};
function validate(obj, key, rawFieldType) {
    let err = `The provided value for ${JSON.stringify(key)} is of invalid type. Expecting `;
    const val = obj[key];
    const fieldType = getFieldTypeObj(rawFieldType);
    if ("type" in fieldType && fieldType.type) {
        if (typeof fieldType.type !== "string") {
            (0, prostgles_types_1.getKeys)(fieldType.type).forEach(subKey => {
                validate(val, subKey, fieldType.type[subKey]);
            });
        }
        err += fieldType.type;
        if (fieldType.type === "boolean" && typeof val !== fieldType.type)
            throw new Error(err);
        if (fieldType.type === "string" && typeof val !== fieldType.type)
            throw new Error(err);
        if (fieldType.type === "number" && !Number.isFinite(val))
            throw new Error(err);
        if (fieldType.type === "integer" && !Number.isInteger(val))
            throw new Error(err);
    }
    else if (fieldType.enum) {
        err += `on of: ${fieldType.enum}`;
        if (!fieldType.enum.includes(val))
            throw new Error(err);
    }
    return true;
}
exports.validate = validate;
function validateSchema(schema, obj, objName, optional = false) {
    if ((!schema || (0, prostgles_types_1.isEmpty)(schema)) && !optional)
        throw new Error(`Expecting ${objName} to be defined`);
    (0, prostgles_types_1.getKeys)(schema).forEach(k => validate(obj, k, schema[k]));
}
exports.validateSchema = validateSchema;
function getJSONBSchemaTSTypes(schema, colOpts, outerLeading = "", tables) {
    const getFieldType = (rawFieldType, isOneOf = false, innerLeading = "", depth = 0) => {
        const fieldType = getFieldTypeObj(rawFieldType);
        const nullType = (fieldType.nullable ? `null | ` : "");
        /** Primitives */
        if (typeof fieldType?.type === "string") {
            const correctType = fieldType.type
                .replace("integer", "number")
                .replace("time", "string")
                .replace("timestamp", "string")
                .replace("Date", "string");
            if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
                return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`;
            }
            return nullType + correctType;
            /** Object */
        }
        else if ((0, prostgles_types_1.isObject)(fieldType.type)) {
            const { type } = fieldType;
            const spacing = isOneOf ? " " : "  ";
            let objDef = ` {${spacing}` + (0, prostgles_types_1.getKeys)(type).map(k => {
                const fieldType = getFieldTypeObj(type[k]);
                return `${spacing}${k}${fieldType.optional ? "?" : ""}: ` + getFieldType(fieldType, true, undefined, depth + 1) + ";";
            }).join(" ") + `${spacing}}`;
            if (!objDef.endsWith(";") && !isOneOf) {
                objDef += ";";
            }
            /** Keep single line */
            if (isOneOf) {
                objDef = objDef.split("\n").join("");
            }
            return nullType + objDef;
        }
        else if (fieldType?.enum) {
            return nullType + fieldType.enum.map(v => (0, PubSubManager_1.asValue)(v)).join(" | ");
        }
        else if (fieldType?.oneOf || fieldType?.oneOfType) {
            const oneOf = fieldType?.oneOf || fieldType?.oneOfType.map(type => ({ type }));
            return (fieldType.nullable ? `\n${innerLeading} | null` : "") + oneOf.map(v => `\n${innerLeading} | ` + getFieldType(v, true, undefined, depth + 1)).join("");
        }
        else if (fieldType?.arrayOf || fieldType?.arrayOfType) {
            const arrayOf = fieldType?.arrayOf || { type: fieldType?.arrayOfType };
            return `${fieldType.nullable ? `null | ` : ""} ( ${getFieldType(arrayOf, true, undefined, depth + 1)} )[]`;
        }
        else if (fieldType?.record) {
            const { keysEnum, values } = fieldType.record;
            return `${fieldType.nullable ? `null |` : ""} Record<${keysEnum?.map(v => (0, PubSubManager_1.asValue)(v)).join(" | ") ?? "string"}, ${!values ? "any" : getFieldType(values, true, undefined, depth + 1)}>`;
        }
        else if (fieldType?.lookup) {
            const l = fieldType.lookup;
            const isSChema = l.type === "schema";
            let type = isSChema ? "string" : "";
            if (!isSChema) {
                const cols = tables.find(t => t.name === l.table)?.columns;
                if (!l.isFullRow) {
                    type = (0, DboBuilder_1.postgresToTsType)(cols?.find(c => c.name === l.column)?.udt_name ?? "text");
                }
                else {
                    type = !cols ? "any" : `{ ${cols.map(c => `${JSON.stringify(c.name)}: ${c.is_nullable ? "null | " : ""} ${(0, DboBuilder_1.postgresToTsType)(c.udt_name)}; `).join(" ")} }`;
                }
            }
            return `${fieldType.nullable ? `null |` : ""} ${type}${l.isArray ? "[]" : ""}`;
        }
        else
            throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2);
    };
    return getFieldType({ ...schema, nullable: colOpts.nullable }, undefined, outerLeading);
}
exports.getJSONBSchemaTSTypes = getJSONBSchemaTSTypes;
