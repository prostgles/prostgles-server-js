import { AnyObject, UpdateParams } from "prostgles-types";
import { Filter, LocalParams, makeErrorFromPGError, parseError, withUserRLS } from "../../DboBuilder";
import { TableRule } from "../../PublishParser";
import { TableHandler } from "./TableHandler";


export async function updateBatch(this: TableHandler, updates: [Filter, AnyObject][], params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any> {
  try {
    await this._log({ command: "updateBatch", localParams, data: { data: updates, params } });
    const updateQueries: string[] = await Promise.all(
      updates.map(async ([filter, data]) => {
        const query = (await this.update(
          filter,
          data,
          { ...(params || {}), returning: undefined },
          tableRules,
          { ...(localParams || {}), returnQuery: "noRLS" }
        )) as unknown as string;

        return query;
      })
    ); 
    const queries = [
      withUserRLS(localParams, ""),
      ...updateQueries
    ];
    
    const t = localParams?.tx?.t ?? this.tx?.t;
    if(t){
      return t.none(queries.join(";\n"))
    }
    return this.db.tx(t => {
      return t.none(queries.join(";\n"));
    }).catch(err => makeErrorFromPGError(err, localParams, this, []));
  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.update()`);
  }
}