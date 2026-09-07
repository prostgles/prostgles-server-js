import type { Prostgles } from "../Prostgles";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { getTableTriggerQueries } from "./getTableTriggerQueries";

/** Applies application and generated audit triggers together, after all tables exist. */
export async function syncTableTriggers(prgl: Prostgles) {
  const config = prgl.mergedTableConfig.tableConfig ?? {};
  const queries: string[] = [];
  for (const name of Object.keys(config)) {
    if (!prgl.dboBuilder.tables.some((t) => t.name === name)) {
      throw new Error(`Table config name must exactly match a schema table name: ${name}`);
    }
  }
  for (const table of prgl.dboBuilder.tables) {
    queries.push(
      ...(await getTableTriggerQueries(
        prgl.dbForSchema!,
        table.escaped_identifier,
        config[table.name]?.triggers,
      )),
    );
  }
  if (queries.length) {
    await prgl.dbForSchema!.tx((tx) =>
      tx.none(`/* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */\n${queries.join("\n")}`),
    );
  }
}
