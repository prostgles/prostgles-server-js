import { asName, getKeys, isEmpty, isObject } from "prostgles-types";
import { asValue } from "./PubSubManager";

type BaseOptions = {
  optional?: boolean;
  nullable?: boolean;
};

type SimpleType = BaseOptions & ({
  type:  
  | "number" | "boolean" | "integer" | "string" 
  | "number[]" | "boolean[]" | "integer[]" | "string[]" 
  | ValidationSchema;

} | {
  oneOf: readonly any[];
})

export type OneOfTypes = BaseOptions & {
  oneOfTypes: readonly ValidationSchema[];
}
type FieldType = SimpleType | OneOfTypes;

type GetType<T extends FieldType> = 
| T extends { type: ValidationSchema }? SchemaObject<T["type"]> : 
| T extends { type: "number" }? number:
| T extends { type: "boolean" }? boolean:
| T extends { type: "integer" }? number:
| T extends { type: "string" }? string:
| T extends { type: "number[]" }? number[]:
| T extends { type: "boolean[]" }? boolean[]:
| T extends { type: "integer[]" }? number[]:
| T extends { type: "string[]" }? string[]:
| T extends { oneOf: readonly any[] }? T["oneOf"][number] : 

/** This needs fixing */
| T extends { oneOfTypes: readonly ValidationSchema[] }? SchemaObject<T["oneOfTypes"][number]> : 
any;

export type ValidationSchema = Record<string, FieldType>;
export type SchemaObject<S extends ValidationSchema> = ({
  [K in keyof S as S[K]["optional"] extends true? K : never]?: GetType<S[K]>
} & {
  [K in keyof S as S[K]["optional"] extends true? never : K]: GetType<S[K]>
});

/** tests */
const s = {
  a: { type: "boolean" },
  c: { type: { c1: { type: "string" } } },
  o: { oneOfTypes: [
    { z: { type: "integer" } },
    { z1: { type: "integer" } }
  ] }
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
  if("type" in validation && validation.type){
    if(typeof validation.type !== "string"){
      getKeys(validation.type).forEach(subKey => {
        validate(val, subKey as any, (validation.type as ValidationSchema)[subKey])
      });
    }
    err += validation.type;
    if(validation.type === "boolean" && typeof val !== validation.type) throw new Error(err)
    if(validation.type === "string" && typeof val !== validation.type) throw new Error(err)
    if(validation.type === "number" && !Number.isFinite(val)) throw new Error(err)
    if(validation.type === "integer" && !Number.isInteger(val)) throw new Error(err)
  } else if("oneOf" in validation && validation.oneOf){
    err += `on of: ${validation.oneOf}`;
    if(!validation.oneOf.includes(val)) throw new Error(err)
  }
  return true
}

export function validateSchema<S extends ValidationSchema>(schema: S, obj: SchemaObject<S>, objName?: string, optional = false){
  if((!schema || isEmpty(schema)) && !optional) throw new Error(`Expecting ${objName} to be defined`);
  getKeys(schema).forEach(k => validate(obj as any, k, schema[k]));
}

