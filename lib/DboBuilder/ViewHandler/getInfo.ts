import { 
  TableInfo as TInfo,
 } from "prostgles-types/dist";
import { LocalParams } from "../../DboBuilder";
import { TableRule } from "../../PublishParser";
import { ViewHandler } from "./ViewHandler";

export async function getInfo(this: ViewHandler, lang?: string, param2?: any, param3?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<TInfo> {
  await this._log({ command: "getInfo", localParams, data: { lang } });
  const p = this.getValidatedRules(tableRules, localParams);
  if (!p.getInfo) throw "Not allowed";

  let has_media: "one" | "many" | undefined = undefined;

  const mediaTable = this.dboBuilder.prostgles?.opts?.fileTable?.tableName;

  if (!this.is_media && mediaTable) {
    const joinConf = this.dboBuilder.prostgles?.opts?.fileTable?.referencedTables?.[this.name]
    if (joinConf) {
      has_media = typeof joinConf === "string" ? joinConf : "one";
    } else {
      const jp = this.dboBuilder.getShortestJoinPath(this, mediaTable);
      if (jp && jp.path.length <= 3) {
        if (jp.path.length <= 2) {
          has_media = "one"
        } else {
          await Promise.all(jp.path.map(async tableName => {
            const pkeyFcols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c.is_pkey).map(c => c.name);
            const cols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c?.references?.some(({ ftable }) => jp.path.includes(ftable)));
            if (cols && cols.length && has_media !== "many") {
              if (cols.some(c => !pkeyFcols?.includes(c.name))) {
                has_media = "many"
              } else {
                has_media = "one"
              }
            }
          }));
        }
      }
    }
  }

  return {
    oid: this.tableOrViewInfo.oid,
    comment: this.tableOrViewInfo.comment,
    info: this.dboBuilder.prostgles?.tableConfigurator?.getTableInfo({ tableName: this.name, lang }),
    is_media: this.is_media,      // this.name === this.dboBuilder.prostgles?.opts?.fileTable?.tableName
    is_view: this.is_view,
    has_media,
    media_table_name: mediaTable,
    dynamicRules: {
      update: Boolean(tableRules?.update?.dynamicFields?.length)
    }
  }
}