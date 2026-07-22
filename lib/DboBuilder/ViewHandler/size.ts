import type { SelectParams } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/publishTypesAndUtils";
import type { Filter, LocalParams } from "../DboBuilderTypes";
import {
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../dboBuilderUtils";
import type { ViewHandler } from "./ViewHandler";
import { getReturnTypeQuery } from "./getReturnTypeQuery";
import type { Param3 } from "./find";
export async function size(
  this: ViewHandler,
  _filter?: Filter,
  selectParams?: SelectParams,
  param3?: Param3,
  table_rules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<string> {
  const filter = _filter || {};
  const start = Date.now();
  try {
    const result = await this.find(
      filter,
      { ...selectParams, limit: 2 },
      param3,
      table_rules,
      localParams,
    ).then(async (_allowed) => {
      const selectQueryWithoutRLS = (await this.find(
        filter,
        {
          ...selectParams,
          limit: selectParams?.limit ?? Number.MAX_SAFE_INTEGER,
        },
        undefined,
        table_rules,
        { ...localParams, returnQuery: "noRLS", bypassLimit: true },
      )) as unknown as string;

      const queryWithoutUserRLS = `
        SELECT sum(pg_column_size((prgl_size_query.*))) as size 
        FROM (
          ${selectQueryWithoutRLS}
        ) prgl_size_query
      `;
      const queryWithRLS = withUserRLS(localParams, queryWithoutUserRLS);

      const queryToReturn = await getReturnTypeQuery({
        handler: this,
        localParams,
        queryWithoutRLS: queryWithoutUserRLS,
        queryWithRLS,
        returnType: selectParams?.returnType,
        newQuery: undefined,
      });
      if (queryToReturn) {
        return queryToReturn as unknown[];
      }

      const handler = this.getDbHandlerWithAbort(localParams, {
        abortSignal: selectParams?.abortSignal,
        abortSignalId: param3?.abortSignalId,
      });
      return handler.one<{ size: string | null }>(queryWithRLS).then(({ size }) => size || "0");
    });
    await this._log({
      command: "size",
      localParams,
      data: { filter, selectParams },
      duration: Date.now() - start,
    });
    return result as string;
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
      prostgles: this.dboBuilder.prostgles,
    });
  }
}
