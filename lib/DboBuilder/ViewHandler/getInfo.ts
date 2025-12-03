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
  localParams?: LocalParams
): Promise<TInfo> {
  const p = this.getValidatedRules(tableRules, localParams);
  if (!p.getInfo) {
    await this._log({
      command: "getInfo",
      localParams,
      data: { lang },
      duration: 0,
      error: "Not allowed",
    });
    throw "Not allowed";
  }

  const fileTableName = this.dboBuilder.prostgles.opts.fileTable?.tableName;

  await this._log({
    command: "getInfo",
    localParams,
    data: { lang },
    duration: 0,
  });
  const allowedFieldsToSelect = this.parseFieldFilter(tableRules?.select?.fields);
  const { requiredNestedInserts, allowedNestedInserts } = tableRules?.insert ?? {};
  return {
    oid: this.tableOrViewInfo.oid,
    comment: this.tableOrViewInfo.comment,
    info: this.dboBuilder.prostgles.tableConfigurator?.getTableInfo({
      tableName: this.name,
      lang,
    }),
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
        this.columns.some((c) => c.references?.some((r) => r.ftable === fileTableName))
    ),
    fileTableName,
    dynamicRules: {
      update: Boolean(tableRules?.update?.dynamicFields?.length),
    },
    /**
     * Only show column groups that are fully allowed to be selected by the user
     */
    uniqueColumnGroups: this.tableOrViewInfo.uniqueColumnGroups?.filter(
      (g) => !localParams || g.every((c) => allowedFieldsToSelect.includes(c))
    ),
    ...(requiredNestedInserts && { requiredNestedInserts }),
  };
}
