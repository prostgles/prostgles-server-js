import type { SelectParams } from "prostgles-types";
import type { LocalParams } from "../DboBuilder";
import type { NewQuery } from "../QueryBuilder/QueryBuilder";
import { canRunSQL } from "../runSql/runSQL";
import type { TableHandler } from "../TableHandler/TableHandler";
import type { ViewHandler } from "./ViewHandler";

const sqlTypes = ["statement", "statement-no-rls", "statement-where"] as const;

export const getReturnTypeQuery = async ({
  handler,
  returnType,
  localParams,
  queryWithRLS,
  queryWithoutRLS,
  newQuery,
}: {
  handler: TableHandler | ViewHandler;
  returnType: SelectParams["returnType"];
  localParams: LocalParams | undefined;
  queryWithRLS: string;
  queryWithoutRLS: string;
  newQuery: NewQuery | undefined;
}) => {
  /** Used for subscribe  */
  if (localParams?.returnNewQuery) {
    return newQuery;
  }

  if (returnType === "statement-where" || localParams?.returnQuery === "where-condition") {
    if (!newQuery) {
      throw `returnType ${returnType} not possible for this command type`;
    }
    return newQuery.whereOpts.condition as unknown;
  }
  if (localParams?.returnQuery) {
    return localParams.returnQuery === "noRLS" ? queryWithoutRLS : queryWithRLS;
  }

  if (!sqlTypes.some((v) => v === returnType)) {
    return;
  }
  if (!(await canRunSQL(handler.dboBuilder.prostgles, localParams?.clientReq))) {
    throw `Not allowed:  { returnType: ${JSON.stringify(returnType)} } requires execute sql privileges `;
  }
  if (returnType === "statement-no-rls") {
    return queryWithoutRLS as unknown;
  }
  return queryWithRLS as unknown as unknown[];
};
