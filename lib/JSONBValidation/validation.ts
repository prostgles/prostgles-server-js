import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import { getKeys, isEmpty, isObject } from "prostgles-types";
import { asValue } from "../PubSubManager/PubSubManager";
import { BaseColumn, JSONBColumnDef, StrictUnion } from "../TableConfig";


const PrimitiveTypes = ["boolean" , "number", "integer", "string", "any"] as const;
const DATA_TYPES = [
  ...PrimitiveTypes,
  ...PrimitiveTypes.map(v => `${v}[]` as `${typeof v}[]`)
] as const;
type DataType = typeof DATA_TYPES[number];

export namespace JSONB {

  export type BaseOptions = {
    /**
     * False by default
     */
    optional?: boolean;
    /**
     * False by default
     */
    nullable?: boolean;
    description?: string;
    title?: string;
  }; 

  export type BasicType = BaseOptions & {
    type: DataType;
    allowedValues?: any[];
    oneOf?: undefined;
    arrayOf?: undefined;
    enum?: undefined;
  };
  
  export type ObjectType = BaseOptions & {
    type: ObjectSchema;
    allowedValues?: undefined;
    oneOf?: undefined;
    arrayOf?: undefined;
    enum?: undefined;
  } 
  
  export type EnumType = BaseOptions & {
    type?: undefined;
    enum: readonly any[];
    oneOf?: undefined;
    arrayOf?: undefined;
    allowedValues?: undefined;
  };
  
  export type OneOf = BaseOptions & {
    type?: undefined;
    oneOf: readonly ObjectSchema[];
    arrayOf?: undefined;
    allowedValues?: undefined;
    enum?: undefined;
  }
  export type ArrayOf = BaseOptions & {
    type?: undefined;
    arrayOf: ObjectSchema;
    allowedValues?: undefined;
    oneOf?: undefined;
    enum?: undefined;
  }
   

  export type FieldTypeObj = 
  | BasicType
  | ObjectType
  | EnumType
  | OneOf
  | ArrayOf;

  export type FieldType = 
  | DataType 
  | FieldTypeObj;


  export type GetType<T extends FieldType | Omit<FieldTypeObj, "optional">> =
  | T extends { type: ObjectSchema } ? NestedSchemaObject<T["type"]> :
  | T extends "number" | { type: "number" } ? number :
  | T extends "boolean" | { type: "boolean" } ? boolean :
  | T extends "integer" | { type: "integer" } ? number :
  | T extends "string" | { type: "string" } ? string :
  | T extends "any" | { type: "any" } ? any :
  | T extends "number[]" | { type: "number[]" } ? number[] :
  | T extends "boolean[]" | { type: "boolean[]" } ? boolean[] :
  | T extends "integer[]" | { type: "integer[]" } ? number[] :
  | T extends "string[]" | { type: "string[]" } ? string[] :
  | T extends "any[]" | { type: "any[]" } ? any[] :
  | T extends { enum: readonly any[] } ? T["enum"][number] :

  | T extends { oneOf: readonly ObjectSchema[] } ? StrictUnion<NestedSchemaObject<T["oneOf"][number]>> :

  | T extends { arrayOf: ObjectSchema } ? NestedSchemaObject<T["arrayOf"]>[] :
  any;

  type IsOptional<F extends FieldType> = F extends DataType? false : F extends { optional: true }? true : false; 


  export type ObjectSchema = Record<string, FieldType>;
  export type JSONBSchema = Omit<FieldTypeObj, "optional">;

  export type NestedSchemaObject<S extends ObjectSchema> = (
    {
      [K in keyof S as IsOptional<S[K]> extends true ? K : never]?: GetType<S[K]>
    } & {
      [K in keyof S as IsOptional<S[K]> extends true ? never : K]: GetType<S[K]>
    }
  );
  export type SchemaObject<S extends JSONBSchema> = S["nullable"] extends true? (null | GetType<S>) : GetType<S>;
}


