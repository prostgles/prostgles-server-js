"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchemaTSTypes = exports.getPGCheckConstraint = exports.validateSchema = exports.validate = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("./PubSubManager");
/** tests */
const s = {
    a: { type: "boolean" },
    c: { type: { c1: { type: "string" } } },
    o: { oneOfTypes: [
            { z: { type: "integer" } },
            { z1: { type: "integer" } }
        ] }
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
    else if ("oneOf" in validation && validation.oneOf) {
        err += `on of: ${validation.oneOf}`;
        if (!validation.oneOf.includes(val))
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
function getPGCheckConstraint(args) {
    const { schema: s, escapedFieldName } = args;
    const jsToPGtypes = {
        "number": "::NUMERIC",
        "boolean": "::BOOLEAN",
        "string": "" // already a string
    };
    const kChecks = (k) => {
        const t = s[k];
        const checks = [];
        const valAsJson = `${escapedFieldName}->${(0, PubSubManager_1.asValue)(k)}`;
        const valAsText = `${escapedFieldName}->>${(0, PubSubManager_1.asValue)(k)}`;
        if (t.nullable)
            checks.push(`${valAsJson} IS NULL`);
        if (t.optional)
            checks.push(`${escapedFieldName} ? ${(0, PubSubManager_1.asValue)(k)} = FALSE`);
        if ("oneOfTypes" in t) {
            checks.push(`(${t.oneOfTypes.map(subType => getPGCheckConstraint({ escapedFieldName: valAsJson, schema: subType })).join(" OR ")})`);
        }
        else if ("oneOf" in t) {
            if (!t.oneOf.length || t.oneOf.some(v => v === undefined || !["number", "boolean", "string", null].includes(typeof v))) {
                throw new Error(`Invalid ValidationSchema for property: ${k} of field ${escapedFieldName}: oneOf cannot be empty AND can only contain: numbers, text, boolean, null`);
            }
            const oneOfHasNull = t.oneOf.includes(null);
            if (oneOfHasNull)
                checks.push(`${valAsText} IS NULL`);
            const oneOf = t.oneOf.filter(o => o !== null);
            oneOf.forEach(o => {
                checks.push(`(${valAsText})${jsToPGtypes[typeof o]} = ${(0, PubSubManager_1.asValue)(o)}`);
            });
        }
        else if ("type" in t) {
            if (typeof t.type === "string") {
                const correctType = t.type.replace("integer", "number");
                if (t.type.endsWith("[]")) {
                    /** Must add custom functions to type check each array element */
                    checks.push(`
          jsonb_typeof(${valAsJson}) = 'array' AND 
          ( jsonb_array_length(${valAsJson}) = 0 OR jsonb_typeof(jsonb_array_element(${valAsJson}, 1)) = ${(0, PubSubManager_1.asValue)(correctType.slice(0, -2))} )`);
                }
                else {
                    checks.push(`jsonb_typeof(${valAsJson}) = ${(0, PubSubManager_1.asValue)(correctType)} `);
                }
            }
            else {
                checks.push("( " + getPGCheckConstraint({ escapedFieldName: valAsJson, schema: t.type }) + " )");
            }
        }
        return checks.join(" OR ");
    };
    return (0, prostgles_types_1.getKeys)(s).map(k => "(" + kChecks(k) + ")").join(" AND ");
}
exports.getPGCheckConstraint = getPGCheckConstraint;
function getSchemaTSTypes(schema, leading = "", isOneOf = false) {
    const getFieldType = (def) => {
        if ("type" in def) {
            if (typeof def.type === "string") {
                const correctType = def.type.replace("integer", "number");
                return correctType;
            }
            else {
                return getSchemaTSTypes(def.type);
            }
        }
        else if ("oneOf" in def) {
            return def.oneOf.map(v => (0, PubSubManager_1.asValue)(v)).join(" | ");
        }
        else if ("oneOfTypes" in def) {
            return def.oneOfTypes.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("");
        }
        else
            throw "Unexpected getSchemaTSTypes";
    };
    let spacing = isOneOf ? " " : "  ";
    let res = `${leading}{ \n` + (0, prostgles_types_1.getKeys)(schema).map(k => {
        const def = schema[k];
        return `${leading}${spacing}${k}${def.optional ? "?" : ""}: ${def.nullable ? " null | " : ""} ` + getFieldType(def) + ";";
    }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;
    /** Keep single line */
    if (isOneOf)
        res = res.split("\n").join("");
    return res;
}
exports.getSchemaTSTypes = getSchemaTSTypes;
