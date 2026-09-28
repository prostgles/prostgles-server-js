import type { AnyObject, UpdateParams } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams } from "../DboBuilder";
import {
  rejectWithPGClientError,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { getReturnTypeQuery, isReturningQuery } from "../ViewHandler/getReturnTypeQuery";

export async function updateBatch(
  this: TableHandler,
  updates: [Filter, AnyObject][],
  params?: UpdateParams,
  _?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<any> {
  const start = Date.now();
  try {
    const { checkFilter, postValidate } = tableRules?.update ?? {};
    if (checkFilter || postValidate) {
      throw `updateBatch not allowed for tables with checkFilter or postValidate rules`;
    }
    const hasHooks =
      this.getAfterHooksAndChecks({ name: "update", rule: tableRules?.update }, localParams).length ||
      this.hooks?.beforeEach?.some(({ commands }) => commands.update);
    if (hasHooks && !isReturningQuery(params?.returnType, localParams)) {
      if (!this.getTransaction(localParams)) {
        return this.dboBuilder.getTX((dbx) =>
          dbx[this.name]!.updateBatch(updates, params, undefined, tableRules, localParams),
        );
      }
      // Run the full update pipeline so hooks share the batch transaction.
      for (const [filter, data] of updates) {
        await this.update(
          filter,
          data,
          { ...(params ?? {}), returning: undefined },
          tableRules,
          localParams,
        );
      }
      await this._log({
        command: "updateBatch",
        localParams,
        data: { data: updates, params },
        duration: Date.now() - start,
      });
      return null;
    }
    const updateQueries: string[] = await Promise.all(
      updates.map(async ([filter, data]) => {
        const query = (await this.update(
          filter,
          data,
          { ...(params ?? {}), returning: undefined },
          tableRules,
          { ...(localParams ?? {}), returnQuery: "noRLS" },
        )) as unknown as string;

        return query;
      }),
    );
    const queries = [
      withUserRLS(localParams, "", !!this.getTransaction(localParams)),
      ...updateQueries,
    ];

    const queryToReturn = await getReturnTypeQuery({
      handler: this,
      localParams,
      queryWithoutRLS: queries.slice(1).join(";\n"),
      queryWithRLS: queries.join(";\n"),
      returnType: params?.returnType,
      newQuery: undefined,
    });
    if (queryToReturn) {
      return queryToReturn as unknown[];
    }

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
        rejectWithPGClientError(err, {
          type: "tableMethod",
          localParams,
          view: this,
          allowedKeys: [],
          prostgles: this.dboBuilder.prostgles,
        }),
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
      prostgles: this.dboBuilder.prostgles,
    });
  }
}
