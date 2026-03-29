import type { TableInfo as TInfo } from "prostgles-types/dist";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { LocalParams } from "../DboBuilder";
import type { ViewHandler } from "./ViewHandler";

export async function getInfo(
  this: ViewHandler,
  lang?: string,
  param2?: any,
  param3?: any,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<TInfo> {
  const validatedTableRules = this.getValidatedRules(tableRules, localParams);

  const fileTableName = this.dboBuilder.prostgles.opts.fileTable?.tableName;

  await this._log({
    command: "getInfo",
    localParams,
    data: { lang },
    duration: 0,
  });
  const allowedFieldsToSelect = this.parseFieldFilter(tableRules?.select?.fields);
  const { requiredNestedInserts, allowedNestedInserts } = tableRules?.insert ?? {};
  const label = this.dboBuilder.prostgles.tableConfigurator?.getTableLabel({
    tableName: this.name,
    lang,
  });
  return {
    oid: this.tableOrViewInfo.oid,
    comment: this.tableOrViewInfo.comment,
    label,
    isFileTable:
      !this.is_media ? undefined : (
        {
          allowedNestedInserts,
        }
      ),
    isView: this.is_view,
    hasFiles: Boolean(
      !this.is_media &&
      fileTableName &&
      this.columns.some((c) => c.references?.some((r) => r.ftable === fileTableName)),
    ),
    fileTableName,
    dynamicRules: {
      update: Boolean(tableRules?.update?.dynamicFields?.length),
    },
    /**
     * Only show column groups that are fully allowed to be selected by the user
     */
    uniqueColumnGroups: this.tableOrViewInfo.uniqueColumnGroups?.filter(
      (g) => !localParams || g.every((c) => allowedFieldsToSelect.includes(c)),
    ),
    publishInfo: {
      select: validatedTableRules.select && {
        disabledMethods: validatedTableRules.select.disableMethods,
        syncConfig: this.dboBuilder.prostgles.tableConfigurator?.getTableSyncConfig(this.name),
      },
      insert: validatedTableRules.insert && {
        requiredNestedInserts,
        allowedNestedInserts: allowedNestedInserts?.map((t) => t.table),
      },
      update: validatedTableRules.update && {
        disabledMethods: tableRules?.update?.disableMethods,
      },
      delete: validatedTableRules.delete && {},
    },
  };
}
