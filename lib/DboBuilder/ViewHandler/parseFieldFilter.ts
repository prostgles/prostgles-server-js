import { FieldFilter, getKeys } from "prostgles-types";
import { isPlainObject } from "../DboBuilder";

/** 
* Filter string array
* @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
* @param {boolean} allow_empty - allow empty select. defaults to true
*/
export const parseFieldFilter = <AllowedKeys extends string[]>(
  fieldParams: FieldFilter<Record<AllowedKeys[number], any>> = "*", 
  allow_empty = true, 
  all_cols: AllowedKeys
): AllowedKeys | [""] => {
  
  if (!all_cols) throw "all_cols missing"
  const all_fields = all_cols;// || this.column_names.slice(0);
  let colNames: AllowedKeys = [] as any;
  const initialParams = JSON.stringify(fieldParams);

  if (fieldParams) {

    /* 
        "field1, field2, field4" | "*"
    */
    if (typeof fieldParams === "string") {
      fieldParams = fieldParams.split(",").map(k => k.trim());
    }

    /* string[] */
    if (Array.isArray(fieldParams) && !fieldParams.find(f => typeof f !== "string")) {
      /* 
          ["*"] 
      */
      if (fieldParams[0] === "*") {
        return all_fields.slice(0) as typeof all_fields;

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

      if (!getKeys(fieldParams).length) {
        return [] as unknown as typeof all_fields; //all_fields.slice(0) as typeof all_fields;
      }

      const keys = getKeys(fieldParams as {
        [key: string]: boolean | 0 | 1;
      }) as AllowedKeys;
      if (keys[0] === "") {
        if (allow_empty) {
          return [""];
        } else {
          throw "Empty value not allowed";
        }
      }

      validate(keys);

      keys.forEach(key => {
        const allowedVals = [true, false, 0, 1];
        if (!allowedVals.includes((fieldParams as any)[key])) throw `Invalid field selection value for: { ${key}: ${(fieldParams as any)[key]} }. \n Allowed values: ${allowedVals.join(" OR ")}`
      })

      const allowed = keys.filter(key => (fieldParams as any)[key]),
        disallowed = keys.filter(key => !(fieldParams as any)[key]);


      if (disallowed && disallowed.length) {
        return all_fields.filter(col => !disallowed.includes(col)) as typeof all_fields;
      } else {
        return [...allowed] as any;
      }

    } else {
      throw " Unrecognised field filter.\nExpecting any of:   string | string[] | { [field]: boolean } \n Received ->  " + initialParams;
    }

    validate(colNames);
  }
  return colNames as any;

  function validate(cols: AllowedKeys) {
    const bad_keys = cols.filter(col => !all_fields.includes(col));
    if (bad_keys && bad_keys.length) {
      throw "\nUnrecognised or illegal fields: " + bad_keys.join(", ");
    }
  }
}