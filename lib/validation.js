"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJSONBSchemaAsJSONSchema = exports.getJSONBSchemaTSTypes = exports.getSchemaTSTypes = exports.getPGCheckConstraint = exports.validateSchema = exports.validate = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("./PubSubManager");
/** tests */
const s = {
    a: { type: "boolean" },
    c: { type: { c1: { type: "string" } } },
    o: {
        oneOf: [
            { z: { type: "integer" } },
            { z1: { type: "integer" } }
        ]
    }
};
const ss = {
    a: true,
    c: {
        c1: ""
    },
    o: { z: 1, z1: 23 }
};
function validate(obj, key, validation) {
    let err = `The provided value for ${JSON.stringify(key)} is of invalid type. Expecting `;
    const val = obj[key];
    if ("type" in validation && validation.type) {
        if (typeof validation.type !== "string") {
            (0, prostgles_types_1.getKeys)(validation.type).forEach(subKey => {
                validate(val, subKey, validation.type[subKey]);
            });
        }
        err += validation.type;
        if (validation.type === "boolean" && typeof val !== validation.type)
            throw new Error(err);
        if (validation.type === "string" && typeof val !== validation.type)
            throw new Error(err);
        if (validation.type === "number" && !Number.isFinite(val))
            throw new Error(err);
        if (validation.type === "integer" && !Number.isInteger(val))
            throw new Error(err);
    }
    else if ("enum" in validation && validation.enum) {
        err += `on of: ${validation.enum}`;
        if (!validation.enum.includes(val))
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
function getPGCheckConstraint(args, depth) {
    const { schema: s, escapedFieldName, nullable, optional, isRootQuery } = args;
    const jsToPGtypes = {
        "integer": "::INTEGER",
        "number": "::NUMERIC",
        "boolean": "::BOOLEAN",
        "string": "::TEXT",
        "any": "::JSONB"
    };
    const kChecks = (k, s) => {
        const t = s[k];
        const checks = [];
        const valAsJson = `${escapedFieldName}->${(0, PubSubManager_1.asValue)(k)}`;
        const valAsText = `${escapedFieldName}->>${(0, PubSubManager_1.asValue)(k)}`;
        if (t.nullable)
            checks.push(`${valAsJson} IS NULL`);
        if (t.optional)
            checks.push(`${escapedFieldName} ? ${(0, PubSubManager_1.asValue)(k)} = FALSE`);
        if ("oneOf" in t) {
            checks.push(`(${t.oneOf.map(subType => getPGCheckConstraint({ escapedFieldName: valAsJson, schema: subType, nullable, optional: t.optional }, depth + 1)).join(" OR ")})`);
        }
        else if ("enum" in t) {
            if (!t.enum.length || t.enum.some(v => v === undefined || !["number", "boolean", "string", null].includes(typeof v))) {
                throw new Error(`Invalid ValidationSchema for property: ${k} of field ${escapedFieldName}: enum cannot be empty AND can only contain: numbers, text, boolean, null`);
            }
            // const oneOfHasNull = t.enum.includes(null);
            // if (oneOfHasNull) checks.push(`${valAsText} IS NULL`);
            // const _enum = t.enum.filter(o => o !== null);
            // _enum.forEach(o => {
            //   checks.push(`(${valAsText})${(jsToPGtypes as any)[typeof o]} = ${asValue(o)}`);
            // });
            checks.push(`array_position(${(0, PubSubManager_1.asValue)(t.enum)}::text[], ${valAsText}::text) IS NOT NULL`);
        }
        else if ("type" in t) {
            if (typeof t.type === "string") {
                if (t.type.endsWith("[]")) {
                    const correctType = t.type.slice(0, -2);
                    let elemCheck = correctType === "any" ? "" : `AND ('{' || right(left(${valAsText},-1),-1) || '}')${jsToPGtypes[correctType]}[] IS NOT NULL`;
                    checks.push(`jsonb_typeof(${valAsJson}) = 'array' ${elemCheck}`);
                }
                else {
                    const correctType = t.type.replace("integer", "number");
                    if (correctType !== "any") {
                        checks.push(`jsonb_typeof(${valAsJson}) = ${(0, PubSubManager_1.asValue)(correctType)} `);
                    }
                }
            }
            else {
                const check = getPGCheckConstraint({ escapedFieldName: valAsJson, schema: t.type, nullable: !!t.nullable, optional: !!t.optional }, depth + 1).trim();
                if (check)
                    checks.push(`(${check})`);
            }
        }
        const result = checks.join(" OR ");
        if (!depth)
            return `COALESCE(${result}, false)`;
        return result;
    };
    const getSchemaChecks = (s) => (0, prostgles_types_1.getKeys)(s).map(k => "(" + kChecks(k, s) + ")").join(" AND ");
    const checks = [];
    let typeChecks = "";
    if (isOneOfTypes(s)) {
        typeChecks = s.oneOf.map(t => `(${getSchemaChecks(t)})`).join(" OR ");
    }
    else {
        typeChecks = getSchemaChecks(s);
    }
    if (nullable)
        checks.push(` ${escapedFieldName} IS NULL `);
    checks.push(`jsonb_typeof(${escapedFieldName}) = 'object' ${typeChecks ? ` AND (${typeChecks})` : ""}`);
    return checks.join(" OR ");
}
exports.getPGCheckConstraint = getPGCheckConstraint;
const isOneOfTypes = (s) => {
    if ("oneOf" in s) {
        if (!Array.isArray(s.oneOf)) {
            throw "Expecting oneOf to be an array of types";
        }
        return true;
    }
    return false;
};
function getSchemaTSTypes(schema, leading = "", isOneOf = false) {
    const getFieldType = (def) => {
        const nullType = (def.nullable ? `null | ` : "");
        if ("type" in def) {
            if (typeof def.type === "string") {
                const correctType = def.type.replace("integer", "number");
                return nullType + correctType;
            }
            else {
                return nullType + getSchemaTSTypes(def.type, "", true);
            }
        }
        else if ("enum" in def) {
            return nullType + def.enum.map(v => (0, PubSubManager_1.asValue)(v)).join(" | ");
        }
        else if ("oneOf" in def) {
            return (def.nullable ? `\n${leading}  | null` : "") + def.oneOf.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("");
        }
        else
            throw "Unexpected getSchemaTSTypes";
    };
    let spacing = isOneOf ? " " : "  ";
    let res = `${leading}{ \n` + (0, prostgles_types_1.getKeys)(schema).map(k => {
        const def = schema[k];
        return `${leading}${spacing}${k}${def.optional ? "?" : ""}: ` + getFieldType(def) + ";";
    }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;
    /** Keep single line */
    if (isOneOf)
        res = res.split("\n").join("");
    return res;
}
exports.getSchemaTSTypes = getSchemaTSTypes;
function getJSONBSchemaTSTypes(schema, colOpts, leading = "", isOneOf = false) {
    if (isOneOfTypes(schema)) {
        return (colOpts.nullable ? `\n${leading}  | null` : "") + schema.oneOf.map(s => `\n${leading}  | ` + getSchemaTSTypes(s, "", true)).join("");
    }
    else {
        return (colOpts.nullable ? `null | ` : "") + getSchemaTSTypes(schema, leading, isOneOf);
    }
}
exports.getJSONBSchemaTSTypes = getJSONBSchemaTSTypes;
const getJSONSchemaObject = (objDef) => {
    const resultType = {
        type: "object",
        properties: (0, prostgles_types_1.getKeys)(objDef).reduce((a, k) => {
            const itemSchema = objDef[k];
            const { nullable, optional, description, title } = itemSchema;
            let item = {};
            if ("type" in itemSchema) {
                const { type } = itemSchema;
                /**
                 * Is primitive or any
                 */
                if (typeof type === "string") {
                    const arrayType = type.endsWith("[]") ? type.slice(0, -2) : undefined;
                    if (arrayType) {
                        item = {
                            type: "array",
                            items: { type: arrayType === "any" ? {} : arrayType }
                        };
                    }
                    else {
                        item = {
                            type: type === "any" ? {} : type
                        };
                    }
                    /**
                     * Is object
                     */
                }
                else {
                    item = getJSONSchemaObject(type);
                }
            }
            else if ("enum" in itemSchema) {
                item = {
                    type: typeof itemSchema.enum[0],
                    "enum": itemSchema.enum //.concat(nullable? [null] : [])
                };
            }
            else if ("oneOf" in itemSchema) {
                item = {
                    type: "object",
                    oneOf: itemSchema.oneOf.map(t => getJSONSchemaObject(t))
                };
            }
            else {
                throw new Error("Unexpected jsonbSchema itemSchema" + JSON.stringify({ itemSchema, objDef }, null, 2));
            }
            if (nullable) {
                const nullDef = { type: "null" };
                if (item.oneOf) {
                    item.oneOf.push(nullDef);
                }
                else if (item.enum) {
                    item.enum.push(null);
                }
                else
                    item = {
                        type: 'object',
                        oneOf: [item, nullDef]
                    };
            }
            return {
                ...a,
                [k]: {
                    ...item,
                    required: !optional,
                    ...(!!description && { description }),
                    ...(!!title && { title }),
                }
            };
        }, {})
    };
    return resultType;
};
function getJSONBSchemaAsJSONSchema(tableName, colName, columnConfig) {
    const schema = columnConfig.jsonbSchema;
    let jSchema = getJSONSchemaObject({
        field1: isOneOfTypes(schema) ? schema :
            { type: schema }
    }).properties.field1;
    return {
        "$id": `${tableName}.${colName}`,
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        ...jSchema,
        "title": columnConfig.label ?? colName,
        ...(!!columnConfig.info?.hint && { description: columnConfig.info?.hint }),
        required: !columnConfig.nullable
    };
}
exports.getJSONBSchemaAsJSONSchema = getJSONBSchemaAsJSONSchema;
