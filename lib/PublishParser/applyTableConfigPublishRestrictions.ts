import { getObjectEntries, type FieldFilter } from "prostgles-types";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import type { ParsedPublishTable } from "./publishTypesAndUtils";

export const applyTableConfigPublishRestrictions = <Rules extends ParsedPublishTable>(
  tableHandler: ViewHandler,
  tableRules: Rules | undefined,
  validateExplicitFields = false,
): Rules | undefined => {
  const restrictions = tableHandler.config?.publishRestrictions;
  if (!tableRules || !restrictions) return tableRules;

  const restrictedRules = { ...tableRules };
  for (const [command, restriction] of getObjectEntries(restrictions)) {
    if (restriction === false) delete restrictedRules[command];
  }
  for (const command of ["insert", "update"] as const) {
    const rule = restrictedRules[command];
    const restriction = restrictions[command];
    if (!rule || !restriction) continue;

    const excludedFields = tableHandler.parseFieldFilter(restriction.excludeFields);
    const restrictFields = (fields: FieldFilter): string[] => {
      const requestedFields = tableHandler.parseFieldFilter(fields);
      const isExplicit =
        Array.isArray(fields) ? !fields.includes("*")
        : typeof fields === "object" ? !Object.values(fields).some((allowed) => !allowed)
        : fields !== "*";
      const conflictingField = requestedFields.find((field) => excludedFields.includes(field));
      if (validateExplicitFields && isExplicit && conflictingField) {
        throw new Error(
          `publish.${tableHandler.name}.${command}.fields cannot include "${conflictingField}" because it is excluded by tableConfig.${tableHandler.name}.publishRestrictions.${command}.excludeFields`,
        );
      }
      return requestedFields.filter((field) => !excludedFields.includes(field));
    };

    restrictedRules[command] = { ...rule, fields: restrictFields(rule.fields) };
    if (command === "update" && restrictedRules.update?.dynamicFields) {
      restrictedRules.update = {
        ...restrictedRules.update,
        dynamicFields: restrictedRules.update.dynamicFields.map((dynamicRule) => ({
          ...dynamicRule,
          fields: restrictFields(dynamicRule.fields),
        })),
      };
    }
  }
  return Object.values(restrictedRules).some(Boolean) ? restrictedRules : undefined;
};
