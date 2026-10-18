import { asName, getObjectEntries } from "prostgles-types";
import { withTableExpression } from "../DboBuilder/QueryBuilder/getQuerySource";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import { prepareWhere } from "../DboBuilder/ViewHandler/prepareWhere";
import type { SelectRule } from "./publishTypesAndUtils";
import { getSelectRulePushdown } from "./getSelectRulePushdown";

const SELECT_RULES = Symbol("selectRules");
type MergedSelectRule = SelectRule & { [SELECT_RULES]?: SelectRule[] };

export const mergeSelectRules = (
  table: ViewHandler,
  rules: SelectRule[],
): SelectRule | undefined => {
  if (!rules.length) return;
  const parsedRules = rules.map((rule) => ({
    ...rule,
    ...table.getValidatedRules({
      select: {
        ...rule,
        filterFields: rule.filterFields ?? rule.fields,
        orderByFields: rule.orderByFields ?? rule.fields,
      },
    }).select!,
  }));
  const unionFields = (key: "fields" | "filterFields" | "orderByFields") => [
    ...new Set(parsedRules.flatMap((rule) => rule[key])),
  ];
  const fields = unionFields("fields");
  const filterFields = unionFields("filterFields");
  const orderByFields = unionFields("orderByFields");
  if ([...filterFields, ...orderByFields].some((field) => !fields.includes(field))) {
    throw new Error(
      `publish.${table.name}.select arrays can only filter/order by selectable fields`,
    );
  }
  const options = mergeSelectRuleOptions(parsedRules);
  const merged: MergedSelectRule = {
    ...options,
    fields,
    filterFields,
    orderByFields,
    // Sync requires stable, unmasked identity and change tracking fields.
    disableMethods: { ...options.disableMethods, sync: 1 },
    [SELECT_RULES]: parsedRules,
  };
  return withTableExpression(merged, async ({ params }) => {
    const grants = await Promise.all(
      parsedRules.map(async (rule) => ({
        fields: rule.fields,
        ...(await prepareWhere(table, {
          filter: rule.forcedFilter ?? {},
          select: undefined,
          localParams: undefined,
          tableRule: undefined,
          addWhere: false,
        })),
      })),
    );
    const columns = table.column_names.map(
      (column) =>
        `CASE WHEN ${orConditions(grants.filter((grant) => grant.fields.includes(column)))} THEN ${asName(column)} END AS ${asName(column)}`,
    );
    const getExpression = (condition = "", suffix = "") =>
      `(SELECT ${columns.join(", ")} FROM ${table.escapedName} WHERE (${orConditions(grants)})${condition ? ` AND (${condition})` : ""}${suffix} OFFSET 0)`;
    const rowPermissionTables = [
      ...new Set([
        table.name,
        ...grants.flatMap(({ exists }) =>
          exists.flatMap((filter) => filter.dependencyTables ?? []),
        ),
      ]),
    ];
    return {
      // Keep masking and the boundary even when adding proven-safe predicates inside it.
      expression: getExpression(),
      rowPermissionTables,
      getOptimizedExpression: (query) => {
        const { condition, suffix } = getSelectRulePushdown(table, query, params, (field) => ({
          condition: orConditions(grants.filter((grant) => grant.fields.includes(field))),
          alwaysVisible: grants.every((grant) => grant.fields.includes(field)),
        }));
        return getExpression(condition, suffix);
      },
    };
  });
};

/** Inference needs the grants before masking; scope filters must stay outside them. */
export const getSelectRules = (rule: SelectRule, table: ViewHandler): SelectRule[] => {
  const rules = (rule as MergedSelectRule)[SELECT_RULES];
  if (!rules) return [rule];
  const allowedFields = table.parseFieldFilter(rule.fields);
  return rules.map((entry) => ({
    ...entry,
    fields: table.parseFieldFilter(entry.fields).filter((field) => allowedFields.includes(field)),
  }));
};

export const hasSelectRules = (
  rule: SelectRule | undefined,
): rule is SelectRule & { [SELECT_RULES]: SelectRule[] } => {
  return !!rule && !!(rule as MergedSelectRule)[SELECT_RULES];
};

export const mergeSelectRuleOptions = (rules: SelectRule[]) => {
  const limits = rules.flatMap((rule) => (rule.maxLimit == null ? [] : [rule.maxLimit]));
  return {
    maxLimit: limits.length ? Math.min(...limits) : null,
    subscribeThrottle: Math.max(...rules.map((rule) => rule.subscribeThrottle ?? 0)),
    disableMethods: Object.fromEntries(
      rules.flatMap((rule) =>
        getObjectEntries(rule.disableMethods ?? {}).filter(([, disabled]) => disabled),
      ),
    ),
  };
};

const orConditions = (grants: { condition: string }[]) =>
  grants.map(({ condition }) => `(${condition || "TRUE"})`).join(" OR ") || "FALSE";
