import { as } from "pg-promise";
import type { DB } from "../initProstgles";
import { asName } from "prostgles-types";
import type { TableConfig } from "./TableConfigTypes";
import {
  AUDIT_HISTORY_PROTECTION_PREFIX,
  getManagedTriggerName,
  isManagedTriggerName,
} from "./managedTriggerNames";

/** Compare actual definitions so unchanged triggers do not cause schema refreshes. */
export const getTableTriggerQueries = async (
  db: DB,
  tableIdent: string,
  tableConfig: TableConfig[string],
): Promise<string[]> => {
  const existing = await db.any<{
    name: string;
    type: number;
    enabled: string;
    function_name: string;
    query: string;
    old_table: string | null;
    new_table: string | null;
    args: number;
    unconditional: boolean;
    visible_function: boolean;
  }>(
    `
    SELECT t.tgname AS name, t.tgtype AS type, t.tgenabled AS enabled,
      p.proname AS function_name, p.prosrc AS query, t.tgoldtable AS old_table,
      t.tgnewtable AS new_table, t.tgnargs AS args,
      (t.tgqual IS NULL AND t.tgattr::text = '' AND t.tgconstraint = 0) AS unconditional,
      p.oid = to_regprocedure(quote_ident(p.proname) || '()') AS visible_function
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = to_regclass($1) AND NOT t.tgisinternal AND t.tgparentid = 0
  `,
    [tableIdent],
  );
  const queries: string[] = [];
  const desired = new Set<string>();
  const actionBits = { insert: 4, delete: 8, update: 16, truncate: 32 };
  for (const [functionName, trigger] of Object.entries(
    tableConfig.triggers ?? {},
  )) {
    const functionIdent = asName(functionName);
    let functionAdded = false;
    for (const action of trigger.actions) {
      const name = getManagedTriggerName(functionName, action);
      desired.add(name);
      // Replace the unprefixed names used by earlier tableConfig versions.
      const legacyName = `${functionName}_${action}`;
      if (
        legacyName !== name &&
        existing.some(
          (t) => t.name === legacyName && t.function_name === functionName,
        )
      ) {
        queries.push(`DROP TRIGGER ${asName(legacyName)} ON ${tableIdent};`);
      }
      const triggerIdent = asName(name);
      const hasTransitionTables =
        trigger.forEach === "statement" &&
        trigger.type === "after" &&
        action !== "truncate";
      const oldTable =
        hasTransitionTables && action !== "insert" ? "old_table" : null;
      const newTable =
        hasTransitionTables && action !== "delete" ? "new_table" : null;
      const transitionTables = hasTransitionTables
        ? [
            "REFERENCING",
            newTable ? "NEW TABLE AS new_table" : "",
            oldTable ? "OLD TABLE AS old_table" : "",
          ].join(" ")
        : "";
      const type =
        actionBits[action] |
        (trigger.forEach === "row" ? 1 : 0) |
        (trigger.type === "before"
          ? 2
          : trigger.type === "instead of"
            ? 64
            : 0);
      const previous = existing.find((entry) => entry.name === name);
      if (
        previous?.type === type &&
        previous.enabled === "O" &&
        previous.function_name === functionName &&
        previous.query === trigger.query &&
        previous.old_table === oldTable &&
        previous.new_table === newTable &&
        !previous.args &&
        previous.unconditional &&
        previous.visible_function
      )
        continue;
      if (!functionAdded) {
        queries.push(
          `CREATE OR REPLACE FUNCTION ${functionIdent}() RETURNS trigger LANGUAGE plpgsql AS ${as.text(trigger.query)};`,
        );
        functionAdded = true;
      }
      queries.push(`DROP TRIGGER IF EXISTS ${triggerIdent} ON ${tableIdent};`);
      queries.push(`CREATE TRIGGER ${triggerIdent} ${trigger.type} ${action} ON ${tableIdent}
        ${transitionTables} FOR EACH ${trigger.forEach} EXECUTE FUNCTION ${functionIdent}();`);
    }
  }
  for (const trigger of existing) {
    const managed = isManagedTriggerName(trigger.name);
    // History remains append-only even after audit is disabled or moved.
    const protectsHistory = trigger.name.startsWith(AUDIT_HISTORY_PROTECTION_PREFIX);
    if (managed && !protectsHistory && !desired.has(trigger.name)) {
      queries.push(`DROP TRIGGER ${asName(trigger.name)} ON ${tableIdent};`);
    }
  }
  return queries;
};
