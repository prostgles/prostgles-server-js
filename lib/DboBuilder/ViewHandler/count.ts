import type { SelectParams } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/publishTypesAndUtils";
import type { Filter, LocalParams } from "../DboBuilder";
import {
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../dboBuilderUtils";
import type { ViewHandler } from "./ViewHandler";
import { getReturnTypeQuery } from "./getReturnTypeQuery";
import type { Param3 } from "./find";

export async function count(
  this: ViewHandler,
  _filter?: Filter,
  selectParams?: SelectParams,
  param3?: Param3,
  table_rules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<number> {
  const filter = _filter || {};
  const { limit: _limit, ...selectParamsWithoutLimit } = selectParams ?? {};
  const start = Date.now();
  try {
    const result = await this.find(
      filter,
      { select: selectParamsWithoutLimit.select ?? "", limit: 0 },
      undefined,
      table_rules,
      localParams,
    ).then(async (_allowed) => {
      const findQuery = (await this.find(filter, selectParamsWithoutLimit, undefined, table_rules, {
        ...localParams,
        returnQuery: "noRLS",
        bypassLimit: true,
      })) as unknown as string;

      const queryWithoutUserRLS = `
        SELECT COUNT(*)
        FROM ( 
        ${findQuery}
        ) t 
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
      return handler.one(queryWithRLS).then(({ count }) => +count);
    });

    await this._log({
      command: "count",
      localParams,
      data: { filter },
      duration: Date.now() - start,
    });
    return result as number;
  } catch (e) {
    await this._log({
      command: "count",
      localParams,
      data: { filter },
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
