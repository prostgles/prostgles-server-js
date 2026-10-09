import type { Prostgles } from "../Prostgles";
import type { RuntimeJobDefinition } from "./JobTypes";
import type { TableSchema } from "../DboBuilder/DboBuilderTypes";
import { parseCronSchedule } from "./cronSchedule";
import { getJobParams } from "./getJobParams";

export const getJobDefinition = (prostgles: Prostgles, name: string) => {
  const definition = prostgles.opts.jobs?.definitions[name] as RuntimeJobDefinition | undefined;
  if (!definition) throw new Error(`Unknown job: ${name}`);
  const { trigger } = definition;
  const table =
    trigger.type === "row" ?
      prostgles.dboBuilder.tablesOrViews?.find((t) => t.name === trigger.table)
    : undefined;
  return { definition, table };
};

export const validateJobDefinitions = async (prostgles: Prostgles, tables: TableSchema[]) => {
  for (const [name, job] of Object.entries(prostgles.opts.jobs?.definitions ?? {})) {
    const { trigger, retry } = job;
    if (
      !name ||
      typeof job.run !== "function" ||
      (job.runAs !== undefined && !["system", "user"].includes(job.runAs)) ||
      (job.onConflict !== undefined && !["queue", "replace", "skip"].includes(job.onConflict)) ||
      (job.concurrency !== undefined &&
        (!Number.isSafeInteger(job.concurrency) || job.concurrency < 1)) ||
      (job.timeoutMs !== undefined &&
        (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > 2_147_483_647)) ||
      (retry &&
        (!Number.isSafeInteger(retry.maxAttempts) ||
          retry.maxAttempts < 1 ||
          !Number.isFinite(retry.delayMs ?? 1000) ||
          (retry.delayMs ?? 1000) < 0 ||
          (retry.backoff !== undefined && !["fixed", "exponential"].includes(retry.backoff))))
    ) {
      throw new Error(`Invalid job definition: ${name}`);
    }
    if (trigger.type === "row") {
      const table = tables.find((t) => t.name === trigger.table);
      if (
        !table ||
        table.is_view ||
        !table.columns.some((c) => c.is_pkey) ||
        !trigger.on.length ||
        trigger.on.some((command) => !["insert", "update"].includes(command)) ||
        trigger.columns?.some((column) => !table.columns.some((c) => c.name === column))
      ) {
        throw new Error(
          `Invalid row trigger for ${name}: expected a table with a primary key and valid columns`,
        );
      }
      if (
        trigger.jobIdColumn !== undefined &&
        !table.columns.some((c) => c.name === trigger.jobIdColumn && !c.is_pkey)
      ) {
        throw new Error(
          `Invalid jobIdColumn for ${name}: expected an existing non-primary-key column`,
        );
      }
      if (trigger.when) {
        await prostgles.dboBuilder.dboMap
          .get(table.name)!
          .find(trigger.when, { select: "", limit: 0 });
      }
      // Validate untyped JavaScript configurations too.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (trigger.type === "schedule") {
      if (job.runAs === "user") throw new Error(`Scheduled job ${name} cannot runAs user`);
      parseCronSchedule(trigger);
    } else {
      throw new Error(`Invalid job trigger: ${name}`);
    }
    await getJobParams(prostgles, job.params, {});
  }
};
