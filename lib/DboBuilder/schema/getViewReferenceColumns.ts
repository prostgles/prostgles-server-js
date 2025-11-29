import { isDefined, type SQLResult } from "prostgles-types";
import type { DboBuilder } from "../DboBuilder";
import type { TableSchema, TableSchemaColumn } from "../DboBuilderTypes";

export const getViewReferenceColumns = async (
  table: TableSchema,
  tableSchemaList: TableSchema[],
  runSQL: DboBuilder["runSQL"]
) => {
  const viewReferenceColumns: Pick<TableSchemaColumn, "name" | "references">[] = [];
  if (!table.is_view || !table.view_definition) {
    return undefined;
  }
  try {
    const view_definition =
      table.view_definition.endsWith(";") ?
        table.view_definition.slice(0, -1)
      : table.view_definition;
    const { fields: viewFieldsWithInfo } = (await runSQL(
      `SELECT * FROM \n ( ${view_definition} \n) t LIMIT 0`,
      {},
      {},
      undefined
    )) as SQLResult<undefined>;
    const viewTables = tableSchemaList.filter((r) =>
      viewFieldsWithInfo.some((f) => f.tableID === r.oid)
    );
    viewTables.forEach((viewTable) => {
      const viewTableColumnsUsed = viewFieldsWithInfo
        .map(({ columnName, ...col }) => {
          if (!columnName || col.tableID !== viewTable.oid) return;
          return {
            ...col,
            columnName,
          };
        })
        .filter(isDefined);
      const viewTablePKeys = viewTable.columns.filter((c) => c.is_pkey);
      const viewTableColumnsUsedPKeys = viewTableColumnsUsed.filter((ff) =>
        viewTablePKeys.some((p) => p.name === ff.columnName)
      );

      const addReferences = (referenceCols: typeof viewTableColumnsUsedPKeys) => {
        const reference: { ftable: string; fcols: string[]; cols: string[] } = {
          ftable: viewTable.name,
          cols: [],
          fcols: [],
        };
        referenceCols.forEach(({ name: viewColumnName, columnName: tableColumnName }) => {
          reference.cols.push(viewColumnName);
          reference.fcols.push(tableColumnName);
        });
        reference.cols.forEach((colName) => {
          viewReferenceColumns.push({
            name: colName,
            references: [reference],
          });
        });
      };
      const canTransferPKeys =
        viewTablePKeys.length && viewTableColumnsUsedPKeys.length === viewTablePKeys.length;
      if (canTransferPKeys) {
        addReferences(viewTableColumnsUsedPKeys);
      } else {
        const comparableColumns = viewTableColumnsUsed.filter(
          (ff) => !["json", "jsonb", "xml"].includes(ff.udt_name)
        );
        addReferences(comparableColumns);
      }
    });
  } catch (err) {
    console.error(err);
  }

  return viewReferenceColumns;
};
