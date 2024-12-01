import {
  TableInfo as TInfo
} from "prostgles-types/dist";
import { TableRule } from "../../PublishParser/PublishParser";
import { LocalParams } from "../DboBuilder";
import { ViewHandler } from "./ViewHandler";

export async function getInfo(this: ViewHandler, lang?: string, param2?: any, param3?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<TInfo> {
  const p = this.getValidatedRules(tableRules, localParams);
  if (!p.getInfo) {
    await this._log({ command: "getInfo", localParams, data: { lang }, duration: 0, error: "Not allowed" });
    throw "Not allowed";
  }

  const fileTableName = this.dboBuilder.prostgles?.opts?.fileTable?.tableName;

  await this._log({ command: "getInfo", localParams, data: { lang }, duration: 0 });
  const allowedFieldsToSelect = this.parseFieldFilter(tableRules?.select?.fields);
  return {
    oid: this.tableOrViewInfo.oid,
    comment: this.tableOrViewInfo.comment,
    info: this.dboBuilder.prostgles?.tableConfigurator?.getTableInfo({ tableName: this.name, lang }),
    isFileTable: !this.is_media? undefined : {
      allowedNestedInserts: tableRules?.insert?.allowedNestedInserts
    },
    isView: this.is_view,
    hasFiles: Boolean(!this.is_media && fileTableName && this.columns.some(c => c.references?.some(r => r.ftable === fileTableName))),
    fileTableName,
    dynamicRules: {
      update: Boolean(tableRules?.update?.dynamicFields?.length)
    },
    /**
     * Only show column groups that are fully allowed to be selected by the user
     */
    uniqueColumnGroups: this.tableOrViewInfo.uniqueColumnGroups?.filter(g => !localParams || g.every(c => allowedFieldsToSelect.includes(c))),
  }
}