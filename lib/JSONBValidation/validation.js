"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJSONBSchemaAsJSONSchema = exports.getJSONBSchemaTSTypes = exports.validateSchema = exports.validate = exports.JSONB = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const PrimitiveTypes = ["boolean", "number", "integer", "string", "any"];
const DATA_TYPES = [
    ...PrimitiveTypes,
    ...PrimitiveTypes.map(v => `${v}[]`)
];
var JSONB;
(function (JSONB) {
    const dd = {
        enum: [1],
        type: "any"
    };
})(JSONB = exports.JSONB || (exports.JSONB = {}));
/** tests */
const s = {
    type: {
        a: { type: "boolean" },
        c: { type: { c1: { type: "string" } } },
        arr: { arrayOfType: { d: "string" } },
        o: {
            oneOfType: [
                { z: { type: "integer" } },
                { z1: { type: "integer" } }
            ]
        }
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
function getJSONBSchemaTSTypes(schema, colOpts, leading = "") {
    const getFieldType = (rawFieldType, isOneOf = false) => {
        const fieldType = getFieldTypeObj(rawFieldType);
        const nullType = (fieldType.nullable ? `null | ` : "");
        /** Primitives */
        if (typeof fieldType?.type === "string") {
            const correctType = fieldType.type.replace("integer", "number");
            if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
                return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`;
            }
            return nullType + correctType;
            /** Object */
        }
        else if ((0, prostgles_types_1.isObject)(fieldType.type)) {
            const { type } = fieldType;
            const spacing = isOneOf ? " " : "  ";
            let objDef = `${leading}{ \n` + (0, prostgles_types_1.getKeys)(type).map(k => {
                const fieldType = getFieldTypeObj(type[k]);
                return `${leading}${spacing}${k}${fieldType.optional ? "?" : ""}: ` + getFieldType(fieldType) + ";";
            }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;
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
            return (fieldType.nullable ? `\n${leading}  | null` : "") + oneOf.map(v => `\n${leading}  | ` + getFieldType(v)).join("");
        }
        else if (fieldType?.arrayOf || fieldType?.arrayOfType) {
            const arrayOf = fieldType?.arrayOf || { type: fieldType?.arrayOfType };
            return (fieldType.nullable ? `\n${leading}  | null` : "") + getFieldType(arrayOf) + "[]";
        }
        else
            throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2);
    };
    return getFieldType({ ...schema, nullable: colOpts.nullable });
}
exports.getJSONBSchemaTSTypes = getJSONBSchemaTSTypes;
const getJSONSchemaObject = (rawType, rootInfo) => {
    const { type, arrayOf, arrayOfType, description, nullable, oneOf, oneOfType, title, ...t } = typeof rawType === "string" ? ({ type: rawType }) :
        rawType;
    let result = {};
    const partialProps = {
        ...((t.enum || t.allowedValues?.length) && { enum: t.allowedValues ?? t.enum.slice(0) }),
        ...(!!description && { description }),
        ...(!!title && { title }),
    };
    if (t.enum?.length) {
        partialProps.type = typeof t.enum[0];
    }
    if (typeof type === "string" || arrayOf || arrayOfType) {
        /** ARRAY */
        if (type && typeof type !== "string") {
            throw "Not expected";
        }
        if (arrayOf || arrayOfType || type?.endsWith("[]")) {
            const arrayItems = (arrayOf || arrayOfType) ? getJSONSchemaObject(arrayOf || { type: arrayOfType }) :
                type?.startsWith("any") ? { type: undefined } :
                    {
                        type: type?.slice(0, -2),
                        ...(t.allowedValues && { enum: t.allowedValues }),
                    };
            result = {
                type: "array",
                items: arrayItems,
            };
            /** PRIMITIVES */
        }
        else {
            result = {
                type: type,
            };
        }
        /** OBJECT */
    }
    else if ((0, prostgles_types_1.isObject)(type)) {
        result = {
            type: "object",
            required: (0, prostgles_types_1.getKeys)(type).filter(k => {
                const t = type[k];
                return typeof t === "string" || !t.optional;
            }),
            properties: (0, prostgles_types_1.getKeys)(type).reduce((a, k) => {
                return {
                    ...a,
                    [k]: getJSONSchemaObject(type[k])
                };
            }, {}),
        };
    }
    else if (oneOf || oneOfType) {
        const _oneOf = oneOf || oneOfType.map(type => ({ type }));
        result = {
            type: "object",
            oneOf: _oneOf.map(t => getJSONSchemaObject(t))
        };
    }
    if (nullable) {
        const nullDef = { type: "null" };
        if (result.oneOf) {
            result.oneOf.push(nullDef);
        }
        else if (result.enum && !result.enum.includes(null)) {
            result.enum.push(null);
        }
        else
            result = {
                type: 'object',
                oneOf: [result, nullDef]
            };
    }
    const rootSchema = !rootInfo ? undefined : {
        "$id": rootInfo?.id,
        "$schema": "https://json-schema.org/draft/2020-12/schema",
    };
    return {
        ...rootSchema,
        ...partialProps,
        ...result,
    };
};
function getJSONBSchemaAsJSONSchema(tableName, colName, columnConfig) {
    const schema = {
        ...columnConfig,
        ...(columnConfig.jsonbSchema ?? { type: columnConfig.jsonbSchemaType })
    };
    return getJSONSchemaObject(schema, { id: `${tableName}.${colName}` });
}
exports.getJSONBSchemaAsJSONSchema = getJSONBSchemaAsJSONSchema;
