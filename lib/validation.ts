import { AnyObject, asName, getKeys, isEmpty, isObject } from "prostgles-types";
import { asValue } from "./PubSubManager/PubSubManager";
import { BaseColumn, ColumnConfig, JSONBColumnDef } from "./TableConfig";

type BaseOptions = {
  optional?: boolean;
  nullable?: boolean;
  description?: string;
  allowedValues?: any[];
  title?: string;
};


type SimpleType = BaseOptions & ({
  type:
  | "number" | "boolean" | "integer" | "string" 
  | "number[]" | "boolean[]" | "integer[]" | "string[]" 
  | "any[]"
  | "any" 
  | ValidationSchema;
} | {
  enum: readonly any[];
})

export type OneOf = BaseOptions & {
  oneOf: readonly ValidationSchema[];
}
type FieldType = SimpleType | OneOf;

type GetType<T extends FieldType> =
  | T extends { type: ValidationSchema } ? SchemaObject<T["type"]> :
  | T extends { type: "number" } ? number :
  | T extends { type: "boolean" } ? boolean :
  | T extends { type: "integer" } ? number :
  | T extends { type: "string" } ? string :
  | T extends { type: "any" } ? any :
  | T extends { type: "number[]" } ? number[] :
  | T extends { type: "boolean[]" } ? boolean[] :
  | T extends { type: "integer[]" } ? number[] :
  | T extends { type: "string[]" } ? string[] :
  | T extends { type: "any[]" } ? any[] :
  | T extends { enum: readonly any[] } ? T["enum"][number] :

  /** This needs fixing */
  | T extends { oneOf: readonly ValidationSchema[] } ? SchemaObject<T["oneOf"][number]> :
  any;

export type ValidationSchema = Record<string, FieldType>;
export type SchemaObject<S extends ValidationSchema> = ({
  [K in keyof S as S[K]["optional"] extends true ? K : never]?: GetType<S[K]>
} & {
    [K in keyof S as S[K]["optional"] extends true ? never : K]: GetType<S[K]>
  });

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
} as const;
const ss: SchemaObject<typeof s> = {
  a: true,
  c: {
    c1: ""
  },
  o: { z: 1, z1: 23 }
}

export function validate<T>(obj: T, key: keyof T, validation: FieldType): boolean {
  let err = `The provided value for ${JSON.stringify(key)} is of invalid type. Expecting `;
  const val = obj[key];
  if ("type" in validation && validation.type) {
    if (typeof validation.type !== "string") {
      getKeys(validation.type).forEach(subKey => {
        validate(val, subKey as any, (validation.type as ValidationSchema)[subKey])
      });
    }
    err += validation.type;
    if (validation.type === "boolean" && typeof val !== validation.type) throw new Error(err)
    if (validation.type === "string" && typeof val !== validation.type) throw new Error(err)
    if (validation.type === "number" && !Number.isFinite(val)) throw new Error(err)
    if (validation.type === "integer" && !Number.isInteger(val)) throw new Error(err)
  } else if ("enum" in validation && validation.enum) {
    err += `on of: ${validation.enum}`;
    if (!validation.enum.includes(val)) throw new Error(err)
  }
  return true
}

export function validateSchema<S extends ValidationSchema>(schema: S, obj: SchemaObject<S>, objName?: string, optional = false) {
  if ((!schema || isEmpty(schema)) && !optional) throw new Error(`Expecting ${objName} to be defined`);
  getKeys(schema).forEach(k => validate(obj as any, k, schema[k]));
}

