import { AnyObject, FullFilter, isDefined } from "prostgles-types";
import { AuthResult } from "../AuthHandler";
import { LocalParams } from "../DboBuilder";
import { parseFieldFilter } from "../DboBuilder/ViewHandler/parseFieldFilter";
import { PublishParser } from "./PublishParser";
import { ParsedPublishTable, UpdateRule } from "./publishTypesAndUtils";

/**
 * Permissions for referencedTables columns are propagated to the file table (even if file table has no permissions)
 * File table existing permissions that include the referenced column resulting permissions are left as they are 
 * Select on a referenced column allows selecting from file table any records that join the referenced table and the select filters
 * Insert on a referenced column allows inserting a file (according to any file type/size rules) only if it is a nested from that table 
 * Update on a referenced column allows updating a file (delete and insert) only if it is a nested update from that table 
 * Delete on a referenced column table allows deleting any referenced file 
 */ 
export async function getFileTableRules (this: PublishParser, fileTableName: string, fileTablePublishRules: ParsedPublishTable | undefined, localParams: LocalParams, clientInfo: AuthResult | undefined) {
  const forcedDeleteFilters: FullFilter<AnyObject, void>[] = [];
  const forcedSelectFilters: FullFilter<AnyObject, void>[] = [];
  const forcedUpdateFilters: FullFilter<AnyObject, void>[] = []; 
  const allowedNestedInserts: { table: string; column: string }[] = [];
  const referencedColumns = this.prostgles.dboBuilder.tablesOrViews?.filter(t => !t.is_view && t.name !== fileTableName).map(t => {
    const refCols = t.columns.filter(c => c.references?.some(r => r.ftable === fileTableName));
    if(!refCols.length) return undefined;
    return {
      tableName: t.name,
      fileColumns: refCols.map(c => c.name),
      allColumns: t.columns.map(c => c.name),
    }
  }).filter(isDefined)
  if(referencedColumns?.length){
    for await (const { tableName, fileColumns, allColumns } of referencedColumns){
      const table_rules = await this.getTableRules({ localParams, tableName }, clientInfo);
      if(table_rules){
        fileColumns.map(column => {
          const path = [{ table: tableName, on: [{ id: column }] }];
          if(table_rules.delete){
            forcedDeleteFilters.push({
              $existsJoined: {
                path,
                filter: table_rules.delete.forcedFilter ?? {},
              }
            })
          }
          if(table_rules.select){
            const parsedFields = parseFieldFilter(table_rules.select.fields, false, allColumns);
            /** Must be allowed to view this column */
            if(parsedFields.includes(column as any)){
              forcedSelectFilters.push({
                $existsJoined: {
                  path,
                  filter: table_rules.select.forcedFilter ?? {},
                }
              });
            }
          }
          if(table_rules.insert){
            const parsedFields = parseFieldFilter(table_rules.insert.fields, false, allColumns);
            /** Must be allowed to view this column */
            if(parsedFields.includes(column as any)){
              allowedNestedInserts.push({ table: tableName, column });
            }
          }
          if(table_rules.update){
            const parsedFields = parseFieldFilter(table_rules.update.fields, false, allColumns);
            /** Must be allowed to view this column */
            if(parsedFields.includes(column as any)){
              forcedUpdateFilters.push({
                $existsJoined: {
                  path,
                  filter: table_rules.update.forcedFilter ?? {},
                }
              });
            }
          }
        })
      }
    }
  }

  const fileTableRule: ParsedPublishTable = {
    ...fileTablePublishRules,
  };

  const getForcedFilter = (rule: Pick<UpdateRule, "forcedFilter"> | undefined, forcedFilters: FullFilter<AnyObject, void>[]) => {
    return (rule && !rule.forcedFilter)?  {} : {
      forcedFilter: {
        $or: forcedFilters.concat(rule?.forcedFilter? [rule?.forcedFilter] : []),
      }
    }
  }
  if(forcedSelectFilters.length || fileTablePublishRules?.select){
    fileTableRule.select = {
      fields: "*",
      ...fileTablePublishRules?.select,
      ...getForcedFilter(fileTablePublishRules?.select, forcedSelectFilters),
    }
  }
  if(forcedDeleteFilters.length || fileTablePublishRules?.delete){
    fileTableRule.delete = {
      filterFields: "*",
      ...fileTablePublishRules?.delete,
      ...getForcedFilter(fileTablePublishRules?.delete, forcedDeleteFilters),
    }
  }
  if(forcedUpdateFilters.length || fileTablePublishRules?.update){
    fileTableRule.update = {
      fields: "*",
      ...fileTablePublishRules?.update,
      ...getForcedFilter(fileTablePublishRules?.update, forcedUpdateFilters),
    }
  }

  if(allowedNestedInserts.length || fileTablePublishRules?.insert){
    fileTableRule.insert = {
      fields: "*",
      ...fileTablePublishRules?.insert,
      allowedNestedInserts: fileTablePublishRules?.insert? undefined : allowedNestedInserts,
    }
  }

  /** Add missing implied methods (getColumns, getInfo) */
  const rules = await this.getTableRulesWithoutFileTable.bind(this)({ localParams, tableName: fileTableName }, clientInfo, { [fileTableName]: fileTableRule })
  return { rules, allowedInserts: allowedNestedInserts };
}