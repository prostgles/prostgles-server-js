import { as } from "pg-promise";
import type { Prostgles } from "../Prostgles";
import type { Join } from "../ProstglesTypes";
import type { TableSchema } from "../DboBuilder/DboBuilderTypes";
import { parseAuditConfig } from "./parseAuditConfig";
import { AUDIT_TABLE_COLUMN_NAMES } from "./AuditTable";
import { getAuditJobIdSQL } from "./getAuditJobIdSQL";

export const AUDIT_JOB_JOIN_NAME = "executed_by_job";
export const AUDIT_ROW_JOIN_NAME = "audited_row";

export const getAuditJoins = (prostgles: Prostgles, tables: TableSchema[]): Join[] => {
  const audit = parseAuditConfig(prostgles, tables);
  if (!audit) return [];
  const joins = Object.entries(audit.tables).map<Join>(([tableName, { idColumns }]) => {
    const table = tables.find((table) => table.name === tableName);
    if (!table) throw new Error(`Audit source table not found: ${tableName}`);
    const { schema, name } = table.qualifiedNameParts;
    return {
      tables: [audit.tableName, tableName],
      on: [
        {
          $joinName: AUDIT_ROW_JOIN_NAME,
          $sql: ({ left, right }) => {
            const rowPkeyJsonb = `jsonb_build_object(${idColumns
              .flatMap((column) => [as.text(column), right(column)])
              .join(", ")})`;
            return [
              `${left("schema_name")} = ${as.text(schema)}`,
              `${left("table_name")} = ${as.text(name)}`,
              `(${left("old_id")} = ${rowPkeyJsonb} OR ${left("new_id")} = ${rowPkeyJsonb})`,
            ].join(" AND ");
          },
        },
      ],
    };
  });
  if (prostgles.opts.jobs) {
    joins.push({
      tables: [audit.tableName, prostgles.jobs.tableName],
      on: [
        {
          $joinName: AUDIT_JOB_JOIN_NAME,
          $sql: ({ left, right }) =>
            `${getAuditJobIdSQL(left(AUDIT_TABLE_COLUMN_NAMES.execution_context))} = ${right("id")}`,
        },
      ],
    });
  }
  return joins;
};