export function getPGCheckConstraint(args: { escapedFieldName: string; schema: ValidationSchema | OneOf, nullable: boolean; isRootQuery?: boolean; optional?: boolean; }, depth: number): string {
  const { schema: s, escapedFieldName, nullable, optional, isRootQuery } = args;

  const jsToPGtypes = {
    "integer": "::INTEGER",
    "number": "::NUMERIC",
    "boolean": "::BOOLEAN",
    "string": "::TEXT",
    "any": "::JSONB"
  }

  const kChecks = (k: string, s: ValidationSchema) => {
    const t = s[k];
    const checks: string[] = [];
    const valAsJson = `${escapedFieldName}->${asValue(k)}`;
    const valAsText = `${escapedFieldName}->>${asValue(k)}`;
    if (t.nullable) checks.push(`${valAsJson} IS NULL`);
    if (t.optional) checks.push(`${escapedFieldName} ? ${asValue(k)} = FALSE`);

    if ("oneOf" in t) {
      checks.push(`(${t.oneOf.map(subType => getPGCheckConstraint({ escapedFieldName: valAsJson, schema: subType, nullable, optional: t.optional }, depth + 1)).join(" OR ")})`)
    } else if ("enum" in t) {
      if (!t.enum.length || t.enum.some(v => v === undefined || !["number", "boolean", "string", null].includes(typeof v))) {
        throw new Error(`Invalid ValidationSchema for property: ${k} of field ${escapedFieldName}: enum cannot be empty AND can only contain: numbers, text, boolean, null`);
      }
      
      checks.push(`array_position(${asValue(t.enum)}::text[], ${valAsText}::text) IS NOT NULL`)
    } else if ("type" in t) {
      if (typeof t.type === "string") {
        if (t.type.endsWith("[]")) {
          const correctType = t.type.slice(0, -2);
          let elemCheck = correctType === "any" ? "" : `AND ('{' || right(left(${valAsText},-1),-1) || '}')${jsToPGtypes[correctType as keyof typeof jsToPGtypes]}[] IS NOT NULL`
          checks.push(`jsonb_typeof(${valAsJson}) = 'array' ${elemCheck}`);
          if(t.allowedValues){
            const types = Array.from(new Set(t.allowedValues.map(v => typeof v)));
            const allowedTypes = ["boolean", "number", "string"] as const;
            if(types.length !== 1 || !allowedTypes.includes(types[0] as any)){
              throw new Error(`Invalid allowedValues (${t.allowedValues}). Must be a non empty array with elements of same type. Allowed types: ${allowedTypes}`)
            }
            const type = types[0] as typeof allowedTypes[number];
            checks.push(`(${valAsText})${jsToPGtypes[type]}[] <@ ${asValue(t.allowedValues)}`)
          }
        } else {
          const correctType = t.type.replace("integer", "number");
          if (correctType !== "any") {
            checks.push(`jsonb_typeof(${valAsJson}) = ${asValue(correctType)} `)
          }
        }
      } else {
        const check = getPGCheckConstraint({ escapedFieldName: valAsJson, schema: t.type, nullable: !!t.nullable, optional: !!t.optional }, depth + 1).trim();
        if (check) checks.push(`(${check})`)
      }
    }
    const result = checks.join(" OR ")
    if (!depth) return `COALESCE(${result}, false)`
    return result
  }

  const getSchemaChecks = (s: ValidationSchema) => getKeys(s).map(k => "(" + kChecks(k, s) + ")").join(" AND ")

  const checks: string[] = [];
  let typeChecks = "";
  if (isOneOfTypes(s)) {
    typeChecks = s.oneOf.map(t => `(${getSchemaChecks(t)})`).join(" OR ");
  } else {
    typeChecks = getSchemaChecks(s);
  }
  if (nullable) checks.push(` ${escapedFieldName} IS NULL `);
  checks.push(`jsonb_typeof(${escapedFieldName}) = 'object' ${typeChecks ? ` AND (${typeChecks})` : ""}`);
  return checks.join(" OR ");
}
type ColOpts = { nullable?: boolean };
const isOneOfTypes = (s: ValidationSchema | OneOf): s is OneOf => {

  if ("oneOf" in s) {
    if (!Array.isArray(s.oneOf)) {
      throw "Expecting oneOf to be an array of types";
    }
    return true;
  }
  return false;
}

