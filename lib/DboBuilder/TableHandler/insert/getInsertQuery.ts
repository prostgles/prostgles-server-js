import {
  asName,
  isObject,
  type AnyObject,
  type FieldFilter,
  type InsertParams,
} from "prostgles-types";
import { prepareNewData } from "../DataValidator";
import type { TableHandler } from "../TableHandler";
import type { ParsedTableRule, ValidateRowBasic } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import type { InsertedRowWithInfo } from "./insert";

export const getInsertQuery = async ({
  rows,
  tableHandler,
  forcedData,
  fields,
  tableRules,
  localParams,
  insertParams,
  validate,
}: {
  tableHandler: TableHandler;
  rows: (InsertedRowWithInfo | undefined)[];
  forcedData: AnyObject | undefined;
  fields: FieldFilter | undefined;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
  insertParams: InsertParams | undefined;
  validate: ValidateRowBasic | undefined;
}) => {
  const transaction = tableHandler.getTransaction(localParams);
  const { removeDisallowedFields = false } = insertParams ?? {};
  const validatedData = rows.map((rowWithInfo) => {
    const { row: _row, columnsAddedFromBeforeHooks = [] } = rowWithInfo ?? {};
    const row = { ..._row };

    if (!isObject(row)) {
      throw (
        "\nInvalid insert data provided. Expected an object but received: " + JSON.stringify(row)
      );
    }

    const { data: validatedRow, allowedCols } = prepareNewData({
      row,
      forcedData,
      allowedFields: fields,
      tableRules,
      removeDisallowedFields,
      tableConfigurator: tableHandler.dboBuilder.prostgles.tableConfigurator,
      tableHandler,
      columnsAddedFromBeforeHooks,
    });
    return { validatedRow, allowedCols };
  });

  const validatedRows = validatedData.map((d) => d.validatedRow);
  const allowedCols = Array.from(new Set(validatedData.flatMap((d) => d.allowedCols)));
  const dbTx = transaction?.dbTX || tableHandler.dboBuilder.dbo;
  const tx = transaction?.t || tableHandler.db;
  const validationOptions = {
    validate: validate as ValidateRowBasic,
    localParams,
  };

  const query = (
    await tableHandler.dataValidator.parse({
      command: "insert",
      rows: validatedRows,
      allowedCols,
      dbTx,
      validationOptions,
      tx,
    })
  ).getQuery();
  const { onConflict } = insertParams ?? {};
  let conflict_query = "";
  if (onConflict) {
    const onConflictAction = typeof onConflict === "string" ? onConflict : onConflict.action;
    const onConflictColumns =
      typeof onConflict === "string" ? undefined : onConflict.conflictColumns;
    if (onConflictAction === "DoNothing") {
      conflict_query = " ON CONFLICT DO NOTHING ";
    } else {
      const firstRowKeys = Object.keys(validatedData[0]?.validatedRow ?? {});
      const pkeyNames = tableHandler.columns.filter((c) => c.is_pkey).map((c) => c.name);
      const conflictColumns =
        onConflictColumns ??
        tableHandler.tableOrViewInfo.uniqueColumnGroups?.find((colGroup) => {
          if (!firstRowKeys.length)
            throw "Cannot determine conflict columns for onConflict DoUpdate";
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

      const nonConflictColumns = allowedCols
        .filter((c) => !conflictColumns.includes(c))
        .map((v) => asName(v));

      if (nonConflictColumns.length === 0) {
        throw "No non conflict columns to update for onConflict=DoUpdate";
      }
      conflict_query = ` ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${nonConflictColumns.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}`;
    }
  }
  return query + conflict_query;
};
