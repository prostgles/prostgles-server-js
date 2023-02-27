"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJSONBSchemaAsJSONSchema = exports.getJSONBSchemaTSTypes = exports.getSchemaTSTypes = exports.getPGCheckConstraint = exports.validateSchema = exports.validate = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("./PubSubManager/PubSubManager");
const PrimitiveTypes = ["boolean", "number", "integer", "string", "any"];
const DATA_TYPES = [
    ...PrimitiveTypes,
    ...PrimitiveTypes.map(v => `${v}[]`)
];
/** tests */
const s = {
    a: { type: "boolean" },
    c: { type: { c1: { type: "string" } } },
    arr: { arrayOf: { d: "string" } },
    o: {
        oneOf: [
            { z: { type: "integer" } },
            { z1: { type: "integer" } }
        ]
    }
};
const ss = {
    a: true,
    arr: [{ d: "" }],
    c: {
        c1: ""
    },
    o: { z1: 23 }
};
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
function getPGTypeCheck(path, fieldType) {
    if (!path.length)
        throw "path must not be empty";
    const { type, oneOf, arrayOf, nullable, optional, allowedValues } = getFieldTypeObj(fieldType);
    let jsPathCondition = "";
    let conditions = [];
    let orConditions = [];
    const escapedPath = path.slice(1).join(".");
    const key = path.length > 1 ? path.at(-1) : undefined;
    if (!key) {
        /** Is column root */
        if (nullable) {
            orConditions.push(`${escapedPath} IS NULL`);
        }
    }
    const escapedKeyFull = !key ? "@" : ("@." + JSON.stringify(key));
    const escapedKey = !key ? undefined : JSON.stringify(key);
    if (optional) {
        if (!escapedKey) {
            throw "Column root objects cannot be optional. Only nullable";
        }
    }
    else {
        if (escapedKey) {
            conditions.push(`strict $${escapedPath}.${escapedKey}`);
        }
    }
    if (nullable) {
        orConditions.push(`strict $${escapedPath} ? (${escapedKeyFull} == null)`);
    }
    const isPrimitive = typeof type === "string";
    const isPrimitiveArray = isPrimitive && type.endsWith("[]");
    if (isPrimitiveArray) {
        jsPathCondition = ` (@.type() == "array")`;
    }
    else if (isPrimitive) {
        if (type !== "any") {
            const isInteger = type === "integer";
            const validJSONType = isInteger ? "number" : type;
            jsPathCondition = !allowedValues?.length ?
                `${escapedKeyFull}.type() == ${JSON.stringify(validJSONType)} ${isInteger ? ` && ${escapedKeyFull}.ceiling() == ${escapedKeyFull}.floor() ` : ""}` :
                `${allowedValues.map(v => `${escapedKeyFull} == ${typeof v === "string" ? JSON.stringify(v) : v}`).join(" || ")} `;
            jsPathCondition += nullable ? ` || ${escapedKeyFull}.type() == "null" ` : "";
        }
        else {
            jsPathCondition += "@.type() != null";
        }
    }
    else if (type) {
        return Object.entries(type).map(([key, value]) => {
            return getPGTypeCheck([...path, JSON.stringify(key)], value);
        }).join(" AND ");
    }
    else if (oneOf) {
    }
    else if (arrayOf) {
    }
    const andCondition = [
        ...conditions,
        `strict $${escapedPath} ? (${jsPathCondition})`
    ].map(cond => `jsonb_path_exists(${(0, prostgles_types_1.asName)(path[0])}, ${(0, PubSubManager_1.asValue)(cond)})`).join(" AND \n");
    return [...orConditions.map(cond => `jsonb_path_exists(${(0, prostgles_types_1.asName)(path[0])}, ${(0, PubSubManager_1.asValue)(cond)})`), andCondition].join(" OR \n");
}
console.log(getPGTypeCheck(["col"], {
    type: {
        arr: { arrayOf: {
                z: "boolean",
                a: { optional: true, arrayOf: {
                        c: { type: "string[]", allowedValues: ["a", "ad"] }
                    }
                }
            }
        }
    }
}));
const jsc = {
    userGroupNames: { type: "string[]", description: "List of user types that this rule applies to" },
    dbsPermissions: { description: "Permission types and rules for the state database", optional: true, type: {
            createWorkspaces: { type: "boolean", optional: true },
            viewPublishedWorkspaces: { type: {
                    workspaceIds: { type: "string[]" }
                }, optional: true },
        } },
    dbPermissions: { description: "Permission types and rules for this (connection_id) database", oneOf: [
            {
                type: { enum: ["Run SQL"], description: "Allows complete access to the database" },
                allowSQL: { type: "boolean", optional: true },
            },
            {
                type: { enum: ["All views/tables"], description: "Custom access (View/Edit/Remove) to all tables" },
                allowAllTables: { type: "string[]", allowedValues: ["select", "insert", "update", "delete"] }
                // allowAllTables: { type: "string[]"  }  
            },
            {
                type: { enum: ["Custom"], description: "Fine grained access to specific tables" },
                customTables: { type: "any[]" },
            }
        ] },
    methods: {
        description: "Custom server-side functions",
        optional: true,
        type: "any[]",
    }
};
const d = {
    v: null
};
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
        const fieldType = getFieldTypeObj(s[k]);
        const checks = [];
        const valAsJson = `${escapedFieldName}->${(0, PubSubManager_1.asValue)(k)}`;
        const valAsText = `${escapedFieldName}->>${(0, PubSubManager_1.asValue)(k)}`;
        if (fieldType.nullable)
            checks.push(`${valAsJson} IS NULL`);
        if (fieldType.optional)
            checks.push(`${escapedFieldName} ? ${(0, PubSubManager_1.asValue)(k)} = FALSE`);
        if (fieldType?.arrayOf) {
            // checks.push
        }
        else if (fieldType?.oneOf) {
            checks.push(`(${fieldType.oneOf.map(subType => getPGCheckConstraint({ escapedFieldName: valAsJson, schema: subType, nullable, optional: fieldType.optional }, depth + 1)).join(" OR ")})`);
        }
        else if ("enum" in fieldType) {
            if (!fieldType.enum?.length || fieldType.enum.some(v => v === undefined || !["number", "boolean", "string", null].includes(typeof v))) {
                throw new Error(`Invalid ValidationSchema for property: ${k} of field ${escapedFieldName}: enum cannot be empty AND can only contain: numbers, text, boolean, null`);
            }
            checks.push(`array_position(${(0, PubSubManager_1.asValue)(fieldType.enum)}::text[], ${valAsText}::text) IS NOT NULL`);
        }
        else if ("type" in fieldType) {
            if (typeof fieldType.type === "string") {
                if (fieldType.type.endsWith("[]")) {
                    const correctType = fieldType.type.slice(0, -2);
                    let elemCheck = correctType === "any" ? "" : `AND ('{' || right(left(${valAsText},-1),-1) || '}')${jsToPGtypes[correctType]}[] IS NOT NULL`;
                    checks.push(`jsonb_typeof(${valAsJson}) = 'array' ${elemCheck}`);
                    if (fieldType.allowedValues) {
                        const types = Array.from(new Set(fieldType.allowedValues.map(v => typeof v)));
                        const allowedTypes = ["boolean", "number", "string"];
                        if (types.length !== 1 || !allowedTypes.includes(types[0])) {
                            throw new Error(`Invalid allowedValues (${fieldType.allowedValues}). Must be a non empty array with elements of same type. Allowed types: ${allowedTypes}`);
                        }
                        const type = types[0];
                        checks.push(`(${valAsText})${jsToPGtypes[type]}[] <@ ${(0, PubSubManager_1.asValue)(fieldType.allowedValues)}`);
                    }
                }
                else {
                    const correctType = fieldType.type.replace("integer", "number");
                    if (correctType !== "any") {
                        checks.push(`jsonb_typeof(${valAsJson}) = ${(0, PubSubManager_1.asValue)(correctType)} `);
                    }
                }
            }
            else {
                const check = getPGCheckConstraint({ escapedFieldName: valAsJson, schema: fieldType.type, nullable: !!fieldType.nullable, optional: !!fieldType.optional }, depth + 1).trim();
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
    const getFieldType = (rawFieldType) => {
        const fieldType = getFieldTypeObj(rawFieldType);
        const nullType = (fieldType.nullable ? `null | ` : "");
        if (fieldType?.type) {
            if (typeof fieldType.type === "string") {
                const correctType = fieldType.type.replace("integer", "number");
                if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
                    return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`;
                }
                return nullType + correctType;
            }
            else {
                return nullType + getSchemaTSTypes(fieldType.type, "", true);
            }
        }
        else if (fieldType?.enum) {
            return nullType + fieldType.enum.map(v => (0, PubSubManager_1.asValue)(v)).join(" | ");
        }
        else if (fieldType?.oneOf) {
            return (fieldType.nullable ? `\n${leading}  | null` : "") + fieldType.oneOf.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("");
        }
        else
            throw "Unexpected getSchemaTSTypes";
    };
    const spacing = isOneOf ? " " : "  ";
    const res = `${leading}{ \n` + (0, prostgles_types_1.getKeys)(schema).map(k => {
        const fieldType = getFieldTypeObj(schema[k]);
        return `${leading}${spacing}${k}${fieldType.optional ? "?" : ""}: ` + getFieldType(fieldType) + ";";
    }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;
    /** Keep single line */
    if (isOneOf)
        return res.split("\n").join("");
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
            const itemSchema = getFieldTypeObj(objDef[k]);
            const { nullable, optional, description, title } = itemSchema;
            let item = {};
            if (itemSchema.type) {
                const { type } = itemSchema;
                /**
                 * Is primitive or any
                 */
                if (typeof type === "string") {
                    const arrayType = type.endsWith("[]") ? type.slice(0, -2) : undefined;
                    if (arrayType) {
                        item = {
                            type: "array",
                            items: itemSchema.allowedValues ? {
                                enum: itemSchema.allowedValues
                            } : {
                                type: arrayType === "any" ? {} : arrayType
                            }
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
            else if (itemSchema?.enum) {
                item = {
                    type: typeof itemSchema.enum[0],
                    "enum": itemSchema.enum //.concat(nullable? [null] : [])
                };
            }
            else if (itemSchema?.oneOf) {
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
//# sourceMappingURL=validation.js.map