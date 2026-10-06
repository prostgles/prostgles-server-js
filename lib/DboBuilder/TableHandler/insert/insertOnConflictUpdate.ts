import { isObject, type AnyObject, type FieldFilter } from "prostgles-types";
import { withUserRLS } from "../../DboBuilder";
import { prepareWhere } from "../../ViewHandler/prepareWhere";
import { runInsertUpdateQuery, type RunAfterHooks } from "../runInsertUpdateQuery";
import { executeAfterHooksCheckAndPostValidation } from "../executeAfterHooksCheckAndPostValidation";
import { getInsertQuery } from "./getInsertQuery";

/** Use separate statements so hooks and publish rules see the actual operation on PostgreSQL 16+. */
export const insertOnConflictUpdate = async (
  args: Parameters<typeof getInsertQuery>[0] & {
    returningFields: FieldFilter | undefined;
    isMultiInsert: boolean;
  },
): Promise<AnyObject | AnyObject[] | undefined> => {
  const { tableHandler, rows, tableRules, localParams, insertParams, returningFields, fields } = args;
  const transaction = tableHandler.getTransaction(localParams);
  if (!transaction) throw new Error("onConflict DoUpdate requires a transaction");
  if (!rows.length) throw new Error("Empty insert. Provide data");
  const { returning, removeDisallowedFields } = insertParams ?? {};
  const updateRules = tableRules && {
    ...tableRules,
    update: { ...tableRules.update!, returningFields: tableHandler.parseFieldFilter(returningFields) },
  };
  const results: AnyObject[] = [];
  let conflictColumns: string[] | undefined;
  const affectedKeys = new Set<string>();
  const afterHooks = new Map<string, Parameters<RunAfterHooks>[0]>();
  const collectAfterHooks: RunAfterHooks = (args) => {
    if (!args.rows.length) return;
    for (const row of args.rows) {
      const key = JSON.stringify(conflictColumns!.map((column) => row[column]));
      if (args.operation.name === "update" && affectedKeys.has(key)) {
        throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
      }
      affectedKeys.add(key);
    }
    const previous = afterHooks.get(args.operation.name);
    const data = Array.isArray(args.data) ? args.data : [args.data];
    if (previous) {
      previous.rows.push(...args.rows);
      (previous.data as AnyObject[]).push(...data);
      previous.rowData!.push(...data);
    } else {
      afterHooks.set(args.operation.name, { ...args, rows: [...args.rows], data, rowData: [...data] });
    }
  };

  for (const input of rows) {
    const prepared = await getInsertQuery({
      ...args,
      rows: [input],
      insertParams: conflictColumns ? {
        ...insertParams, onConflict: { action: "DoUpdate", conflictColumns },
      } : insertParams,
      conflictUpdateAsDoNothing: true,
    });
    conflictColumns = prepared.conflictColumns;
    const row = prepared.validatedRows[0]!;
    if (!conflictColumns?.length) throw new Error("Missing conflict columns for DoUpdate");

    // Bound retries when another writer repeatedly deletes the conflicting row.
    for (let attempt = 0; ; attempt++) {
      const conflictResult = { skipped: false };
      const inserted = await runInsertUpdateQuery({
        tableHandler,
        queryWithoutUserRLS: prepared.query,
        localParams,
        fields,
        returningFields,
        params: insertParams,
        rule: tableRules?.insert,
        command: "insert",
        data: row,
        isMultiInsert: false,
        conflictResult,
        runAfterHooks: collectAfterHooks,
      });
      if (!conflictResult.skipped) {
        if (inserted) results.push(inserted);
        break;
      }

      const filter: AnyObject = {};
      for (const column of conflictColumns) {
        const value = row[column];
        if (value === undefined || isObject(value) && Object.keys(value).some((key) => key.startsWith("$"))) {
          throw new Error("onConflict DoUpdate fallback requires explicit conflict column values");
        }
        filter[column] = { $eq: value };
      }
      const { where } = await prepareWhere(tableHandler, {
        filter, select: undefined, localParams: undefined, tableRule: undefined,
      });
      // DO NOTHING can wait for a row absent from its snapshot. A new statement sees it;
      // locking it prevents a concurrent delete between conflict detection and update.
      const existing = await transaction.t.oneOrNone(withUserRLS(localParams,
        `SELECT 1 FROM ${tableHandler.escapedName} ${where} FOR UPDATE`, true));
      if (!existing) {
        if (attempt < 2) continue;
        throw new Error("onConflict DoUpdate could not lock the conflicting row; retry the transaction");
      }
      const updateData = Object.fromEntries(Object.entries(row)
        .filter(([column]) => !conflictColumns!.includes(column)));
      const updated = await tableHandler.update(filter, updateData,
        { returning, removeDisallowedFields, multi: false }, updateRules, localParams, collectAfterHooks);
      if (updated) results.push(updated);
      break;
    }
  }
  for (const hookArgs of afterHooks.values()) {
    if (!args.isMultiInsert) hookArgs.data = (hookArgs.data as AnyObject[])[0]!;
    await executeAfterHooksCheckAndPostValidation(hookArgs);
  }
  return returning ? (args.isMultiInsert ? results : results[0]) : undefined;
};
