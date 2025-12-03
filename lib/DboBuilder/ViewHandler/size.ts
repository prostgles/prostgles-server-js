import type { SelectParams } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/publishTypesAndUtils";
import type { Filter, LocalParams } from "../DboBuilderTypes";
import {
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../dboBuilderUtils";
import type { ViewHandler } from "./ViewHandler";
export async function size(
  this: ViewHandler,
  _filter?: Filter,
  selectParams?: SelectParams,
  param3_unused?: undefined,
  table_rules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<string> {
  const filter = _filter || {};
  const start = Date.now();
  try {
    const result = await this.find(
      filter,
      { ...selectParams, limit: 2 },
      undefined,
      table_rules,
      localParams
    ).then(async (_allowed) => {
      const q: string = (await this.find(
        filter,
        {
          ...selectParams,
          limit: selectParams?.limit ?? Number.MAX_SAFE_INTEGER,
        },
        undefined,
        table_rules,
        { ...localParams, returnQuery: "noRLS", bypassLimit: true }
      )) as any;
      const query = withUserRLS(
        localParams,
        `${withUserRLS(localParams, "")}
            SELECT sum(pg_column_size((prgl_size_query.*))) as size 
            FROM (
              ${q}
            ) prgl_size_query
          `
      );

      return (this.tx?.t || this.db).one(query).then(({ size }) => size || "0");
    });
    await this._log({
      command: "size",
      localParams,
      data: { filter, selectParams },
      duration: Date.now() - start,
    });
    return result;
  } catch (e) {
    await this._log({
      command: "size",
      localParams,
      data: { filter, selectParams },
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
