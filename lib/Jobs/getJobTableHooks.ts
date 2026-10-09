import { pickKeys, type AnyObject } from "prostgles-types";
import type { TableHandlers } from "../DboBuilder/DboBuilder";
import type { Prostgles } from "../Prostgles";
import type { AfterEachTsTrigger } from "../PublishParser/publishTypesAndUtils";
import type { TableHooks } from "../TableHooks/TableHooks";
import { enqueueJob } from "./enqueueJob";
import type { JobRecord } from "./JobTypes";

export const getJobTableHooks = (
  prostgles: Prostgles,
  tableHooks: TableHooks<void, any> | undefined,
) => {
  if (!prostgles.opts.jobs) return tableHooks;
  const mergedHooks: TableHooks<void, any> = { ...tableHooks };
  // Prepend in reverse order so job hooks retain their alphabetical execution order.
  const definitions = Object.entries(prostgles.opts.jobs.definitions).sort(
    ([firstName], [secondName]) => secondName.localeCompare(firstName),
  );
  for (const [name, { trigger }] of definitions) {
    if (trigger.type !== "row") continue;
    const hook = {
      hookKey: `job:${name}`,
      commands: Object.fromEntries(trigger.on.map((command) => [command, 1 as const])),
      changedFields: trigger.columns,
      preventRecursion: true,
      validate: async ({ row, dbx, localParams }) => {
        const table = dbx[trigger.table]!;
        const transaction = table.getTransaction(localParams)!;
        const primaryKeyNames = table.columns
          .filter((column) => column.is_pkey)
          .map((column) => column.name);
        const owner = pickKeys(row, primaryKeyNames) as JobRecord["owner"];
        if (trigger.when && !(await table.findOne({ $and: [owner, trigger.when] }))) return;
        const { ownerRow } = await enqueueJob(prostgles, { t: transaction.t, dbx }, name, owner, {
          userId: prostgles.getExecution()?.user?.id,
        }).catch((error: unknown) => {
          // A caught enqueue error must not commit the originating row without its job.
          table.dboBuilder.failTransaction(transaction.t, error);
          throw error;
        });
        if (ownerRow) Object.assign(row, ownerRow);
      },
    } satisfies AfterEachTsTrigger<AnyObject, TableHandlers, any> & { hookKey: string };
    const hooks = mergedHooks[trigger.table];
    mergedHooks[trigger.table] = {
      ...hooks,
      afterEach: [hook, ...(hooks?.afterEach ?? [])],
    };
  }
  return mergedHooks;
};
