import { randomUUID } from "node:crypto";
import { asName, type AnyObject } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import { needsChangedFields } from "./getMutationTriggerConfig";
import { asValue, EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { MUTATION_METADATA } from "./mutationMetadata";

export type CapturedMutation = {
  command: "insert" | "update" | "delete";
  row: AnyObject;
  changedFields: string[] | null;
  rowKey: string;
};

export const captureMutation = async <Row extends AnyObject>(
  table: TableHandler,
  localParams: LocalParams | undefined,
  query: string,
): Promise<{ result: Row[]; mutations: CapturedMutation[] }> => {
  const transaction = table.getTransaction(localParams);
  if (!transaction) throw new Error("Mutation capture requires a transaction");
  const metadataNames = [
    MUTATION_METADATA.command,
    MUTATION_METADATA.changedFields,
    MUTATION_METADATA.rowKey,
  ];
  if (metadataNames.some((name) => table.columnSet.has(name))) {
    throw new Error(`Mutation metadata conflicts with a column on ${table.name}`);
  }
  const { t } = transaction;
  const operationId = randomUUID();
  // Send the scope, mutation and reset in one database call: concurrent JS branches
  // sharing this transaction must not overwrite each other's capture scope.
  const results = await t.multi<Row>(`
    /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
    CREATE TEMP TABLE IF NOT EXISTS prostgles_mutation_outbox (
      sequence bigint GENERATED ALWAYS AS IDENTITY,
      operation_id text NOT NULL, command text NOT NULL,
      row_text text NOT NULL, changed_fields text[]
    ) ON COMMIT DROP;
    SELECT set_config('prostgles.mutation_id', ${asValue(operationId)}, true),
      set_config('prostgles.mutation_table', ${asValue(table.escapedName)}::regclass::oid::text, true),
      set_config('prostgles.mutation_changed_fields', ${asValue(String(needsChangedFields(table)))}, true);
    ${query};
    SELECT set_config('prostgles.mutation_id', '', true);
  `);
  // Composite text preserves native types (including extension types). Decode
  // in PostgreSQL so the driver sees typed columns, not JSON-parsed numbers.
  const captured = await t.any(
    `WITH captured AS (
      DELETE FROM pg_temp.prostgles_mutation_outbox WHERE operation_id = $1 RETURNING *
    ) SELECT command AS ${MUTATION_METADATA.command}, changed_fields AS ${MUTATION_METADATA.changedFields},
      row_text AS ${MUTATION_METADATA.rowKey},
      (row_text::${table.escapedName}).*
    FROM captured ORDER BY sequence`,
    [operationId],
  );
  const mutations = captured.map((entry: AnyObject): CapturedMutation => {
    const {
      [MUTATION_METADATA.command]: command,
      [MUTATION_METADATA.changedFields]: changedFields,
      [MUTATION_METADATA.rowKey]: rowKey,
      ...row
    } = entry;
    return { command, changedFields, rowKey, row };
  });
  const result = results.at(-2)!;
  if (result.length !== mutations.length) {
    throw new Error(`Missing captured mutations for ${table.name}`);
  }
  return { result, mutations };
};

export const getMutationRowKeyQuery = (table: TableHandler) =>
  `(${asName(table.tableOrViewInfo.qualifiedNameParts.name)}.*)::text`;
