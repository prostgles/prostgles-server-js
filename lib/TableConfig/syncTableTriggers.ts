import type { DB } from "../Prostgles";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { getTableTriggerQueries } from "./getTableTriggerQueries";
import type { TableConfigurator } from "./TableConfigurator";
import { getAuditTriggerConfig } from "../Audit/getAuditTriggerConfig";
import { getMutationTriggerConfig } from "../TableHooks/getMutationTriggerConfig";
import { isPublishProfiles, type Publish } from "../PublishParser/publishTypesAndUtils";

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
    const hooks = tableHooks?.[table.name];
    const hasAfterHooks = [
      ...(hooks?.afterEach ?? []),
      ...(hooks?.afterAll ?? []),
      ...(hooks?.afterCommit ?? []),
    ].some(
      ({ commands }) =>
        commands.insert || commands.update || (commands.delete && !hooks?.onInsteadOfDelete),
    );
    const needsCapture =
      !table.is_view &&
      (hasAfterHooks ||
        (table.privileges.insert &&
          table.privileges.update &&
          publishNeedsCapture(prostgles.opts.publish, table.name)));
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

const publishNeedsCapture = (publish: Publish | undefined, tableName: string): boolean => {
  // Request-dependent rules can introduce upsert checks after setup has finished.
  if (typeof publish === "function") return true;
  if (isPublishProfiles(publish)) {
    return publish.some((profile) => publishNeedsCapture(profile.publish, tableName));
  }
  // Unrestricted rules and the all-tables tuple cannot contain validation callbacks or filters.
  if (!publish || publish === "*" || Array.isArray(publish)) return false;
  const rules = publish[tableName];
  if (!rules || typeof rules !== "object" || !rules.insert || !rules.update) return false;
  return [rules.insert, rules.update].some(
    (rule) => typeof rule === "object" && (rule.checkFilter || rule.postValidate),
  );
};
