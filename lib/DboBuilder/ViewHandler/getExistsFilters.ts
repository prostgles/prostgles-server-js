import { EXISTS_KEY, EXISTS_KEYS, getKeys } from "prostgles-types";
import { ExistsFilterConfig } from "../../DboBuilder";
import { ViewHandler } from "./ViewHandler";

export const getExistsFilters = (filter: any, viewHandler: ViewHandler) => {

  /* Exists join filter */
  const ERR = "Invalid exists filter. \nExpecting somethibng like: \n | { $exists: { tableName.tableName2: Filter } } \n  | { $exists: { \"**.tableName3\": Filter } }\n | { path: string[]; filter: AnyObject }"
  const SP_WILDCARD = "**";
  const existsConfigs: ExistsFilterConfig[] = getKeys(filter)
    .filter((k ): k is typeof EXISTS_KEYS[number] => EXISTS_KEYS.includes(k as EXISTS_KEY) && !!Object.keys(filter[k] ?? {}).length)
    .map(key => {

      const isJoined = key.toLowerCase().includes("join");

      const filterValue = filter[key];
      /**
       * type ExistsJoined = 
       *   | { "table1.table2": { column: filterValue }  }
       *   | { path: string[]; filter: AnyObject }
       */
      const dataKeys = Object.keys(filterValue);
      const isDetailed = dataKeys.length === 2 && dataKeys.every(key => ["path", "filter"].includes(key));

      const firstKey = dataKeys[0]!;

      /**
       * Prevent some errors with table names that contain "."
       */
      const firstKeyIsATable = !!viewHandler.dboBuilder.dbo[firstKey];
      let tables = isDetailed? filterValue.path : (firstKeyIsATable? [firstKey] : firstKey.split("."));
      const f2 = isDetailed? filterValue.filter : filterValue[firstKey];
      let shortestJoin = false;

      if (!isJoined) {
        if (tables.length !== 1) throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }"
      } else {
        /* First part can be the ** param meaning shortest join. Will be overriden by anything in tableConfig */

        if (!tables.length) {
          throw ERR + "\nBut got: " + filterValue;
        }

        if (tables[0] === SP_WILDCARD) {
          tables = tables.slice(1);
          shortestJoin = true;
        }
      }

      return {
        key,
        existType: key as EXISTS_KEY,
        isJoined,
        shortestJoin,
        targetTableFilter: f2,
        tables
      }
    });
  /* Exists with exact path */
  // Object.keys(data).map(k => {
  //     let isthis = isPlainObject(data[k]) && !this.column_names.includes(k) && !k.split(".").find(kt => !this.dboBuilder.dbo[kt]);
  //     if(isthis) {
  //         existsKeys.push({
  //             key: k,
  //             notJoined: false,
  //             exactPaths: k.split(".")
  //         });
  //     }
  // });

  return existsConfigs;
}