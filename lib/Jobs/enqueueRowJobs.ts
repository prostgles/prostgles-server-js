import { isEqual, type AnyObject } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import { enqueueJob } from "./enqueueJob";
import { JOB_PREVIOUS_ROW } from "./getJobUpdateQuery";
import type { JobRecord } from "./JobTypes";

export const enqueueRowJobs = async (
  table: TableHandler,
  command: "insert" | "update",
  rows: AnyObject[],
  localParams: LocalParams | undefined,
) => {
  const prostgles = table.dboBuilder.prostgles;
  if (!prostgles.jobs.hasRowTrigger(table.name, command)) return;
  const transaction = table.getTransaction(localParams);
  if (!transaction) throw new Error("Row jobs require a transaction");
  const keys = table.columns.filter((column) => column.is_pkey).map((column) => column.name);
  const definitions = Object.entries(prostgles.opts.jobs!.definitions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [name, { trigger }] of definitions) {
    if (trigger.type !== "row" || trigger.table !== table.name || !trigger.on.includes(command)) {
      continue;
    }
    for (const row of rows) {
      const change = row[JOB_PREVIOUS_ROW] as { old: AnyObject; new: AnyObject } | undefined;
      if (
        command === "update" &&
        trigger.columns &&
        change &&
        !trigger.columns.some((column) => !isEqual(change.old[column], change.new[column]))
      ) {
        continue;
      }
      const owner = Object.fromEntries(keys.map((key) => [key, row[key]])) as JobRecord["owner"];
      if (
        trigger.when &&
        !(await transaction.dbTX[table.name]!.findOne({ $and: [owner, trigger.when] }))
      )
        continue;
      await enqueueJob(prostgles, { t: transaction.t, dbx: transaction.dbTX }, name, owner, {
        userId: prostgles.getExecution()?.user?.id,
      }).catch((error: unknown) => {
        // A caught enqueue error must not commit the originating row without its job.
        table.dboBuilder.failTransaction(transaction.t, error);
        throw error;
      });
    }
  }
};
