import { asName } from "prostgles-types";
import { md5 } from "prostgles-types/dist/md5";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { asValue } from "../PubSubManager/PubSubManagerUtils";
import { MUTATION_TRIGGER_PREFIX } from "../TableConfig/managedTriggerNames";
import type { BaseTableDefinition } from "../TableConfig/TableConfigTypes";

/** Stable definitions let instances with different hooks share the same triggers. */
export const getMutationTriggerConfig = (table: TableHandler): BaseTableDefinition["triggers"] => {
  const { schema: functionSchema, name: tableName } = table.tableOrViewInfo.qualifiedNameParts;
  const functionName = MUTATION_TRIGGER_PREFIX + md5(JSON.stringify([functionSchema, tableName]));
  const scope = `COALESCE(operation_id, '') = '' OR pg_trigger_depth() <> 1
    OR TG_RELID::text IS DISTINCT FROM current_setting('prostgles.mutation_table', true)`;
  // Compare individual columns to distinguish SQL NULL from a JSON null value.
  const changedFields = `array_remove(ARRAY[${table.column_names
    .map(
      (column) =>
        `CASE WHEN to_jsonb(NEW.${asName(column)}) IS DISTINCT FROM to_jsonb(OLD.${asName(column)}) THEN ${asValue(column)} END`,
    )
    .join(", ")}]::text[], NULL)`;
  return {
    [functionName]: {
      functionSchema,
      type: "after",
      actions: ["insert", "update", "delete"],
      forEach: "statement",
      query: `<<capture>>
      DECLARE operation_id text := current_setting('prostgles.mutation_id', true);
      BEGIN
        IF ${scope} THEN RETURN NULL; END IF;
        IF TG_OP = 'UPDATE' AND current_setting('prostgles.mutation_changed_fields', true) = 'true' THEN
          IF (SELECT relkind = 'p' FROM pg_class WHERE oid = TG_RELID) THEN
            RAISE EXCEPTION 'Actual changedFields tracking is not supported on partitioned table %', TG_TABLE_NAME;
          END IF;
          RETURN NULL;
        END IF;
        IF TG_OP = 'DELETE' THEN
          INSERT INTO pg_temp.prostgles_mutation_outbox (operation_id, command, row_text)
          SELECT capture.operation_id, 'delete', row::text FROM old_table row;
        ELSE
          INSERT INTO pg_temp.prostgles_mutation_outbox (operation_id, command, row_text)
          SELECT capture.operation_id, lower(TG_OP), row::text FROM new_table row;
        END IF;
        RETURN NULL;
      END;`,
    },
    // OLD/NEW transition tables cannot reliably pair rows without a stable key.
    // Keep this fallback installed and activate it only for changedFields requests.
    [`${functionName}_row`]: {
      functionSchema,
      type: "after",
      actions: ["update"],
      forEach: "row",
      query: `<<capture>>
      DECLARE operation_id text := current_setting('prostgles.mutation_id', true);
      BEGIN
        IF ${scope} OR current_setting('prostgles.mutation_changed_fields', true) IS DISTINCT FROM 'true'
        THEN RETURN NULL; END IF;
        INSERT INTO pg_temp.prostgles_mutation_outbox (operation_id, command, row_text, changed_fields)
        VALUES (capture.operation_id, 'update', NEW::text, ${changedFields});
        RETURN NULL;
      END;`,
    },
  };
};

export const needsChangedFields = (table: TableHandler) =>
  [
    ...(table.hooks?.afterEach ?? []),
    ...(table.hooks?.afterAll ?? []),
    ...(table.hooks?.afterCommit ?? []),
  ].some((hook) => hook.commands.update && hook.changedFields !== undefined) ||
  Object.values(table.dboBuilder.prostgles.opts.jobs?.definitions ?? {}).some(
    ({ trigger }) =>
      trigger.type === "row" &&
      trigger.table === table.name &&
      trigger.on.includes("update") &&
      trigger.columns !== undefined,
  );
