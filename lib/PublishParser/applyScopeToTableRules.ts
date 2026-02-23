import { getObjectEntries, isDefined, pickKeys } from "prostgles-types";
import { type ParsedTableRule, type PermissionScope } from "./PublishParser";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
export const applyScopeToTableRules = (
  tableName: string,
  tableHandler: Partial<TableHandler>,
  tableRules: ParsedTableRule | undefined,
  scope: PermissionScope | undefined,
): ParsedTableRule | undefined => {
  if (!tableRules) return;
  if (!scope || scope.sql === "commited") return tableRules;
  if (scope.sql === "rolledback") {
    return pickKeys(tableRules, ["select"]);
  }
  const tableScope = scope.tables?.[tableName];
  if (!tableScope) return;

  const validatedTableRules = tableHandler.getValidatedRules?.(tableRules);
  if (!validatedTableRules) {
    throw "INTERNAL ERROR: getValidatedRules is missing for " + tableName;
  }

  /** Make sure the scope does not allow things outside the validatedTableRules */
  const result = fromEntries(
    getObjectEntries(tableScope)
      .map(([ruleName, ruleScope]) => {
        if (!ruleScope) return undefined;
        const rule = tableRules[ruleName];
        const validatedRule = validatedTableRules[ruleName];
        if (!validatedRule || !rule) {
          throw `Invalid scope: ${tableName}.${ruleName}. The publish does not allow this command.`;
        }
        if (ruleScope === true) {
          return [ruleName, validatedRule] as const;
        }
        const scopeFields = tableHandler.parseFieldFilter!(ruleScope.fields);
        const scopeForcedFilter = "forcedFilter" in ruleScope ? ruleScope.forcedFilter : undefined;

        const ruleFields = "fields" in validatedRule ? validatedRule.fields : undefined;
        for (const field of scopeFields) {
          if (!ruleFields?.includes(field)) {
            throw `Invalid scope: ${tableName}.${ruleName}. The field "${field}" is not allowed to be selected according to the publish rules.`;
          }
        }
        if (!scopeFields.length) {
          throw `Invalid scope: ${tableName}.${ruleName}. At least one field must be selected.`;
        }
        const ruleForcedFilter =
          "forcedFilter" in validatedRule ? validatedRule.forcedFilter : undefined;
        const combinedForcedFilter =
          scopeForcedFilter && ruleForcedFilter ?
            { $and: [scopeForcedFilter, ruleForcedFilter] }
          : scopeForcedFilter || ruleForcedFilter;

        return [
          ruleName,
          {
            ...rule,
            fields: fromEntries(scopeFields.map((field) => [field, 1] as const)),
            ...(scopeForcedFilter ? { forcedFilter: combinedForcedFilter } : {}),
          } as any,
        ] as const;
      })
      .filter(isDefined),
  ) as ParsedTableRule;
  return result;
};

export const fromEntries = <K extends string | number | symbol, V>(
  entries: readonly (readonly [K, V])[],
): Record<K, V> => {
  return Object.fromEntries(entries) as Record<K, V>;
};
