import { getObjectEntries, isDefined, isEmpty, pickKeys } from "prostgles-types";
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
        if (ruleScope === true || isEmpty(ruleScope)) {
          return [ruleName, rule] as const;
        }
        const scopeFields = ruleScope.fields;
        const scopeFieldList =
          !scopeFields ? undefined : tableHandler.parseFieldFilter!(ruleScope.fields);
        const scopeForcedFilter = "forcedFilter" in ruleScope ? ruleScope.forcedFilter : undefined;

        if (scopeFieldList) {
          if (!scopeFieldList.length) {
            throw `Invalid scope: ${tableName}.${ruleName}. At least one field must be selected.`;
          }
          const validatedRuleFields = "fields" in validatedRule ? validatedRule.fields : undefined;
          for (const field of scopeFieldList) {
            if (!validatedRuleFields?.includes(field)) {
              throw `Invalid scope: ${tableName}.${ruleName}. The field "${field}" is not allowed to be selected according to the publish rules.`;
            }
          }
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
            ...(scopeFieldList && {
              fields: fromEntries(scopeFieldList.map((field) => [field, 1] as const)),
            }),
            ...(scopeForcedFilter && { forcedFilter: combinedForcedFilter }),
          },
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
