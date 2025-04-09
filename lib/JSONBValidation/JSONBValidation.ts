import { getKeys, getObjectEntries, isObject, JSONB } from "prostgles-types";

export const getFieldTypeObj = (rawFieldType: JSONB.FieldType): JSONB.FieldTypeObj => {
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

const getPropertyValidationError = (
  key: string,
  val: any,
  rawFieldType: JSONB.FieldType,
  path: string[] = []
): string | undefined => {
  let err = `${[...path, key].join(".")} is of invalid type. Expecting `;
  const fieldType = getFieldTypeObj(rawFieldType);
  const { type, allowedValues, nullable, optional } = fieldType;
  if (nullable && val === null) return;
  if (optional && val === undefined) return;
  if (allowedValues) {
    throw new Error(`Allowed values are not supported for validation`);
  }
  if (type) {
    if (typeof type !== "string") {
      for (const [subKey, subSchema] of getObjectEntries(type)) {
        return getPropertyValidationError(subKey, val, subSchema, [...path, subKey]);
      }
      return;
    }
    err += type;

    const { validator } = getValidator(type);
    const isValid = validator(val);
    if (!isValid) {
      return err;
    }
    return;
  }
  if (fieldType.enum) {
    err += `on of: ${fieldType.enum.join(", ")}`;
    if (!fieldType.enum.includes(val)) return err;
    return;
  }
  return `Could not validate field type: ${JSON.stringify(fieldType)}`;
};

export const getJSONBObjectSchemaValidationError = <S extends JSONB.ObjectType["type"]>(
  schema: S,
  obj: any,
  objName: string,
  optional = false
): { error: string; data?: undefined } | { error?: undefined; data: JSONB.GetObjectType<S> } => {
  if (obj === undefined && !optional) return { error: `Expecting ${objName} to be defined` };
  if (!isObject(obj)) {
    return { error: `Expecting ${objName} to be an object` };
  }
  for (const [k, objSchema] of Object.entries(schema)) {
    const error = getPropertyValidationError(k, obj[k], objSchema);
    if (error) {
      return { error };
    }
  }
  return { data: obj as JSONB.GetObjectType<S> };
};
export const validateJSONBObjectAgainstSchema = <S extends JSONB.ObjectType["type"]>(
  schema: S,
  obj: any,
  objName: string,
  optional = false
): obj is JSONB.GetObjectType<S> => {
  const { error } = getJSONBObjectSchemaValidationError(schema, obj, objName, optional);
  return error === undefined;
};
export const assertJSONBObjectAgainstSchema = <S extends JSONB.ObjectType["type"]>(
  schema: S,
  obj: any,
  objName: string,
  optional = false
): asserts obj is JSONB.GetObjectType<S> => {
  const { error } = getJSONBObjectSchemaValidationError(schema, obj, objName, optional);
  if (error) {
    throw new Error(error);
  }
};
