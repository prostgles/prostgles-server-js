import { getKeys, isEmpty, isObject, JSONB, TableSchema } from "prostgles-types";
import { postgresToTsType } from "../DboBuilder/DboBuilder";
import { asValue } from "../PubSubManager/PubSubManager";

const getFieldTypeObj = (rawFieldType: JSONB.FieldType): JSONB.FieldTypeObj => {
  if (typeof rawFieldType === "string") return { type: rawFieldType };

  return rawFieldType;
};

type DataType = JSONB.FieldTypeObj["type"];
type ElementType<T extends DataType> = T extends `${infer E}[]` ? E : never;
type ArrayTypes = Extract<DataType, `${string}[]`>;
type NonArrayTypes = Extract<Exclude<DataType, ArrayTypes>, string>;
const PRIMITIVE_VALIDATORS: Record<NonArrayTypes, (val: any) => boolean> = {
  string: (val) => typeof val === "string",
  number: (val) => typeof val === "number" && Number.isFinite(val),
  integer: (val) => typeof val === "number" && Number.isInteger(val),
  boolean: (val) => typeof val === "boolean",
  time: (val) => typeof val === "string",
  timestamp: (val) => typeof val === "string",
  any: (val) => typeof val !== "function" && typeof val !== "symbol",
  Date: (val) => typeof val === "string",
  Lookup: () => {
    throw new Error("Lookup type is not supported for validation");
  },
};
const PRIMITIVE_VALIDATORS_KEYS = getKeys(PRIMITIVE_VALIDATORS);
const getElementType = <T extends DataType>(type: T): undefined | ElementType<T> => {
  if (typeof type === "string" && type.endsWith("[]")) {
    const elementType = type.slice(0, -2);
    if (!PRIMITIVE_VALIDATORS_KEYS.includes(elementType as NonArrayTypes)) {
      throw new Error(`Unknown array field type ${type}`);
    }
    return elementType as ElementType<T>;
  }
};

const getValidator = (type: Extract<DataType, string>) => {
  const elem = getElementType(type);
  if (elem) {
    const validator = PRIMITIVE_VALIDATORS[elem];
    return {
      isArray: true,
      validator: (v: any) => Array.isArray(v) && v.every((v) => validator(v)),
    };
  }
  const validator = PRIMITIVE_VALIDATORS[type as NonArrayTypes];
  if (!(validator as any)) {
    throw new Error(`Unknown field type ${type}`);
  }
  return { isArray: false, validator };
};

const validateProperty = (key: string, val: any, rawFieldType: JSONB.FieldType): boolean => {
  let err = `The provided value for ${JSON.stringify(key)} is of invalid type. Expecting `;
  const fieldType = getFieldTypeObj(rawFieldType);
  const { type, allowedValues, nullable, optional } = fieldType;
  if (nullable && val === null) return true;
  if (optional && val === undefined) return true;
  if (allowedValues) {
    throw new Error(`Allowed values are not supported for validation`);
  }
  if (type) {
    if (typeof type !== "string") {
      getKeys(type).forEach((subKey) => {
        validateProperty(subKey, val, (fieldType.type as JSONB.ObjectType["type"])[subKey]!);
      });
      return true;
    }
    err += fieldType.type;

    const { validator } = getValidator(type);
    const isValid = validator(val);
    if (!isValid) {
      throw new Error(err);
    }
    return true;
  }
  if (fieldType.enum) {
    err += `on of: ${fieldType.enum.join(", ")}`;
    if (!fieldType.enum.includes(val)) throw new Error(err);
    return true;
  }
  throw new Error(`Could not validate field type: ${JSON.stringify(fieldType)}`);
};

export const validateValueUsingJSONBSchema = <S extends JSONB.ObjectType["type"]>(
  schema: S,
  obj: any,
  objName?: string,
  optional = false
): obj is JSONB.GetObjectType<S> => {
  if (obj === undefined && !optional) throw new Error(`Expecting ${objName} to be defined`);
  if (!isObject(obj)) {
    throw new Error(`Expecting ${objName} to be an object`);
  }
  Object.entries(schema).forEach(([k, objSchema]) => validateProperty(k, obj[k], objSchema));
  return true;
};

type ColOpts = { nullable?: boolean };