export function getPGCheckConstraint(args: { escapedFieldName: string; schema: ValidationSchema | OneOfTypes, nullable: boolean; isRootQuery?: boolean; }, depth: number): string {
  const { schema: s, escapedFieldName, nullable } = args;

  const jsToPGtypes = {
    "integer": "::INTEGER",
    "number": "::NUMERIC",
    "boolean": "::BOOLEAN",
    "string": "::TEXT"
  }

  const kChecks = (k: string, s: ValidationSchema) => {
    const t = s[k];
    const checks: string[] = [];
    const valAsJson = `${escapedFieldName}->${asValue(k)}`;
    const valAsText = `${escapedFieldName}->>${asValue(k)}`;
    if(t.nullable) checks.push(`${valAsJson} IS NULL`);
    checks.push(`jsonb_typeof(${escapedFieldName}) = 'object' ` + (t.optional? `AND ${escapedFieldName} ? ${asValue(k)} = FALSE` : ""));

    if("oneOfTypes" in t){
      checks.push(`(${t.oneOfTypes.map(subType => getPGCheckConstraint({ escapedFieldName: valAsJson, schema: subType, nullable }, depth + 1)).join(" OR ")})`)
    } else if("oneOf" in t){
      if(!t.oneOf.length || t.oneOf.some(v => v === undefined || !["number", "boolean", "string", null].includes(typeof v))) {
        throw new Error(`Invalid ValidationSchema for property: ${k} of field ${escapedFieldName}: oneOf cannot be empty AND can only contain: numbers, text, boolean, null`);
      }
      const oneOfHasNull = t.oneOf.includes(null);
      if(oneOfHasNull) checks.push(`${valAsText} IS NULL`);
    const oneOf = t.oneOf.filter(o => o !== null);
      oneOf.forEach(o => {
        checks.push(`(${valAsText})${(jsToPGtypes as any)[typeof o]} = ${asValue(o)}`);
      })
    } else if("type" in t){
      if(typeof t.type === "string") {
        if(t.type.endsWith("[]")){
          const correctType = t.type.slice(0, -2);
          checks.push(`jsonb_typeof(${valAsJson}) = 'array' AND ('{' || right(left(${valAsText},-1),-1) || '}')${jsToPGtypes[correctType as keyof typeof jsToPGtypes]}[] IS NOT NULL`)
        } else {
          const correctType = t.type.replace("integer", "number")
          checks.push(`jsonb_typeof(${valAsJson}) = ${asValue(correctType)} `)
        }
      } else {
        const check = getPGCheckConstraint({ escapedFieldName: valAsJson, schema: t.type, nullable: !!t.nullable }, depth + 1).trim();
        if(check) checks.push(`(${check})`)
      }
    }
    const result = checks.join(" OR ")
    if(!depth) return `COALESCE(${result}, false)`
    return result
  }

  const getSchemaChecks = (s: ValidationSchema) => getKeys(s).map(k => "(" + kChecks(k, s) + ")").join(" AND ")

  let q = "";
  if(isOneOfTypes(s)){
    q = s.oneOfTypes.map(t => `(${getSchemaChecks(t)})` ).join(" OR ");
  } else {
    q = getSchemaChecks(s);
  }
  return nullable? ` ${escapedFieldName} IS NULL OR (${q})` : q
}
type ColOpts = { nullable?: boolean };
const isOneOfTypes = (s: ValidationSchema | OneOfTypes): s is OneOfTypes => {

  if("oneOfTypes" in s){
    if(!Array.isArray(s.oneOfTypes)){
      throw "Expecting oneOfTypes to be an array of types";
    }
    return true;
  }
  return false;
}

export function getSchemaTSTypes(schema: ValidationSchema, leading = "", isOneOf = false): string {
  const getFieldType = (def: FieldType) => {
    const nullType = (def.nullable? `null | ` : "");
    if("type" in def){
      if(typeof def.type === "string"){
        const correctType = def.type.replace("integer", "number")
        return nullType + correctType
      } else {
        return nullType + getSchemaTSTypes(def.type, "", true)
      }
    } else if("oneOf" in def){
      return nullType + def.oneOf.map(v => asValue(v)).join(" | ")
    } else if("oneOfTypes" in def){
      return (def.nullable? `\n${leading}  | null` : "") + def.oneOfTypes.map(v => `\n${leading}  | ` + getSchemaTSTypes(v, "", true)).join("")
    } else throw "Unexpected getSchemaTSTypes"
  }

  let spacing = isOneOf? " " : "  ";

  let res = `${leading}{ \n` + getKeys(schema).map(k => {
    const def = schema[k];
    return `${leading}${spacing}${k}${def.optional? "?" : ""}: ` + getFieldType(def) + ";";
  }).join("\n") + ` \n${leading}}${isOneOf? "" : ";"}`;
  
  /** Keep single line */
  if(isOneOf) res = res.split("\n").join("")
  return res;
}

export function getJSONBSchemaTSTypes(schema: ValidationSchema | OneOfTypes, colOpts: ColOpts, leading = "", isOneOf = false): string {
  if(isOneOfTypes(schema)){
    return (colOpts.nullable? `\n${leading}  | null` : "") + schema.oneOfTypes.map(s => `\n${leading}  | ` + getSchemaTSTypes(s, "", true)).join("")
  } else {
    return (colOpts.nullable? `null | ` : "") + getSchemaTSTypes(schema, leading, isOneOf);
  }
}
