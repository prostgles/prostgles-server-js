import { getKeys, getObjectEntries, isEmpty, isObject, JSONB } from "prostgles-types";

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
  value: any,
  rawFieldType: JSONB.FieldType,
  path: string[] = []
): string | undefined => {
  const err = `${path.join(".")} is of invalid type. Expecting ${getTypeDescription(rawFieldType).replaceAll("\n", "")}`;
  const fieldType = getFieldTypeObj(rawFieldType);

  const { type, allowedValues, nullable, optional } = fieldType;
  if (nullable && value === null) return;
  if (optional && value === undefined) return;
  if (allowedValues) {
    throw new Error(`Allowed values are not supported for validation`);
  }
  if (type) {
    if (isObject(type)) {
      if (!isObject(value)) {
        return err;
      }
      for (const [subKey, subSchema] of getObjectEntries(type)) {
        const error = getPropertyValidationError(value[subKey], subSchema, [...path, subKey]);
        if (error !== undefined) {
          return error;
        }
      }
      return;
    }

    const { validator } = getValidator(type);
    const isValid = validator(value);
    if (!isValid) {
      return err;
    }
    return;
  }

  if (fieldType.enum) {
    const otherOptions = [];
    if (fieldType.nullable) otherOptions.push(null);
    if (fieldType.optional) otherOptions.push(undefined);
    // err += `one of: ${JSON.stringify([...fieldType.enum, ...otherOptions]).slice(1, -1)}`;

    if (!fieldType.enum.includes(value)) return err;
    return;
  }

  const oneOf = fieldType.oneOf ?? fieldType.oneOfType?.map((type) => ({ type }));
  if (oneOf) {
    if (!oneOf.length) {
      return err + "to not be empty";
    }
    let firstError: string | undefined;
    const validMember = oneOf.find((member) => {
      const error = getPropertyValidationError(value, member, path);
      firstError ??= error;
      return error === undefined;
    });
    if (validMember) {
      return;
    }
    return err;
  }
  if (fieldType.record) {
    const { keysEnum, partial, values: valuesSchema } = fieldType.record;
    if (!isObject(value)) {
      return err + "object";
    }
    if (partial && isEmpty(value)) {
      return;
    }
    const valueKeys = getKeys(value);
    const missingKey = partial ? undefined : keysEnum?.find((key) => !valueKeys.includes(key));
    if (missingKey !== undefined) {
      return `${err} to have key ${missingKey}`;
    }
    const extraKeys = valueKeys.filter((key) => !keysEnum?.includes(key));
    if (extraKeys.length) {
      return `${err} has extra keys: ${extraKeys}`;
    }
    if (valuesSchema) {
      for (const [propKey, propValue] of Object.entries(value)) {
        const valError = getPropertyValidationError(propValue, valuesSchema, [...path, propKey]);
        if (valError !== undefined) {
          return `${valError}`;
        }
      }
    }
    return;
  }
  return `Could not validate field type. Some logic might be missing: ${JSON.stringify(fieldType)}`;
};

const getTypeDescription = (schema: JSONB.FieldType): string => {
  const schemaObj = getFieldTypeObj(schema);
  const { type, nullable, optional, oneOf, record } = schemaObj;
  const allowedTypes: any[] = [];
  if (nullable) allowedTypes.push("null");
  if (optional) allowedTypes.push("undefined");
  if (typeof type === "string") {
    allowedTypes.push(type);
  } else if (type) {
    if (isObject(type)) {
      const keyOpts: string[] = [];
      Object.entries(type).forEach(([key, value]) => {
        keyOpts.push(`${key}: ${getTypeDescription(value)}`);
      });
      allowedTypes.push(`{ ${keyOpts.join("; ")} }`);
    }
  }
  schemaObj.enum?.forEach((v) => {
    if (v === null) {
      allowedTypes.push("null");
    } else if (v === undefined) {
      allowedTypes.push("undefined");
    } else if (typeof v === "string") {
      allowedTypes.push(JSON.stringify(v));
    } else {
      allowedTypes.push(v);
    }
  });
  oneOf?.forEach((v) => {
    const type = getTypeDescription(v);
    allowedTypes.push(type);
  });
  if (record) {
    const { keysEnum, partial, values } = record;
    const optional = partial ? "?" : "";
    const valueType = !values ? "any" : getTypeDescription(values);
    if (keysEnum) {
      allowedTypes.push(`{ [${keysEnum.join(" | ")}]${optional}: ${valueType} }`);
    } else {
      allowedTypes.push(`{ [key: string]${optional}: ${valueType} }`);
    }
  }

  return allowedTypes.join(" | ");
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
    const error = getPropertyValidationError(obj[k], objSchema, [k]);
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
