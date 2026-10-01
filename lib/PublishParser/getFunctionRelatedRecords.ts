import type { FunctionInvocation } from "../ExecutionContext";
import type { ServerFunctionDefinition } from "./defineServerFunction";

/** Capture top-level RowLookup/ValueLookup inputs without querying the database. */
export const getFunctionRelatedRecords = (
  input: ServerFunctionDefinition["input"],
  args: Record<string, unknown> | undefined,
): FunctionInvocation["relatedRecords"] => {
  const records: FunctionInvocation["relatedRecords"] = [];
  for (const [argName, schema] of Object.entries(input ?? {})) {
    if (typeof schema !== "object" || !("table" in schema)) continue;
    const isRow = schema.type === "RowLookup" || schema.type === "RowLookup[]";
    const isValue = schema.type === "ValueLookup" || schema.type === "ValueLookup[]";
    if (!isRow && !isValue) continue;
    const value = args?.[argName];
    if (value === undefined || value === null) continue;
    const values: unknown[] = schema.type.endsWith("[]") ? (value as unknown[]) : [value];
    for (const item of values) {
      const rowPart =
        "column" in schema ? { [schema.column]: item } : (item as Record<string, unknown>);
      records.push({ argName, tableName: schema.table, rowPart });
    }
  }
  return records;
};
