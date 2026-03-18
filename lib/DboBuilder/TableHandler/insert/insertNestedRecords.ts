import type { AnyObject, InsertParams } from "prostgles-types";
import { getKeys, isObject } from "prostgles-types";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import type { TableHandler } from "../TableHandler";
import { getReferenceColumnInserts } from "./getReferenceColumnInserts";
import { insertRowWithNestedRecords } from "./insertRowWithNestedRecords";

type InsertNestedRecordsArgs = {
  data: AnyObject | AnyObject[];
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
): Promise<{
  data?: AnyObject | AnyObject[];
  insertResult?: AnyObject | AnyObject[];
}> {
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
          throw new Error("Invalid/Dissalowed field in data: " + fieldName);
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
  const isMultiInsert = Array.isArray(data);
  const insertedRows = (isMultiInsert ? data : [data]) as AnyObject[];
  const insertedRowsWithNestedData = insertedRows.map((row) => {
    const extraKeys = this.is_media ? [] : getExtraKeys(row);
    const colInserts = this.is_media ? [] : getReferenceColumnInserts(this, row);
    return {
      row,
      hasNestedData: !!(extraKeys.length || colInserts.length),
      extraKeys,
      colInserts,
    };
  });
  const hasNestedInserts = insertedRowsWithNestedData.some((d) => d.hasNestedData);

  /**
   * Make sure nested insert uses a transaction
   */
  const dbTX = this.getFinalDBtx(localParams);
  const t = localParams?.tx?.t || this.tx?.t;
  if (hasNestedInserts && (!dbTX || !t)) {
    return {
      insertResult: await this.dboBuilder.getTX((dbTX, _t) =>
        (dbTX[this.name] as TableHandler).insert(data, insertParams, undefined, tableRules, {
          tx: { dbTX, t: _t },
          ...localParams,
        }),
      ),
    };
  }
  const { onConflict } = insertParams || {};
  const rootOnConflict = isObject(onConflict) ? onConflict.action : onConflict;

  const _data: (AnyObject | undefined)[] = [];
  for (const { row, colInserts, extraKeys } of insertedRowsWithNestedData) {
    if (hasNestedInserts) {
      if (!dbTX) {
        throw new Error("dbTX missing for nested insert");
      }
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
      _data.push(nestedInsertResult);
    } else {
      _data.push(row);
    }
  }

  const result = isMultiInsert ? _data : _data[0];
  const res = hasNestedInserts ? { insertResult: result } : { data: result };

  return res;
}
