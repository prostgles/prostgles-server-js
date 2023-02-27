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
    oneOfType?: undefined;
    arrayOf?: undefined;
    arrayOfType?: undefined;
    enum?: undefined;
  };
  
  export type ObjectType = BaseOptions & {
    type: ObjectSchema;
    allowedValues?: undefined;
    oneOf?: undefined;
    oneOfType?: undefined;
    arrayOf?: undefined;
    arrayOfType?: undefined;
    enum?: undefined;
  } 
  
  export type EnumType = BaseOptions & {
    type?: undefined;
    enum: readonly any[];
    oneOf?: undefined;
    oneOfType?: undefined;
    arrayOf?: undefined;
    arrayOfType?: undefined;
    allowedValues?: undefined;
  };
  
  export type OneOf = BaseOptions & {
    type?: undefined;
    arrayOf?: undefined;
    arrayOfType?: undefined;
    allowedValues?: undefined;
    enum?: undefined;
  } & ({
    oneOf?: undefined;
    oneOfType: readonly ObjectSchema[];
  } | {
    oneOf: FieldType[];
    oneOfType?: undefined;
  })
  export type ArrayOf = BaseOptions & {
    type?: undefined;
    allowedValues?: undefined;
    oneOf?: undefined;
    oneOfType?: undefined;
    enum?: undefined;
  } & ({
    arrayOf?: undefined;
    arrayOfType: ObjectSchema;
  } | {
    arrayOf: FieldType;
    arrayOfType?: undefined;
  });
   
  export type RecordType = BaseOptions & {
    type?: undefined;
    allowedValues?: undefined;
    oneOf?: undefined;
    oneOfType?: undefined;
    arrayOf?: undefined;
    arrayOfType?: undefined;
    enum?: undefined;
    record: {
      keysEnum?: readonly string[];
      values?: FieldType;
    }
  }

  export type FieldTypeObj = StrictUnion<
  | BasicType
  | ObjectType
  | EnumType
  | OneOf
  | ArrayOf
  | RecordType
>;

  export type FieldType = 
  | DataType 
  | FieldTypeObj;


  export type GetType<T extends FieldType | Omit<FieldTypeObj, "optional">> =
  | T extends { type: ObjectSchema } ? GetObjectType<T["type"]> :
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
  | T extends { "enum": readonly any[] } ? T["enum"][number] :
  | T extends { "record": RecordType["record"] } ? Record< 
    T["record"] extends { keysEnum: readonly string[] }? T["record"]["keysEnum"][number] : string, 
    T["record"] extends { values: FieldType }? GetType<T["record"]["values"]> : any
  > :

  | T extends { oneOf: FieldType[] } ? StrictUnion<GetType<T["oneOf"][number]>> :
  | T extends { oneOf: readonly ObjectSchema[] } ? StrictUnion<GetType<T["oneOf"][number]>> :

  | T extends { arrayOf: ObjectSchema } ? GetType<T["arrayOf"]>[] :
  | T extends { arrayOfType: ObjectSchema } ? GetType<T["arrayOfType"]>[] :
  any;

  type IsOptional<F extends FieldType> = F extends DataType? false : F extends { optional: true }? true : false; 

  const _r: GetType<{ record: { keysEnum: ["a", "b"], values: "integer[]" } }> = {
    a: [2],
    b: [221]
  }

  export type ObjectSchema = Record<string, FieldType>;
  export type JSONBSchema = Omit<FieldTypeObj, "optional">;

  const _dd: JSONBSchema = {
    enum: [1],
    type: "any"
  }

  export type GetObjectType<S extends ObjectSchema> = (
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
    arr: { arrayOfType: { d: "string" } },
    o: {
      oneOfType: [
        { z: { type: "integer" } },
        { z1: { type: "integer" } }
      ]
    }
  }
};

