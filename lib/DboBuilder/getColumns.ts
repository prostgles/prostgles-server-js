import { 
  AnyObject, PG_COLUMN_UDT_DATA_TYPE, 
  ValidatedColumnInfo, _PG_geometric 
} from "prostgles-types";
import { isPlainObject, LocalParams, parseError, postgresToTsType } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { TableHandler } from "./TableHandler";
import { ViewHandler } from "./ViewHandler";

export const isTableHandler = (v: any): v is TableHandler => "parseUpdateRules" in v;

export async function getColumns(
  this: ViewHandler,
  lang?: string,
  params?: { rule: "update", filter: AnyObject, data: AnyObject },
  _param3?: undefined,
  tableRules?: TableRule,
  localParams?: LocalParams
): Promise<ValidatedColumnInfo[]> {

  try {
    const p = this.getValidatedRules(tableRules, localParams);

    if (!p.getColumns) throw "Not allowed";

    // console.log("getColumns", this.name, this.columns.map(c => c.name))


    let dynamicUpdateFields: string[] | undefined;

    if (params && tableRules && isTableHandler(this)) {
      if (
        !isPlainObject(params) || 
        (params.data && !isPlainObject(params.data)) || 
        !isPlainObject(params.filter) || 
        params.rule !== "update"
      ) {
        throw "params must be { rule: 'update', filter: object, data?: object } but got: " + JSON.stringify(params);
      }

      if (!tableRules?.update) {
        dynamicUpdateFields = [];
      } else {
        const { data, filter } = params;
        const updateRules = await this.parseUpdateRules(filter, data, undefined, tableRules, localParams);
        dynamicUpdateFields = updateRules.fields;
      }
    }

    const columns = this.columns
      .filter(c => {
        const { insert, select, update } = p || {};

        return [
          ...(insert?.fields || []),
          ...(select?.fields || []),
          ...(update?.fields || []),
        ].includes(c.name)
      })
      .map(_c => {
        const c = { ..._c };

        const label = c.comment || capitalizeFirstLetter(c.name, " ");

        const select = c.privileges.some(p => p.privilege_type === "SELECT"),
          insert = c.privileges.some(p => p.privilege_type === "INSERT"),
          _delete = this.tableOrViewInfo.privileges.delete;// c.privileges.some(p => p.privilege_type === "DELETE");
        let update = c.privileges.some(p => p.privilege_type === "UPDATE");

        delete (c as any).privileges;

        const prostgles = this.dboBuilder?.prostgles;
        const fileConfig = prostgles.fileManager?.getColInfo({ colName: c.name, tableName: this.name });

        /** Do not allow updates to file table unless it's to delete fields */
        if (prostgles.fileManager?.config && prostgles.fileManager.tableName === this.name) {
          update = false;
        }

        const nonOrderableUD_Types: PG_COLUMN_UDT_DATA_TYPE[] = [..._PG_geometric, "xml" as any];

        const result: ValidatedColumnInfo = {
          ...c,
          label,
          tsDataType: postgresToTsType(c.udt_name),
          insert: insert && Boolean(p.insert?.fields?.includes(c.name)) && tableRules?.insert?.forcedData?.[c.name] === undefined && c.is_updatable,
          select: select && Boolean(p.select?.fields?.includes(c.name)),
          orderBy: select && Boolean(p.select?.fields && p.select.orderByFields.includes(c.name)) && !nonOrderableUD_Types.includes(c.udt_name),
          filter: Boolean(p.select?.filterFields?.includes(c.name)),
          update: update && Boolean(p.update?.fields?.includes(c.name)) && tableRules?.update?.forcedData?.[c.name] === undefined && c.is_updatable,
          delete: _delete && Boolean(p.delete && p.delete.filterFields && p.delete.filterFields.includes(c.name)),
          ...(prostgles?.tableConfigurator?.getColInfo({ table: this.name, col: c.name, lang }) || {}),
          ...(fileConfig && { file: fileConfig })
        }

        if (dynamicUpdateFields) {
          result.update = dynamicUpdateFields.includes(c.name);
        }

        return result;
      }).filter(c => c.select || c.update || c.delete || c.insert)

    //.sort((a, b) => a.ordinal_position - b.ordinal_position);

    // const tblInfo = await this.getInfo();

    // if(tblInfo && tblInfo.media_table_name && tblInfo.has_media){
    //     const mediaRules = this.dboBuilder.dbo[tblInfo.media_table_name]?.
    //     return columns.concat({
    //         comment: "",
    //         data_type: "file",
    //         delete: false,
    //     });
    // }

    return columns;

  } catch (e) {
    throw parseError(e, `db.${this.name}.getColumns()`);
    // throw "Something went wrong in " + `db.${this.name}.getColumns()`;
  }
}




function replaceNonAlphaNumeric(string: string, replacement = "_"): string {
  return string.replace(/[\W_]+/g, replacement);
}
function capitalizeFirstLetter(string: string, nonalpha_replacement?: string) : string {
  const str = replaceNonAlphaNumeric(string, nonalpha_replacement);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
