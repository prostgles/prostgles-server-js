import { AnyObject, UpdateParams } from "prostgles-types";
import { ParsedTableRule } from "../../PublishParser/PublishParser";
import {
  Filter,
  LocalParams,
  getClientErrorFromPGError,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import { TableHandler } from "./TableHandler";

export async function updateBatch(
  this: TableHandler,
  updates: [Filter, AnyObject][],
  params?: UpdateParams,
  _?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<any> {
  const start = Date.now();
  try {
    const { checkFilter, postValidate } = tableRules?.update ?? {};
    if (checkFilter || postValidate) {
      throw `updateBatch not allowed for tables with checkFilter or postValidate rules`;
    }
    const updateQueries: string[] = await Promise.all(
      updates.map(async ([filter, data]) => {
        const query = (await this.update(
          filter,
          data,
          { ...(params ?? {}), returning: undefined },
          tableRules,
          { ...(localParams ?? {}), returnQuery: "noRLS" }
        )) as unknown as string;

        return query;
      })
    );
    const queries = [withUserRLS(localParams, ""), ...updateQueries];

    const t = localParams?.tx?.t ?? this.tx?.t;
    if (t) {
      const result = await t.none(queries.join(";\n"));
      await this._log({
        command: "updateBatch",
        localParams,
        data: { data: updates, params },
        duration: Date.now() - start,
      });
      return result;
    }
    const result = await this.db
      .tx((t) => {
        return t.none(queries.join(";\n"));
      })
      .catch((err) =>
        getClientErrorFromPGError(err, {
          type: "tableMethod",
          localParams,
          view: this,
          allowedKeys: [],
        })
      );

    await this._log({
      command: "updateBatch",
      localParams,
      data: { data: updates, params },
      duration: Date.now() - start,
    });
    return result;
  } catch (e) {
    await this._log({
      command: "updateBatch",
      localParams,
      data: { data: updates, params },
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
