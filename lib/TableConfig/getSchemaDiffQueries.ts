import { isDefined, isEqual } from "prostgles-types";
import { asValue } from "../PubSubManager/PubSubManager";
import { type SchemaInfo } from "./getSchemaForTableConfig";

/**
 * TODO: col definition contain inline constraints and indexes. Separate them
 */
export const getSchemaDiffQueries = ({
  oldSchema,
  newSchema,
  newSchemaTableDefinitions,
}: {
  oldSchema: SchemaInfo;
  newSchema: SchemaInfo;
  /**
   * tableName: {
   *  columnName: columnDefinition
   * }
   */
  newSchemaTableDefinitions: Record<string, Record<string, string>>;
}) => {
  const droppedTableIdents = oldSchema
    .map((ot) => {
      const wasDropped = !newSchema.some((nt) => nt.table_ident === ot.table_ident);
      if (!wasDropped) return;
      return ot.table_ident;
    })
    .filter(isDefined);
  const droppedTableQueries =
    droppedTableIdents.length ? [`DROP TABLE ${droppedTableIdents.join(", ")} CASCADE;`] : [];

  const droppedColumns: { table_ident: string; column_name: string }[] = [];

  const tableAndColQueries = newSchema
    .flatMap(({ table_ident, table_name, columns }) => {
      const oldTable = oldSchema.find((ot) => ot.table_ident === table_ident);
      if (!oldTable) {
        const newTableQuery = [
          `CREATE TABLE ${table_ident} (`,
          (columns ?? [])
            .map(
              (c) =>
                c.column_name_escaped +
                " " +
                newSchemaTableDefinitions[table_name]![c.column_name_escaped]
            )
            .join(",\n"),
          `);`,
        ].join("\n");
        return [newTableQuery];
      }

      if (!isEqual(columns, oldTable.columns)) return;

      const droppedColumnQueries =
        oldTable.columns
          ?.filter((oc) => !columns?.some((c) => c.column_name === oc.column_name))
          .map((dc) => {
            droppedColumns.push({ table_ident, column_name: dc.column_name });
            return `ALTER TABLE ${table_ident} DROP COLUMN ${dc.column_name};`;
          }) ?? [];

      const alteredAndNewColumns =
        columns?.flatMap((c) => {
          const oldCol = oldTable.columns?.find((oc) => oc.column_name === c.column_name);
          if (!oldCol) {
            return [
              `ALTER TABLE ${table_ident} ADD COLUMN ${newSchemaTableDefinitions[table_name]![c.column_name_escaped]};`,
            ];
          }
          if (isEqual(oldCol, c)) return [];
          const queries: string[] = [];
          const alterTableQuery = `ALTER TABLE ${c.table_ident} ALTER COLUMN ${c.column_name_escaped} `;
          if (c.column_default !== oldCol.column_default) {
            queries.push(
              `${alterTableQuery} ` +
                (c.column_default !== null ?
                  `SET DEFAULT ${asValue(c.column_default)};`
                : `DROP DEFAULT;`)
            );
          }
          if (c.udt_name !== oldCol.udt_name) {
            queries.push(`${alterTableQuery} TYPE ${c.udt_name};`);
          }
          if (c.is_nullable !== oldCol.is_nullable) {
            queries.push(`${alterTableQuery} ${c.is_nullable ? "DROP NOT NULL" : "SET NOT NULL"};`);
          }

          return queries;
        }) ?? [];

      return [...droppedColumnQueries, ...alteredAndNewColumns];
    })
    .filter(isDefined);

  // const droppedConstraints = oldSchema.constraints.filter(
  //   (c) =>
  //     /** Was not already dropped with the table/column */
  //     !droppedTableIdents.includes(c.table_ident) &&
  //     !droppedColumns.some(
  //       (col) => col.table_ident === c.table_ident && c.columns?.includes(col.column_name)
  //     ) &&
  //     !newSchema.constraints.some(
  //       (nc) =>
  //         nc.table_ident === c.table_ident &&
  //         // nc.conname === c.conname &&
  //         nc.definition === c.definition &&
  //         nc.contype === c.contype
  //     )
  // );

  // /** Some constraints have already been dropped due to the previous table/col changes */
  // const droppedConstraintsQueries = droppedConstraints.map(
  //   (c) => `ALTER TABLE ${c.table_ident} DROP CONSTRAINT IF EXISTS ${c.conname};`
  // );

  // const newAndAlteredConstraints = newSchema.constraints
  //   .flatMap(({ table_ident, definition, contype }) => {
  //     const oldConstraint = oldSchema.constraints.find(
  //       (oc) =>
  //         oc.table_ident === table_ident && oc.definition === definition && oc.contype === contype
  //     );

  //     if (!oldConstraint) {
  //       return [`ALTER TABLE ${table_ident} ADD ${definition};`];
  //     }
  //   })
  //   .filter(isDefined);

  return [
    ...droppedTableQueries,
    ...tableAndColQueries,
    // ...droppedConstraintsQueries,
    // ...newAndAlteredConstraints,
  ];
};