/** tests */
const s: JSONB.JSONBSchema = {
  type: {
    a: { type: "boolean" },
    c: { type: { c1: { type: "string" } } },
    arr: { arrayOf: { d: "string" } },
    o: {
      oneOf: [
        { z: { type: "integer" } },
        { z1: { type: "integer" } }
      ]
    }
  }
};

const ss: JSONB.SchemaObject<typeof s> = {
  a: true,
  arr: [{ d: "" }],
  c: {
    c1: ""
  },
  o: { z1: 23 }
}

const getFieldTypeObj = (rawFieldType: JSONB.FieldType): JSONB.FieldTypeObj => {
  if(typeof rawFieldType === "string") return { type: rawFieldType };

  return rawFieldType;
} 

export function validate<T>(obj: T, key: keyof T, rawFieldType: JSONB.FieldType): boolean {
  let err = `The provided value for ${JSON.stringify(key)} is of invalid type. Expecting `;
  const val = obj[key];
  const fieldType = getFieldTypeObj(rawFieldType);
  if ("type" in fieldType && fieldType.type) {
    if (typeof fieldType.type !== "string") {
      getKeys(fieldType.type).forEach(subKey => {
        validate(val, subKey as any, (fieldType.type as JSONB.ObjectSchema)[subKey])
      });
    }
    err += fieldType.type;
    if (fieldType.type === "boolean" && typeof val !== fieldType.type) throw new Error(err)
    if (fieldType.type === "string" && typeof val !== fieldType.type) throw new Error(err)
    if (fieldType.type === "number" && !Number.isFinite(val)) throw new Error(err)
    if (fieldType.type === "integer" && !Number.isInteger(val)) throw new Error(err);

  } else if (fieldType.enum) {
    err += `on of: ${fieldType.enum}`;
    if (!fieldType.enum.includes(val)) throw new Error(err)
  }
  return true
}

export function validateSchema<S extends JSONB.ObjectSchema>(schema: S, obj: JSONB.NestedSchemaObject<S>, objName?: string, optional = false) {
  if ((!schema || isEmpty(schema)) && !optional) throw new Error(`Expecting ${objName} to be defined`);
  getKeys(schema).forEach(k => validate(obj as any, k, schema[k]));
}


type ColOpts = { nullable?: boolean }; 

