import { asName } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";

export const JOB_PREVIOUS_ROW = "__prostgles_job_previous_row";

/** Carry each locked pre-update row through RETURNING, including primary-key changes. */
export const getJobUpdateQuery = (table: TableHandler, query: string, where: string) => {
  const source = "__prostgles_job_source";
  const rowName = asName(table.tableOrViewInfo.qualifiedNameParts.name);
  const keys = table.columns.filter((column) => column.is_pkey);
  const aliases = keys.map((_, index) => `__prostgles_job_key_${index}`);
  if ([JOB_PREVIOUS_ROW, ...aliases].some((key) => table.columnSet.has(key))) {
    throw new Error("Job update metadata conflicts with a table column");
  }
  const selectKeys = keys.map((key, index) => `${asName(key.name)} AS ${asName(aliases[index]!)}`);
  const joinKeys = keys.map(
    (key, index) => `${rowName}.${asName(key.name)} = ${source}.${asName(aliases[index]!)}`,
  );
  return `${query} 
  FROM (
    SELECT to_jsonb(${rowName}) AS ${asName(JOB_PREVIOUS_ROW)}, ${selectKeys.join(", ")}
    FROM ${table.escapedName} ${where} 
    FOR UPDATE
  ) ${source} 
  WHERE ${joinKeys.join(" AND ")}`;
};
