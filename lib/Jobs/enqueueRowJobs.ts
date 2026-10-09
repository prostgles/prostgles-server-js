import { pickKeys, type AnyObject } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import { enqueueJob } from "./enqueueJob";
import type { JobRecord } from "./JobTypes";

export const enqueueRowJobs = async (
  table: TableHandler,
  command: "insert" | "update",
  rows: AnyObject[],
  localParams: LocalParams | undefined,
  changedFields: (string[] | null)[],
) => {
  const prostgles = table.dboBuilder.prostgles;
  if (localParams?.bypassHooks || !prostgles.jobs.hasRowTrigger(table.name, command)) {
    return;
  }
  const transaction = table.getTransaction(localParams);
  if (!transaction) {
    throw new Error("Row jobs require a transaction");
  }
  const primaryKeyNames = table.columns
    .filter((column) => column.is_pkey)
    .map((column) => column.name);
  const linkedRows = new Map<AnyObject, JobRecord["owner"]>();
  const sortedJobDefinitionEntries = Object.entries(prostgles.opts.jobs!.definitions).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  for (const [name, { trigger }] of sortedJobDefinitionEntries) {
    if (trigger.type !== "row" || trigger.table !== table.name || !trigger.on.includes(command)) {
      continue;
    }
    for (const [index, row] of rows.entries()) {
      if (
        command === "update" &&
        trigger.columns &&
        !trigger.columns.some((column) => changedFields[index]?.includes(column))
      ) {
        continue;
      }
      const owner = pickKeys(row, primaryKeyNames) as JobRecord["owner"];
      if (
        trigger.when &&
        !(await transaction.dbTX[table.name]!.findOne({ $and: [owner, trigger.when] }))
      ) {
        continue;
      }
      const { ownerRow } = await enqueueJob(
        prostgles,
        { t: transaction.t, dbx: transaction.dbTX },
        name,
        owner,
        { userId: prostgles.getExecution()?.user?.id },
      ).catch((error: unknown) => {
        // A caught enqueue error must not commit the originating row without its job.
        table.dboBuilder.failTransaction(transaction.t, error);
        throw error;
      });
      if (ownerRow) {
        Object.assign(row, ownerRow);
        linkedRows.set(row, owner);
      }
    }
  }
  return linkedRows;
};