export function getSchemaTSTypes(schema: ValidationSchema, leading = "", isOneOf = false): string {
  const getFieldType = (def: FieldType) => {
    const nullType = (def.nullable ? `null | ` : "");
    if ("type" in def) {
      if (typeof def.type === "string") {
        const correctType = def.type.replace("integer", "number");
        if(def.allowedValues && def.type.endsWith("[]")){
          return nullType + ` (${def.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`
        }
        return nullType + correctType
      } else {
        return nullType + getSchemaTSTypes(def.type, "", true)
      }
    } else if ("enum" in def) {
      return nullType + def.enum.map(v => asValue(v)).join(" | ")
    } else if ("oneOf" in def) {
      return (def.nullable ? `\n${leading}  | null` : "") + def.oneOf.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("")
    } else throw "Unexpected getSchemaTSTypes"
  }

  let spacing = isOneOf ? " " : "  ";

  let res = `${leading}{ \n` + getKeys(schema).map(k => {
    const def = schema[k];
    return `${leading}${spacing}${k}${def.optional ? "?" : ""}: ` + getFieldType(def) + ";";
  }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;

  /** Keep single line */
  if (isOneOf) res = res.split("\n").join("")
  return res;
}

export function getJSONBSchemaTSTypes(schema: ValidationSchema | OneOf, colOpts: ColOpts, leading = "", isOneOf = false): string {
  if (isOneOfTypes(schema)) {
    return (colOpts.nullable ? `\n${leading}  | null` : "") + schema.oneOf.map(s => `\n${leading}  | ` + getSchemaTSTypes(s, "", true)).join("")
  } else {
    return (colOpts.nullable ? `null | ` : "") + getSchemaTSTypes(schema, leading, isOneOf);
  }
}

namespace JSTypes {
  type Base = {
    $id?: string;
    $schema?: string;
    title?: string;
    description?: string;
    required?: boolean;
    // nullable?: boolean;
    // optional?: boolean;
  }
  export type Any = {};

  export type Object<T extends AnyObject = AnyObject> = Base & {
    type: "object";
    properties: Record<keyof T, Schema>;
  }
  export type Enum = Base & {
    type: "string" | "number";
    enum: (string | number)[]
  }
  export type Array = Base & {
    type: "array";
    items: (string | number)[]
  }
  export type OneOf = {
    oneOf: (Any | Object | Enum | Array)[]
  }
  export type Schema = 
  | Any
  | Object
  | Enum
  | Array
  | OneOf;
}

type JSONSchema = JSTypes.Schema

const getJSONSchemaObject = <T extends ValidationSchema>(objDef: T): JSTypes.Object<T> => {
  const resultType: JSONSchema = {
    type: "object",
    properties: getKeys(objDef).reduce((a, k) => {
      const itemSchema: FieldType = objDef[k];
      const { nullable, optional, description, title } = itemSchema;
      let item = {} as any;

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
              items: itemSchema.allowedValues? {
                enum: itemSchema.allowedValues
              } : { 
                type: arrayType === "any" ? {} : arrayType 
              }
            }
            
          } else {
            item = {
              type: type === "any" ? {} : type
            }
          }

          /**
           * Is object
           */
        } else {
          item = getJSONSchemaObject(type)

        }

      } else if ("enum" in itemSchema) {
        item = {
          type: typeof itemSchema.enum[0]!,
          "enum": itemSchema.enum //.concat(nullable? [null] : [])
        }
      } else if ("oneOf" in itemSchema) {
        item = {
          type: "object",
          oneOf: itemSchema.oneOf.map(t => getJSONSchemaObject(t))
        }
      } else {
        throw new Error("Unexpected jsonbSchema itemSchema" + JSON.stringify({ itemSchema, objDef }, null, 2))
      }

      if (nullable) {
        const nullDef = { type: "null" }
        if (item.oneOf){ 
          item.oneOf.push(nullDef)
        } else if(item.enum){
          item.enum.push(null)

        } else item = {
          type: 'object',
          oneOf: [item, nullDef]
        }
      }

      return {
        ...a,
        [k]: {
          ...item,
          required: !optional,
          ...(!!description && {description}),
          ...(!!title && {title}),
        }
      }
    }, {} as Record<string, JSTypes.Schema>)
  }

  return resultType as any;
}

export function getJSONBSchemaAsJSONSchema(tableName: string, colName: string, columnConfig: BaseColumn<{ en: 1 }> & JSONBColumnDef): JSONSchema {

  const schema = columnConfig.jsonbSchema;

  let jSchema: JSONSchema = getJSONSchemaObject({
    field1: 
      isOneOfTypes(schema) ? schema :
      { type: schema as ValidationSchema }
  }).properties.field1;

  return {
    "$id": `${tableName}.${colName}`,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    ...jSchema,
    "title": columnConfig.label ?? colName,
    ...(!!columnConfig.info?.hint && { description: columnConfig.info?.hint }),
    required: !columnConfig.nullable
  }

}