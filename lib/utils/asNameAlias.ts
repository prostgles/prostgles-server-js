import { asName } from "prostgles-types";

export const asNameAlias = (field: string, tableAlias?: string) => {
  const result = asName(field);
  if (tableAlias) return asName(tableAlias) + "." + result;
  return result;
};
