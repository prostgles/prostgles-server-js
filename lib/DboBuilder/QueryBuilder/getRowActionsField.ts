import { isObject, ROW_ACTIONS_COLUMN } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { LocalParams, PGIdentifier } from "../DboBuilderTypes";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { prepareWhere } from "../ViewHandler/prepareWhere";
import type { FieldSpec } from "./Functions/Functions";
import { parseCaseExpression } from "./parseCaseExpression";
import { replaceContextPlaceholders } from "../../PublishParser/getPublishedObjectFromResult";

export const getRowActionsField = async (
  table: ViewHandler,
  tableRule: ParsedTableRule | undefined,
  localParams: LocalParams | undefined,
  tableAlias: PGIdentifier,
  allowedFields: string[],
): Promise<FieldSpec> => {
  const { clientReq, scope } = localParams ?? {};
  const { publishParser } = table.dboBuilder.prostgles;
  const methods = clientReq && (await publishParser?.getAllowedFunctions(clientReq, undefined));
  const publishParams =
    clientReq && methods?.size ?
      await publishParser?.getPublishParams(clientReq, undefined)
    : undefined;
  const expressions = await Promise.all(
    Array.from(methods ?? []).flatMap(([name, method]) => {
      if (scope && !scope.methods?.[name]) return [];
      const lookups = Object.values(method.input ?? {}).flatMap((arg) => {
        if (
          !isObject(arg) ||
          (arg.type !== "RowLookup" && arg.type !== "ValueLookup") ||
          arg.table !== table.name ||
          (arg.type === "ValueLookup" && !allowedFields.includes(arg.column))
        )
          return [];
        return [replaceContextPlaceholders(arg.filter ?? {}, publishParams, "runtime")];
      });
      if (!lookups.length) return [];
      return [
        parseCaseExpression(
          {
            $case: lookups.map((filter) => [filter, name]),
          },
          (filter) =>
            prepareWhere(table, {
              filter,
              select: undefined,
              tableRule,
              localParams,
              tableAlias,
              filterFields: tableRule?.select?.filterFields,
            }),
          true,
        ),
      ];
    }),
  );
  return {
    name: ROW_ACTIONS_COLUMN,
    type: "computed",
    getQuery: () =>
      expressions.length ?
        `array_remove(ARRAY[${expressions.map(({ query }) => query).join(", ")}]::text[], NULL)`
      : "ARRAY[]::text[]",
    dependencyFields: expressions.flatMap(({ dependencyFields }) => dependencyFields),
    dependencyExists: expressions.flatMap(({ dependencyExists }) => dependencyExists),
  };
};
