import type { AnyObject, ColumnInfo } from "prostgles-types";
import { getPossibleNestedInsert, isDefined, isObject } from "prostgles-types";
import type { TableHandler } from "../TableHandler";

export type ReferenceColumnInsert<ExpectSingleInsert> = {
  tableName: string;
  insertedFieldName: string;
  insertedFieldRef: Required<ColumnInfo>["references"][number];
  singleInsert: boolean;
  data: ExpectSingleInsert extends true ? AnyObject : AnyObject | AnyObject[];
};

/**
 * Insert through the reference column. e.g.:
 *  {
 *    root_field: "data",
 *    fkey_column: { ...referenced_table_data }
 *  }
 */
export const getReferenceColumnInserts = <ExpectSingleInsert extends boolean>(
  tableHandler: TableHandler,
  parentRow: AnyObject,
  expectSingleInsert?: ExpectSingleInsert,
): ReferenceColumnInsert<ExpectSingleInsert>[] => {
  return Object.entries(parentRow)
    .map(([insertedFieldName, insertedFieldValue]) => {
      if (insertedFieldValue && isObject(insertedFieldValue)) {
        const insertedRefCol = tableHandler.columns.find(
          (c) => c.name === insertedFieldName && c.references?.length,
        );
        if (!insertedRefCol) return undefined;
        const insertedFieldRef = getPossibleNestedInsert(
          insertedRefCol,
          tableHandler.dboBuilder.tablesOrViews ?? [],
          false,
        );
        return (
          insertedFieldRef && {
            insertedFieldName,
            insertedFieldRef,
          }
        );
      }

      return undefined;
    })
    .filter(isDefined)
    .map(({ insertedFieldName, insertedFieldRef }) => {
      const singleInsert = !Array.isArray(parentRow[insertedFieldName]);
      if (expectSingleInsert && !singleInsert) {
        throw "Expected singleInsert";
      }
      const res = {
        tableName: insertedFieldRef.ftable,
        insertedFieldName,
        insertedFieldRef,
        singleInsert,
        data: parentRow[insertedFieldName] as typeof singleInsert extends true ? AnyObject
        : AnyObject[],
      };
      return res;
    })
    .filter(isDefined);
};