export function getSchemaTSTypes(schema: JSONB.ObjectSchema, leading = "", isOneOf = false): string {
  const getFieldType = (rawFieldType: JSONB.FieldType) => {
    const fieldType = getFieldTypeObj(rawFieldType);
    const nullType = (fieldType.nullable ? `null | ` : "");
    if (fieldType?.type) {
      if (typeof fieldType.type === "string") {
        const correctType = fieldType.type.replace("integer", "number");
        if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
          return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`
        }
        return nullType + correctType
      } else {
        return nullType + getSchemaTSTypes(fieldType.type, "", true)
      }
    } else if (fieldType?.enum) {
      return nullType + fieldType.enum.map(v => asValue(v)).join(" | ")
    } else if (fieldType?.oneOf) {
      return (fieldType.nullable ? `\n${leading}  | null` : "") + fieldType.oneOf.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("")
    } else if (fieldType?.arrayOf) {
      return (fieldType.nullable ? `\n${leading}  | null` : "") + getSchemaTSTypes(fieldType.arrayOf, "", true) + "[]";
    } else throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2)
  }

  const spacing = isOneOf ? " " : "  ";

  const res = `${leading}{ \n` + getKeys(schema).map(k => {
    const fieldType = getFieldTypeObj(schema[k]);
    return `${leading}${spacing}${k}${fieldType.optional ? "?" : ""}: ` + getFieldType(fieldType) + ";";
  }).join("\n") + ` \n${leading}}${isOneOf ? "" : ";"}`;

  /** Keep single line */
  if (isOneOf) return res.split("\n").join("");

  return res;
}

export function getJSONBSchemaTSTypes(schema: JSONB.JSONBSchema, colOpts: ColOpts, leading = "", isOneOf = false): string { 
  if (schema.arrayOf) {
    return (colOpts.nullable ? `\n${leading}  | null` : "") + getSchemaTSTypes(schema.arrayOf, leading, isOneOf) + "[]";
  } else if (schema.enum) {
    return (colOpts.nullable ? `\n${leading}  | null` : "") + schema.enum.map(v => asValue(v)).join(" | ")
  } else if (schema.oneOf) {
    return (colOpts.nullable ? `\n${leading}  | null` : "") + schema.oneOf.map(s => `\n${leading}  | ` + getSchemaTSTypes(s, "", true)).join("")
  } else {
    if(typeof schema.type === "string"){
      return (colOpts.nullable ? `null | ` : "") + schema.type;
    } else if(schema.type){
      return (colOpts.nullable ? `null | ` : "") + getSchemaTSTypes(schema.type, leading, isOneOf);
    }

    return "";
  }
}


const getJSONSchemaObject = (rawType: JSONB.FieldType | JSONB.JSONBSchema, rootInfo?: { id: string }): JSONSchema7 => {
  const {  type, arrayOf, description, nullable, oneOf, title, ...t } = 
    typeof rawType === "string"? ({ type: rawType } satisfies JSONB.FieldTypeObj) : 
    rawType; 

  let result: JSONSchema7 = {};
  const partialProps: Partial<JSONSchema7> = {
    ...((t.enum || t.allowedValues?.length) && { enum: t.allowedValues ?? t.enum!.slice(0) }),
    ...(!!description && { description }),
    ...(!!title && { title }),
  };

  if(t.enum?.length){
    partialProps.type = typeof t.enum[0]! as any;
  }

  if(typeof type === "string" || arrayOf){

    /** ARRAY */
    if(type && typeof type !== "string") {
      throw "Not expected";
    }
    if(arrayOf || type?.endsWith("[]")){

      const arrayItems = 
        arrayOf? getJSONSchemaObject({ type: arrayOf }) : 
        type?.startsWith("any")? { type: undefined } :
        {  
          type: type?.slice(0, -2) as JSONSchema7TypeName,
          ...(t.allowedValues && { enum: t.allowedValues }), 
        };
      result = {
        type: "array",
        items: arrayItems,
      }

    /** PRIMITIVES */
    } else {
      result = {
        type: type as JSONSchema7TypeName,
      }
    }

  /** OBJECT */
  } else if(isObject(type)){
    result = {
      type: "object",
      required: getKeys(type).filter(k => {
        const t = type[k];
        return typeof t === "string" || !t.optional
      }),
      properties: getKeys(type).reduce((a, k) => { 
        return {
          ...a,
          [k]: getJSONSchemaObject(type[k])
        }
      }, {}),
    }
  } else if(oneOf){
    result = {
      type: "object",
      oneOf: oneOf.map(s => getJSONSchemaObject({ type: s }))
    }
  }

  if (nullable) {
    const nullDef = { type: "null" } as const;
    if (result.oneOf) {
      result.oneOf.push(nullDef)
    } else if (result.enum && !result.enum.includes(null)) {
      result.enum.push(null)

    } else result = {
      type: 'object',
      oneOf: [result, nullDef]
    }
  }

  const rootSchema: JSONSchema7 | undefined = !rootInfo? undefined : {
    "$id": rootInfo?.id,
    "$schema": "https://json-schema.org/draft/2020-12/schema",
  };

  return {
    ...rootSchema,
    ...partialProps,
    ...result,
  }
}

export function getJSONBSchemaAsJSONSchema(tableName: string, colName: string, columnConfig: BaseColumn<{ en: 1 }> & JSONBColumnDef): JSONSchema7 {

  const schema: JSONB.JSONBSchema = {
     ...columnConfig,
    ...(columnConfig.jsonbSchema ?? { type: columnConfig.jsonbSchemaType! })
  };

  return getJSONSchemaObject(schema, { id: `${tableName}.${colName}` })
}

