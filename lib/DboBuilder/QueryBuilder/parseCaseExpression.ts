import { as } from "pg-promise";
import type { AnyObject, CaseSelect } from "prostgles-types";
import type { WhereOptions } from "../ViewHandler/prepareWhere";

export const parseCaseExpression = async (
  expression: CaseSelect,
  parseFilter: (filter: AnyObject) => Promise<WhereOptions>,
  allowEmptyCondition = false,
) => {
  const branches = await Promise.all(
    expression.$case.map(async ([filter, result]) => {
      const info = await parseFilter(filter);
      if (!info.condition && !allowEmptyCondition) throw "CASE conditions cannot be empty";
      return { info, query: `WHEN ${info.condition || "TRUE"} THEN ${as.format("$1", [result])}` };
    }),
  );
  return {
    query: `CASE ${branches.map(({ query }) => query).join(" ")}${
      Object.hasOwn(expression, "$else") ? ` ELSE ${as.format("$1", [expression.$else])}` : ""
    } END`,
    dependencyFields: branches.flatMap(({ info }) => info.columnsUsed),
    dependencyExists: branches.flatMap(({ info }) => info.exists),
  };
};
