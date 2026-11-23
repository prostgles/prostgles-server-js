import { getKeys } from "prostgles-types";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import { FILE_CONTENT_SELECT, FILE_LOOKUP_FIELDS } from "../StorageClient/fileTableDefinitions";
import { getSelectRules, hasSelectRules, mergeSelectRules } from "./mergeSelectRules";
import { parsePublishTableRule, type ParsedTableRule } from "./publishTypesAndUtils";

export const getFileContentTableRules = (
  table: ViewHandler,
  rules: ParsedTableRule,
): ParsedTableRule | undefined => {
  const { select } = rules;
  if (!select) return;
  const fields = table.parseFieldFilter(select.fields);
  const requiredFields = getKeys(FILE_CONTENT_SELECT);
  if (!requiredFields.every((field) => fields.includes(field))) return;
  const filterFields = table.parseFieldFilter(select.filterFields);
  const lookupFields = table.is_media ? FILE_LOOKUP_FIELDS.file : FILE_LOOKUP_FIELDS.revision;
  if (!lookupFields.every((field) => filterFields.includes(field))) return;
  if (!hasSelectRules(select)) return rules;

  /* Scope filters need the original published values, including fields omitted from the output. */
  const contentSelect = mergeSelectRules(table, getSelectRules({ ...select, fields: "*" }, table), [
    ...new Set([...requiredFields, ...lookupFields]),
  ]);
  if (!contentSelect) return;
  return parsePublishTableRule({
    select: { ...contentSelect, forcedFilter: select.forcedFilter },
  });
};
