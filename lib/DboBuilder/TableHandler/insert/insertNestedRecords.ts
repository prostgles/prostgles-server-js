import type { AnyObject, InsertParams } from "prostgles-types";
import { getKeys, isObject } from "prostgles-types";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import type { TableHandler } from "../TableHandler";
import { getReferenceColumnInserts } from "./getReferenceColumnInserts";
import { insertRowWithNestedRecords } from "./insertRowWithNestedRecords";
import { isArray } from "../../../utils/utils";
import type { InsertedRowWithInfo } from "./insert";

type MaybeArray<T> = T | T[];

type InsertNestedRecordsArgs = {
  data: MaybeArray<InsertedRowWithInfo>;
  insertParams?: InsertParams;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
};

/**
 * Referenced inserts within a single transaction
 */
export async function insertNestedRecords(
  this: TableHandler,
  { data, insertParams, tableRules, localParams }: InsertNestedRecordsArgs,
) {
  const MEDIA_COL_NAMES = ["data", "name"];

  const getExtraKeys = (row: AnyObject) =>
    getKeys(row).filter((fieldName) => {
      /* If media then use file insert columns */
      if (this.is_media) {
        return !this.column_names.concat(MEDIA_COL_NAMES).includes(fieldName);
      } else if (!this.columns.find((c) => c.name === fieldName)) {
        if (
          !isObject(row[fieldName]) &&
          !Array.isArray(row[fieldName]) &&
          row[fieldName] !== undefined
        ) {
          throw new Error("Invalid/Disallowed field in data: " + fieldName);
        } else if (!this.dboBuilder.dbo[fieldName]) {
          return false;
        }
        return true;
      }
      return false;
    });

  /**
   * True when: nested table data is provided within
   *    [nestedTable] property key
   *    OR
   *    [referencing_column] property key
   * If true then will do the full insert within this function
   * Nested insert is not allowed for the file table
   * */
  const isMultiInsert = isArray(data);
  const insertedRows = isMultiInsert ? data : [data];
  const insertedRowsWithNestedData = insertedRows.map((rowWithInfo) => {
    const row = { ...rowWithInfo.row };
    const extraKeys = this.is_media ? [] : getExtraKeys(row);
    const colInserts = this.is_media ? [] : getReferenceColumnInserts(this, row);
    return {
      ...rowWithInfo,
      hasNestedData: !!(extraKeys.length || colInserts.length),
      extraKeys,
      colInserts,
    };
  });
  const hasNestedInserts = insertedRowsWithNestedData.some((d) => d.hasNestedData);

  const rowOrRows =
    isMultiInsert ?
      insertedRowsWithNestedData.map((d) => d.row)
    : insertedRowsWithNestedData[0]!.row;
  /**
   * Make sure nested insert uses a transaction
   */
  const transaction = this.getTransaction(localParams);
  if (hasNestedInserts && !transaction) {
    return {
      type: "nestedInserts" as const,
      insertResult: (await this.dboBuilder.getTX((dbTX, _t) =>
        (dbTX[this.name] as TableHandler).insert(rowOrRows, insertParams, undefined, tableRules, {
          tx: { dbTX, t: _t },
          ...localParams,
        }),
      )) as MaybeArray<AnyObject>,
    };
  }
  const { dbTX } = transaction ?? {};
  const { onConflict } = insertParams || {};
  const rootOnConflict = isObject(onConflict) ? onConflict.action : onConflict;

  if (hasNestedInserts) {
    if (!dbTX) {
      throw new Error("dbTX missing for nested insert");
    }
    const insertResult: (AnyObject | undefined)[] = [];
    for (const { row, colInserts, extraKeys } of insertedRowsWithNestedData) {
      const nestedInsertResult = await insertRowWithNestedRecords.bind(this)(
        {
          row,
          colInserts,
          extraKeys,
          dbTX,
          rootOnConflict,
        },
        {
          localParams,
          tableRules,
          insertParams,
        },
      );
      insertResult.push(nestedInsertResult);
    }

    return {
      type: "nestedInserts" as const,
      insertResult: isMultiInsert ? insertResult : insertResult[0],
    };
  }

  const _data = insertedRowsWithNestedData.map(({ row, columnsAddedFromBeforeHooks }) => ({
    row,
    columnsAddedFromBeforeHooks,
  }));

  const result = isMultiInsert ? _data : _data[0];

  return { type: "normal" as const, data: result };
}
