import { SelectParams } from "prostgles-types";
import { getErrorAsObject, parseError, withUserRLS } from "../dboBuilderUtils";
import { ViewHandler } from "./ViewHandler";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../../PublishParser/publishTypesAndUtils";

export async function count(this: ViewHandler, _filter?: Filter, selectParams?: SelectParams, _param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<number> {
  const filter = _filter || {};
  const { limit: _limit, ...selectParamsWithoutLimit } = selectParams ?? {};
  const start = Date.now();
  try {
    const result = await this.find(filter, { select: selectParamsWithoutLimit?.select ?? "", limit: 0 }, undefined, table_rules, localParams)
      .then(async _allowed => {
        const findQuery = await this.find(
          filter, 
          selectParamsWithoutLimit,
          undefined,
          table_rules,
          { ...localParams, returnQuery: "noRLS", bypassLimit: true }
        ) as unknown as string;
        const query = [
          withUserRLS(localParams, ""),
          "SELECT COUNT(*)",
          "FROM (",
          findQuery,
          ") t"
        ].join("\n");
        const handler = this.tx?.t ?? this.db;
        return handler.one(query).then(({ count }) => +count);
      });

    await this._log({ command: "count", localParams, data: { filter }, duration: Date.now() - start });
    return result;
  } catch (e) {
    await this._log({ command: "count", localParams, data: { filter }, duration: Date.now() - start, error: getErrorAsObject(e) });
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.count()`)
  }
}