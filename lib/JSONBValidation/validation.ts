import { getKeys, isEmpty, isObject, JSONB, TableSchema } from "prostgles-types";
import { postgresToTsType } from "../DboBuilder";
import { asValue } from "../PubSubManager/PubSubManager";



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
        validate(val, subKey as any, (fieldType.type as JSONB.ObjectType["type"])[subKey]!)
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

export function validateSchema<S extends JSONB.ObjectType["type"]>(schema: S, obj: JSONB.GetObjectType<S>, objName?: string, optional = false) {
  if ((!schema || isEmpty(schema)) && !optional) throw new Error(`Expecting ${objName} to be defined`);
  getKeys(schema).forEach(k => validate(obj as any, k, schema[k]!));
}


type ColOpts = { nullable?: boolean }; 


export function getJSONBSchemaTSTypes(schema: JSONB.JSONBSchema, colOpts: ColOpts, outerLeading = "", tables: TableSchema[]): string { 
 
  const getFieldType = (rawFieldType: JSONB.FieldType, isOneOf = false, innerLeading = "", depth = 0): string => {
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
        return nullType + ` (${fieldType.allowedValues.map(v => JSON.stringify(v)).join(" | ")})[]`
      }
      return nullType + correctType;

    /** Object */
    } else if (isObject(fieldType.type)) {
      const addSemicolonIfMissing = (v: string) => v.trim().endsWith(";")? v : (v.trim() + ";");
      const { type } = fieldType;
      const spacing = isOneOf ? " " : "  ";
      let objDef = ` {${spacing}` + getKeys(type).map(k => {
        const fieldType = getFieldTypeObj(type[k]!);
        return `${spacing}${k}${fieldType.optional ? "?" : ""}: ` + addSemicolonIfMissing(getFieldType(fieldType, true, undefined, depth + 1));
      }).join(" ") + `${spacing}}`;
      if(!isOneOf){
        objDef = addSemicolonIfMissing(objDef);
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
      return (fieldType.nullable ? `\n${innerLeading} | null` : "") + oneOf.map(v => `\n${innerLeading} | ` + getFieldType(v, true, undefined, depth + 1)).join("");

    } else if (fieldType?.arrayOf || fieldType?.arrayOfType) {
      const arrayOf = fieldType?.arrayOf || { type: fieldType?.arrayOfType };
      return `${fieldType.nullable ? `null | ` : ""} ( ${getFieldType(arrayOf, true, undefined, depth + 1)} )[]`;

    } else if (fieldType?.record) {
      const { keysEnum, values, partial } = fieldType.record;
      // TODO: ensure props with undefined values are not allowed in the TS type (strict union)
      const getRecord = (v: string) => partial? `Partial<Record<${v}>>` : `Record<${v}>`;
      return `${fieldType.nullable ? `null |` : ""} ${getRecord(`${keysEnum?.map(v => asValue(v)).join(" | ") ?? "string"}, ${!values? "any" : getFieldType(values, true, undefined, depth + 1)}`)}`

    } else if(fieldType?.lookup){

      const l = fieldType.lookup;
      if(l.type === "data-def"){
        return `${fieldType.nullable ? `null |` : ""} ${
          getFieldType({ 
            type: {
              table: "string",
              column: "string", 
              filter: { record: {}, optional: true }, 
              isArray: { type: "boolean", optional: true }, 
              searchColumns: { type: "string[]", optional: true }, 
              isFullRow: { optional: true, type: { 
                displayColumns:{ type: "string[]", optional: true } 
              }}, 
              showInRowCard: { optional: true, record: {} }
            } 
          })
      }`;
      } 
      
      const isSChema = l.type === "schema";
      let type = isSChema? (l.object === "table"? "string" : `{ "table": string; "column": string; }`) : "";
      if(!isSChema){
        const cols = tables.find(t => t.name === l.table)?.columns
        if(!l.isFullRow){
          type = postgresToTsType(cols?.find(c => c.name === l.column)?.udt_name ?? "text");
        } else {
          type = !cols? "any" : `{ ${cols.map(c => `${JSON.stringify(c.name)}: ${c.is_nullable? "null | " : "" } ${postgresToTsType(c.udt_name)}; `).join(" ")} }`
        }
      }
      return `${fieldType.nullable ? `null | ` : ""}${type}${l.isArray? "[]" : ""}`;

    } else throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2)
  } 
 
  return getFieldType({ ...schema as any, nullable: colOpts.nullable }, undefined, outerLeading);
}

