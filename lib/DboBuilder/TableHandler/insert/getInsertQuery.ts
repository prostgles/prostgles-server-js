import { isObject, type AnyObject, type FieldFilter, type InsertParams } from "prostgles-types";
import { prepareNewData } from "../DataValidator";
import type { TableHandler } from "../TableHandler";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import type { InsertedRowWithInfo } from "./insert";
import { getConflictUpdateQuery } from "./getConflictUpdateQuery";

export const getInsertQuery = async ({
  rows,
  tableHandler,
  forcedData,
  fields,
  tableRules,
  insertParams,
  localParams,
}: {
  tableHandler: TableHandler;
  rows: (InsertedRowWithInfo | undefined)[];
  forcedData: AnyObject | undefined;
  fields: FieldFilter | undefined;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
  insertParams: InsertParams | undefined;
}) => {
  const { removeDisallowedFields = false } = insertParams ?? {};
  const preparedData = rows.map((rowWithInfo) => {
    const { row: _row, columnsAddedFromBeforeHooks = [] } = rowWithInfo ?? {};
    const row = { ..._row };

    if (!isObject(row)) {
      throw (
        "\nInvalid insert data provided. Expected an object but received: " + JSON.stringify(row)
      );
    }

    return prepareNewData({
      row,
      forcedData,
      allowedFields: fields,
      tableRules,
      removeDisallowedFields,
      tableConfigurator: tableHandler.dboBuilder.prostgles.tableConfigurator,
      tableHandler,
      columnsAddedFromBeforeHooks,
    });
  });

  const allowedCols = Array.from(new Set(preparedData.flatMap((d) => d.allowedCols)));
  const { getQuery, validatedRows } = await tableHandler.dataValidator.parse({
    command: "insert",
    rows: preparedData.map((d) => d.data),
    allowedCols,
  });
  const query = getQuery();
  const { onConflict } = insertParams ?? {};
  let conflict_query = "";
  let conflictColumns: string[] | undefined;
  if (onConflict) {
    const onConflictAction = typeof onConflict === "string" ? onConflict : onConflict.action;
    const onConflictColumns =
      typeof onConflict === "string" ? undefined : onConflict.conflictColumns;
    if (onConflictAction === "DoNothing") {
      conflict_query = " ON CONFLICT DO NOTHING ";
    } else {
      const firstRowKeys = Object.keys(validatedRows[0] ?? {});
      const pkeyNames = tableHandler.columns.filter((c) => c.is_pkey).map((c) => c.name);
      conflictColumns =
        onConflictColumns ??
        tableHandler.tableOrViewInfo.uniqueColumnGroups?.find((colGroup) => {
          if (!firstRowKeys.length) {
            throw "Cannot determine conflict columns for onConflict DoUpdate";
          }
          return colGroup.some((col) => {
            return firstRowKeys.includes(col);
          });
        }) ??
        pkeyNames;

      /**
       * Table might have multiple constraint types in which case it is mandatory to specify the conflict columns.
       * */
      if (!conflictColumns.length) {
        throw "Cannot on conflict DoUpdate. No conflict columns could be determined. Please specify conflictColumns in onConflict param.";
      }

      conflict_query =
        " " +
        (await getConflictUpdateQuery({
          table: tableHandler,
          tableRules,
          localParams,
          rows: validatedRows,
          conflictColumns,
          removeDisallowedFields,
          columnsAddedFromBeforeHooks: [
            ...new Set(rows.flatMap((row) => row?.columnsAddedFromBeforeHooks ?? [])),
          ],
        }));
    }
  }
  return { query: query + conflict_query, conflictColumns, validatedRows };
};