const _ss: JSONB.SchemaObject<typeof s> = {
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

export function validateSchema<S extends JSONB.ObjectSchema>(schema: S, obj: JSONB.GetObjectType<S>, objName?: string, optional = false) {
  if ((!schema || isEmpty(schema)) && !optional) throw new Error(`Expecting ${objName} to be defined`);
  getKeys(schema).forEach(k => validate(obj as any, k, schema[k]));
}


type ColOpts = { nullable?: boolean }; 


export function getJSONBSchemaTSTypes(schema: JSONB.JSONBSchema, colOpts: ColOpts, leading = ""): string { 
 
  const getFieldType = (rawFieldType: JSONB.FieldType, isOneOf = false, innerLeading = leading): string => {
    const fieldType = getFieldTypeObj(rawFieldType);
    const nullType = (fieldType.nullable ? `null | ` : "");
    
    /** Primitives */
    if (typeof fieldType?.type === "string") {
      const correctType = fieldType.type.replace("integer", "number");
      if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
        return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`
      }
      return nullType + correctType;

    /** Object */
    } else if (isObject(fieldType.type)) {
      const { type } = fieldType;
      const spacing = isOneOf ? " " : "  ";
      let objDef = `${innerLeading}{ \n` + getKeys(type).map(k => {
        const fieldType = getFieldTypeObj(type[k]);
        return `${innerLeading}${spacing}${k}${fieldType.optional ? "?" : ""}: ` + getFieldType(fieldType, true) + ";";
      }).join("\n") + ` \n${innerLeading}}`;
      if(!objDef.endsWith(";") && !isOneOf){
        objDef += ";";
      }
    
      /** Keep single line */
      if (isOneOf){
        objDef = objDef.split("\n").join("");
      }
      return nullType + objDef;

    } else if (fieldType?.enum) {
      return nullType + fieldType.enum.map(v => asValue(v)).join(" | ");

    } else if (fieldType?.oneOf || fieldType?.oneOfType) {
      const oneOf = fieldType?.oneOf || fieldType?.oneOfType.map(type => ({ type }));
      return (fieldType.nullable ? `\n${innerLeading}  | null` : "") + oneOf.map(v => `\n${innerLeading}  | ` + getFieldType(v, true)).join("");

    } else if (fieldType?.arrayOf || fieldType?.arrayOfType) {
      const arrayOf = fieldType?.arrayOf || { type: fieldType?.arrayOfType };
      return (fieldType.nullable ? `null | ` : "") + getFieldType(arrayOf, true) + "[]";

    } else if (fieldType?.record) {
      const { keysEnum, values } = fieldType.record;
      return `${fieldType.nullable ? `null |` : ""} Record<${keysEnum?.map(v => asValue(v)).join(" | ") ?? "string"}, ${!values? "any" : getFieldType(values, true)}>`

    } else throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2)
  } 
 
  return getFieldType({ ...schema as any, nullable: colOpts.nullable }, undefined, leading);
}


const getJSONSchemaObject = (rawType: JSONB.FieldType | JSONB.JSONBSchema, rootInfo?: { id: string }): JSONSchema7 => {
  const {  type, arrayOf, arrayOfType, description, nullable, oneOf, oneOfType, title, record, ...t } = 
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

  if(typeof type === "string" || arrayOf || arrayOfType){

    /** ARRAY */
    if(type && typeof type !== "string") {
      throw "Not expected";
    }
    if(arrayOf || arrayOfType || type?.endsWith("[]")){
      const arrayItems = 
        (arrayOf || arrayOfType)? getJSONSchemaObject(arrayOf || { type: arrayOfType }) : 
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
  } else if(oneOf || oneOfType){
    const _oneOf = oneOf || oneOfType!.map(type => ({ type }))
    result = {
      type: "object",
      oneOf: _oneOf.map(t => getJSONSchemaObject(t))
    }
  } else if(record){
    result = {
      type: "object",
      ...(record.values && !record.keysEnum && { additionalProperties: getJSONSchemaObject(record.values) }),
      ...(record.keysEnum && { properties: record.keysEnum.reduce((a, v) => ({ 
        ...a,
        [v]: !record.values? { type: {} } : getJSONSchemaObject(record.values)
       }), {}) })
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

