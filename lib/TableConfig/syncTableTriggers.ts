import type { DB } from "../Prostgles";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { getTableTriggerQueries } from "./getTableTriggerQueries";
import type { TableConfigurator } from "./TableConfigurator";
import { getAuditTriggerConfig } from "../Audit/getAuditTriggerConfig";
import { getMutationTriggerConfig } from "../TableHooks/getMutationTriggerConfig";

/** Reconcile application and generated triggers through one setup path. */
export const syncTableTriggers = async (configurator: TableConfigurator) => {
  const { prostgles, db } = configurator;
  const { tableConfig, tableHooks } = prostgles.mergedTableConfig;
  const config = tableConfig ?? {};
  const tables = prostgles.dboBuilder.tables;
  for (const name of Object.keys(config)) {
    if (!tables.some((table) => table.name === name)) {
      throw new Error(`Table config name must exactly match a schema table name: ${name}`);
    }
  }
  const audit = prostgles.resolvedAuditConfig;
  const auditTriggers = audit && getAuditTriggerConfig(audit);
  const tableTriggers = tables.map((table) => {
    // Publish rules are resolved per request, so upsert checks need capture ready in advance.
    const needsCapture =
      !table.is_view &&
      (tableHooks?.[table.name] ||
        prostgles.opts.publish ||
        prostgles.jobs.hasRowTrigger(table.name, "insert") ||
        prostgles.jobs.hasRowTrigger(table.name, "update"));
    return {
      tableIdent: table.escaped_identifier,
      triggers: {
        ...config[table.name]?.triggers,
        ...auditTriggers?.[table.name]?.triggers,
        ...(needsCapture && getMutationTriggerConfig(prostgles.dboBuilder.dboMap.get(table.name)!)),
      },
    };
  });
  const getQueries = async (transaction: Pick<DB, "any">) => {
    const queries: string[] = [];
    for (const { tableIdent, triggers } of tableTriggers) {
      queries.push(...(await getTableTriggerQueries(transaction, tableIdent, triggers)));
    }
    return queries;
  };
  await db.tx(async (transaction) => {
    if (!(await getQueries(transaction)).length) return;
    // Only setup takes this lock. Re-read after waiting so concurrent initializers
    // cannot both create the same function from a stale catalog snapshot.
    await transaction.any(
      "SELECT pg_advisory_xact_lock(hashtextextended('prostgles.tableConfig.triggers', 0))",
    );
    const queries = await getQueries(transaction);
    if (queries.length) {
      await transaction.none(`/* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */\n${queries.join("\n")}`);
    }
  });
};
