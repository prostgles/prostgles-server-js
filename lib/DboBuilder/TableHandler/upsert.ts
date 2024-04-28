import { AnyObject, UpdateParams } from "prostgles-types";
import { TableHandler } from "./TableHandler";
import { Filter, LocalParams } from "../DboBuilderTypes";
import { TableRule } from "../../PublishParser/publishTypesAndUtils";
import { parseError } from "../dboBuilderUtils";

export const upsert = async function(this: TableHandler, filter: Filter, newData: AnyObject, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
  try {
    await this._log({ command: "upsert", localParams, data: { filter, newData, params } });
    const _upsert = async function (tblH: TableHandler) {
      return tblH.find(filter, { select: "", limit: 1 }, undefined, table_rules, localParams)
        .then(exists => {
          if (exists && exists.length) {
            return tblH.update(filter, newData, params, table_rules, localParams);
          } else {
            return tblH.insert({ ...newData, ...filter }, params, undefined, table_rules, localParams);
          }
        });
    }

    /* Do it within a transaction to ensure consisency */
    if (!this.tx) {
      return this.dboBuilder.getTX(dbTX => _upsert(dbTX[this.name] as TableHandler))
    } else {
      return _upsert(this);
    }

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.upsert()`);
  }
}