import { type TableInfo as TInfo } from "prostgles-types/dist";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { LocalParams } from "../DboBuilder";
import { getRawInfo } from "./getRawInfo";
import { getRawColumns } from "../getColumns";
import type { ViewHandler } from "./ViewHandler";

export async function getInfo(
  this: ViewHandler,
  lang?: string,
  _param2?: any,
  _param3?: any,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<TInfo> {
  const tableInfo = getRawInfo.call(this, lang, tableRules, localParams);
  await this._log({
    command: "getInfo",
    localParams,
    data: { lang },
    duration: 0,
  });
  const modifyClientSchema = this.dboBuilder.prostgles.opts.modifyClientSchema;
  if (!modifyClientSchema) return tableInfo;

  const modifiedTableSchema = await modifyClientSchema(
    {
      name: this.name,
      ...tableInfo,
      columns: await getRawColumns.call(this, lang, undefined, tableRules, localParams),
    },
    this.config,
    localParams?.isRemoteRequest?.clientInfo,
  );
  const { columns, name, ...rest } = modifiedTableSchema;
  return rest;
}
