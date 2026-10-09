import type { TableHandler as TypedTableHandler } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { JobInsertRecord, JobRecord, JobTransaction } from "./JobTypes";

/** Uses the normal table handler, bound to the supplied transaction. */
export const getJobTableHandler = (prostgles: Prostgles, transaction?: JobTransaction) => {
  prostgles.checkNotDestroyed();
  const { tableName } = prostgles.jobs;
  const handler =
    transaction ? transaction.dbx[tableName] : prostgles.dboBuilder.dboMap.get(tableName);
  if (!handler) throw new Error(`Job table ${tableName} is not available in schemaFilter`);
  return handler as unknown as JobTableHandler;
};

type JobTableHandler = Pick<
  TypedTableHandler<
    {
      jobs: { columns: JobRecord; insertColumns: JobInsertRecord };
    },
    "jobs"
  >,
  "findOne" | "insert" | "update" | "count"
>;
