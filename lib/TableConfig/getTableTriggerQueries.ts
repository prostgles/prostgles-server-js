import { as } from "pg-promise";
import { md5 } from "prostgles-types/dist/md5";
import type { DB } from "../initProstgles";
import type { TableConfig } from "./TableConfigTypes";

const MANAGED_TRIGGER_PREFIX = "prostgles.tableConfig:";

/** Reconcile only triggers owned by tableConfig; preserve manually created triggers. */
export const getTableTriggerQueries = async (
  db: DB,
  tableName: string,
  tableConfig: TableConfig[string],
  asName: (name: string) => string,
): Promise<string[]> => {
  const tableIdent = asName(tableName);
  const existing = await db.any<{ name: string; comment: string | null }>(
    `
    SELECT t.tgname AS name, obj_description(t.oid, 'pg_trigger') AS comment
    FROM pg_trigger t
    WHERE t.tgrelid = to_regclass($1) AND NOT t.tgisinternal
  `,
    [tableIdent],
  );
  const queries: string[] = [];
  const desired = new Set<string>();
  const isDropped = tableConfig.dropIfExists || tableConfig.dropIfExistsCascade;
  for (const [functionName, trigger] of Object.entries(
    tableConfig.triggers ?? {},
  )) {
    const functionIdent = asName(functionName);
    let functionAdded = false;
    for (const action of trigger.actions) {
      const name = `${functionName}_${action}`;
      desired.add(name);
      const triggerIdent = asName(name);
      const transitionTables =
        trigger.forEach === "row"
          ? ""
          : [
              "REFERENCING",
              action !== "delete" ? "NEW TABLE AS new_table" : "",
              action !== "insert" ? "OLD TABLE AS old_table" : "",
            ].join(" ");
      const definition = `CREATE TRIGGER ${triggerIdent}
        ${trigger.type} ${action} ON ${tableIdent}
        ${transitionTables} FOR EACH ${trigger.forEach}
        EXECUTE FUNCTION ${functionIdent}();`;
      const comment = MANAGED_TRIGGER_PREFIX + md5(definition + trigger.query);
      const previous = existing.find((entry) => entry.name === name);
      if (!isDropped && previous?.comment === comment) continue;
      if (!functionAdded) {
        queries.push(`CREATE OR REPLACE FUNCTION ${functionIdent}()
          RETURNS trigger LANGUAGE plpgsql AS ${as.text(trigger.query)};`);
        functionAdded = true;
      }
      queries.push(`DROP TRIGGER IF EXISTS ${triggerIdent} ON ${tableIdent};`);
      queries.push(definition);
      queries.push(
        `COMMENT ON TRIGGER ${triggerIdent} ON ${tableIdent} IS ${as.text(comment)};`,
      );
    }
  }
  if (!isDropped) {
    for (const trigger of existing) {
      if (
        trigger.comment?.startsWith(MANAGED_TRIGGER_PREFIX) &&
        !desired.has(trigger.name)
      ) {
        queries.push(`DROP TRIGGER ${asName(trigger.name)} ON ${tableIdent};`);
      }
    }
  }
  return queries;
};
