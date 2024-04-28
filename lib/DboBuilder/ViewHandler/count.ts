import { SelectParams } from "prostgles-types";
import { parseError, withUserRLS } from "../dboBuilderUtils";
import { ViewHandler } from "./ViewHandler";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../../PublishParser/publishTypesAndUtils";

export async function count(this: ViewHandler, _filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<number> {
  const filter = _filter || {};
  try {
    await this._log({ command: "count", localParams, data: { filter } });
    return await this.find(filter, { select: "", limit: 0 }, undefined, table_rules, localParams)
      .then(async _allowed => {          
        const q: string = await this.find(
          filter, 
          selectParams,
          undefined,
          table_rules,
          { ...localParams, returnQuery: "noRLS", bypassLimit: true }
          ) as any;
          const query = [
            withUserRLS(localParams, ""),
            "SELECT COUNT(*) FROM (",
            q,
            ") t"
          ].join("\n");
        return (this.tx?.t || this.db).one(query).then(({ count }) => +count);
      });
  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.count()`)
  }
}