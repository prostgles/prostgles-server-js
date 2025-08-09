import { FieldFilter, getKeys } from "prostgles-types";
import { isPlainObject } from "../DboBuilder";

/**
 * Filter string array
 * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
 * @param {boolean} allow_empty - allow empty select. defaults to true
 */
export const parseFieldFilter = <AllowedKeys extends string[]>(
  fieldParams: FieldFilter<Record<AllowedKeys[number] | string, 1>> = "*",
  allow_empty = true,
  all_cols: AllowedKeys
): AllowedKeys | [""] => {
  let colNames: string[] = [];
  const initialParams = JSON.stringify(fieldParams);

  if (fieldParams) {
    /* 
        "field1, field2, field4" | "*"
    */
    if (typeof fieldParams === "string") {
      fieldParams = fieldParams.split(",").map((k) => k.trim());
    }

    /* string[] */
    if (Array.isArray(fieldParams) && !fieldParams.find((f) => typeof f !== "string")) {
      /* 
        ["*"] 
      */
      if (fieldParams[0] === "*") {
        return all_cols.slice(0) as typeof all_cols;

        /* 
          [""] 
        */
      } else if (fieldParams[0] === "") {
        if (allow_empty) {
          return [""];
        } else {
          throw "Empty value not allowed";
        }
        /* 
          ["field1", "field2", "field3"] 
        */
      } else {
        colNames = fieldParams.slice(0) as AllowedKeys;
      }

      /*
          { field1: true, field2: true } = only field1 and field2
          { field1: false, field2: false } = all fields except field1 and field2
      */
    } else if (isPlainObject(fieldParams)) {
      if (!getKeys(fieldParams as Record<string, any>).length) {
        return [] as unknown as typeof all_cols; //all_fields.slice(0) as typeof all_fields;
      }

      const keys = getKeys(
        fieldParams as {
          [key: string]: boolean | 0 | 1;
        }
      ) as AllowedKeys;
      if (keys[0] === "") {
        if (allow_empty) {
          return [""];
        } else {
          throw "Empty value not allowed";
        }
      }

      validate(keys);

      keys.forEach((key) => {
        const allowedVals = [true, false, 0, 1];
        if (!allowedVals.includes((fieldParams as any)[key]))
          throw `Invalid field selection value for: { ${key}: ${(fieldParams as any)[key]} }. \n Allowed values: ${allowedVals.join(" OR ")}`;
      });

      const allowed = keys.filter((key) => (fieldParams as any)[key]),
        disallowed = keys.filter((key) => !(fieldParams as any)[key]);

      if (disallowed.length) {
        return all_cols.filter((col) => !disallowed.includes(col)) as typeof all_cols;
      } else {
        return [...allowed] as AllowedKeys | [""];
      }
    } else {
      throw (
        " Unrecognised field filter.\nExpecting any of:   string | string[] | { [field]: boolean } \n Received ->  " +
        initialParams
      );
    }

    validate(colNames);
  }
  return colNames as AllowedKeys | [""];

  function validate(cols: string[]) {
    const bad_keys = cols.filter((col) => !all_cols.includes(col));
    if (bad_keys.length) {
      throw "\nUnrecognised or illegal fields: " + bad_keys.join(", ");
    }
  }
};
