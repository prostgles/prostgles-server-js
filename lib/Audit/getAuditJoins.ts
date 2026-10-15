import { as } from "pg-promise";
import type { Prostgles } from "../Prostgles";
import type { Join } from "../ProstglesTypes";
import type { TableSchema } from "../DboBuilder/DboBuilderTypes";
import { parseAuditConfig } from "./parseAuditConfig";

export const getAuditJoins = (prostgles: Prostgles, tables: TableSchema[]): Join[] => {
  const audit = parseAuditConfig(prostgles, tables);
  if (!audit) return [];
  return Object.entries(audit.tables).map(([tableName, { idColumns }]) => {
    const { schema, name } = tables.find((table) => table.name === tableName)!.qualifiedNameParts;
    return {
      tables: [audit.tableName, tableName],
      on: [
        {
          $joinName: "default",
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
};
