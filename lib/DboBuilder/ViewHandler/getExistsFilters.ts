import { EXISTS_KEY, EXISTS_KEYS, getKeys } from "prostgles-types";
import { ExistsFilterConfig } from "../DboBuilder";
import { ViewHandler } from "./ViewHandler";
import { parseJoinPath } from "./parseJoinPath";

export const getExistsFilters = (filter: any, viewHandler: ViewHandler): ExistsFilterConfig[] => {

  /* Exists join filter */
  const ERR = "Invalid exists filter. \nExpecting something like: \n | { $exists: { tableName.tableName2: Filter } } \n  | { $exists: { \"**.tableName3\": Filter } }\n | { path: string[]; filter: AnyObject }"
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
       * Non joined exists are never detailed
       */
      if(!isJoined){
        const format = `Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }`
        if(isDetailed){
          throw `Exists filters cannot be detailed. ${format}`
        }
        const targetTable = firstKey;
        if (!viewHandler.dboBuilder.dbo[targetTable]) {
          throw `Table ${JSON.stringify(targetTable)} not found. ${format}`
        }
        const res: ExistsFilterConfig = {
          isJoined: false,
          existType: key as EXISTS_KEY,
          targetTableFilter: filterValue[firstKey],
          targetTable: firstKey,
        }
        return res;
      }

      /**
       * Prevent some errors with table names that contain "."
       */
      const firstKeyIsATable = !!viewHandler.dboBuilder.dbo[firstKey];
      const [path, targetTableFilter] = isDetailed? [filterValue.path, filterValue.filter] : [(firstKeyIsATable? [firstKey] : firstKey.split(".")), filterValue[firstKey]];

      if (!path.length) {
        throw ERR + "\nBut got: " + JSON.stringify(filterValue);
      }
      
      return {
        isJoined: true,
        existType: key as EXISTS_KEY,
        path,
        parsedPath: parseJoinPath({
          rawPath: path,
          rootTable: viewHandler.name,
          viewHandler,
          allowMultiOrJoin: true,
        }),
        targetTableFilter,
      }
    });

  return existsConfigs;
}