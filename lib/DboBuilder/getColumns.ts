import {
  AnyObject,
  PG_COLUMN_UDT_DATA_TYPE,
  ValidatedColumnInfo,
  _PG_geometric,
  isDefined,
  isObject,
  omitKeys,
} from "prostgles-types";
import { ParsedTableRule } from "../PublishParser/PublishParser";
import {
  LocalParams,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  postgresToTsType,
} from "./DboBuilder";
import { TableHandler } from "./TableHandler/TableHandler";
import { ViewHandler } from "./ViewHandler/ViewHandler";

export const isTableHandler = (v: any): v is TableHandler => "parseUpdateRules" in v;

export async function getColumns(
  this: ViewHandler,
  lang?: string,
  params?: { rule: "update"; filter: AnyObject },
  _param3?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<ValidatedColumnInfo[]> {
  const start = Date.now();
  try {
    const rules = this.getValidatedRules(tableRules, localParams);

    if (!rules.getColumns) throw "Not allowed";

    let dynamicUpdateFields = this.column_names;

    if (params && tableRules && isTableHandler(this)) {
      if (
        !isObject(params) ||
        !isObject(params.filter) ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        params.rule !== "update"
      ) {
        throw (
          "params must be { rule: 'update', filter: object } but received: " +
          JSON.stringify(params)
        );
      }

      if (!tableRules.update) {
        dynamicUpdateFields = [];
      } else {
        const { filter } = params;
        const updateRules = await this.parseUpdateRules(filter, undefined, tableRules, localParams);
        dynamicUpdateFields = updateRules.fields;
      }
    }

    const columns: ValidatedColumnInfo[] = this.columns
      .filter((c) => {
        const { insert, select, update } = rules;

        return [insert, select, update]
          .filter(isDefined)
          .flatMap((rule) => rule.fields)
          .includes(c.name);
      })
      .map((_c) => {
        const c = { ..._c };

        const label = c.comment || capitalizeFirstLetter(c.name, " ");

        const select = !!c.privileges.SELECT;
        const insert = !!c.privileges.INSERT;
        const _delete = !!this.tableOrViewInfo.privileges.delete;
        let update = !!c.privileges.UPDATE;

        const prostgles = this.dboBuilder.prostgles;
        const fileConfig = prostgles.fileManager?.getColInfo({
          colName: c.name,
          tableName: this.name,
        });

        /** Do not allow updates to file table unless it's to delete fields */
        if (prostgles.fileManager?.config && prostgles.fileManager.tableName === this.name) {
          update = false;
        }

        const nonOrderableUD_Types: string[] = [..._PG_geometric, "xml"];

        const result: ValidatedColumnInfo = {
          ...omitKeys(c, ["privileges"]),
          label,
          tsDataType: postgresToTsType(c.udt_name),
          insert:
            insert &&
            !!rules.insert?.fields.includes(c.name) &&
            tableRules?.insert?.forcedData?.[c.name] === undefined &&
            c.is_updatable,
          select: select && !!rules.select?.fields.includes(c.name),
          orderBy:
            select &&
            !!rules.select?.orderByFields.includes(c.name) &&
            !nonOrderableUD_Types.includes(c.udt_name),
          filter: !!rules.select?.filterFields.includes(c.name),
          update:
            update &&
            !!rules.update?.fields.includes(c.name) &&
            tableRules?.update?.forcedData?.[c.name] === undefined &&
            c.is_updatable &&
            dynamicUpdateFields.includes(c.name),
          delete: _delete && !!rules.delete?.filterFields.includes(c.name),
          ...(prostgles.tableConfigurator?.getColInfo({
            table: this.name,
            col: c.name,
            lang,
          }) || {}),
          ...(fileConfig && { file: fileConfig }),
        };

        return result;
      })
      .filter((c) => c.select || c.update || c.delete || c.insert);

    await this._log({
      command: "getColumns",
      localParams,
      data: { lang, params },
      duration: Date.now() - start,
    });
    return columns;
  } catch (e) {
    await this._log({
      command: "getColumns",
      localParams,
      data: { lang, params },
      duration: Date.now() - start,
      error: getErrorAsObject(e),
    });
    throw getSerializedClientErrorFromPGError(e, {
      type: "tableMethod",
      localParams,
      view: this,
    });
  }
}

function replaceNonAlphaNumeric(string: string, replacement = "_"): string {
  return string.replace(/[\W_]+/g, replacement);
}
function capitalizeFirstLetter(string: string, nonalpha_replacement?: string): string {
  const str = replaceNonAlphaNumeric(string, nonalpha_replacement);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