export function getJSONBSchemaTSTypes(
  schema: JSONB.JSONBSchema,
  colOpts: ColOpts,
  outerLeading = "",
  tables: TableSchema[]
): string {
  const getFieldType = (
    rawFieldType: JSONB.FieldType,
    isOneOf = false,
    innerLeading = "",
    depth = 0
  ): string => {
    const fieldType = getFieldTypeObj(rawFieldType);
    const nullType = fieldType.nullable ? `null | ` : "";

    /** Primitives */
    if (typeof fieldType.type === "string") {
      const correctType = fieldType.type
        .replace("integer", "number")
        .replace("time", "string")
        .replace("timestamp", "string")
        .replace("Date", "string");

      if (fieldType.allowedValues && fieldType.type.endsWith("[]")) {
        return (
          nullType + ` (${fieldType.allowedValues.map((v) => JSON.stringify(v)).join(" | ")})[]`
        );
      }
      return nullType + correctType;

      /** Object */
    } else if (isObject(fieldType.type)) {
      const addSemicolonIfMissing = (v: string) => (v.trim().endsWith(";") ? v : v.trim() + ";");
      const { type } = fieldType;
      const spacing = isOneOf ? " " : "  ";
      let objDef =
        ` {${spacing}` +
        getKeys(type)
          .map((key) => {
            const fieldType = getFieldTypeObj(type[key]!);
            const escapedKey = isValidIdentifier(key) ? key : JSON.stringify(key);
            return (
              `${spacing}${escapedKey}${fieldType.optional ? "?" : ""}: ` +
              addSemicolonIfMissing(getFieldType(fieldType, true, undefined, depth + 1))
            );
          })
          .join(" ") +
        `${spacing}}`;
      if (!isOneOf) {
        objDef = addSemicolonIfMissing(objDef);
      }

      /** Keep single line */
      if (isOneOf) {
        objDef = objDef.split("\n").join("");
      }
      return nullType + objDef;
    } else if (fieldType.enum) {
      return nullType + fieldType.enum.map((v) => asValue(v)).join(" | ");
    } else if (fieldType.oneOf || fieldType.oneOfType) {
      const oneOf = fieldType.oneOf || fieldType.oneOfType.map((type) => ({ type }));
      return (
        (fieldType.nullable ? `\n${innerLeading} | null` : "") +
        oneOf
          .map((v) => `\n${innerLeading} | ` + getFieldType(v, true, undefined, depth + 1))
          .join("")
      );
    } else if (fieldType.arrayOf || fieldType.arrayOfType) {
      const arrayOf = fieldType.arrayOf || { type: fieldType.arrayOfType };
      return `${fieldType.nullable ? `null | ` : ""} ( ${getFieldType(arrayOf, true, undefined, depth + 1)} )[]`;
    } else if (fieldType.record) {
      const { keysEnum, values, partial } = fieldType.record;
      // TODO: ensure props with undefined values are not allowed in the TS type (strict union)
      const getRecord = (v: string) => (partial ? `Partial<Record<${v}>>` : `Record<${v}>`);
      return `${fieldType.nullable ? `null |` : ""} ${getRecord(`${keysEnum?.map((v) => asValue(v)).join(" | ") ?? "string"}, ${!values ? "any" : getFieldType(values, true, undefined, depth + 1)}`)}`;
    } else if (fieldType.lookup) {
      const l = fieldType.lookup;
      if (l.type === "data-def") {
        return `${fieldType.nullable ? `null |` : ""} ${getFieldType({
          type: {
            table: "string",
            column: "string",
            filter: { record: {}, optional: true },
            isArray: { type: "boolean", optional: true },
            searchColumns: { type: "string[]", optional: true },
            isFullRow: {
              optional: true,
              type: {
                displayColumns: { type: "string[]", optional: true },
              },
            },
            showInRowCard: { optional: true, record: {} },
          },
        })}`;
      }

      const isSChema = l.type === "schema";
      let type =
        isSChema ?
          l.object === "table" ?
            "string"
          : `{ "table": string; "column": string; }`
        : "";
      if (!isSChema) {
        const cols = tables.find((t) => t.name === l.table)?.columns;
        if (!l.isFullRow) {
          type = postgresToTsType(cols?.find((c) => c.name === l.column)?.udt_name ?? "text");
        } else {
          type =
            !cols ? "any" : (
              `{ ${cols.map((c) => `${JSON.stringify(c.name)}: ${c.is_nullable ? "null | " : ""} ${postgresToTsType(c.udt_name)}; `).join(" ")} }`
            );
        }
      }
      return `${fieldType.nullable ? `null | ` : ""}${type}${l.isArray ? "[]" : ""}`;
    } else throw "Unexpected getSchemaTSTypes: " + JSON.stringify({ fieldType, schema }, null, 2);
  };

  return getFieldType({ ...(schema as any), nullable: colOpts.nullable }, undefined, outerLeading);
}

const isValidIdentifier = (str: string) => {
  const identifierRegex = /^[A-Za-z$_][A-Za-z0-9$_]*$/;
  return identifierRegex.test(str);
};
