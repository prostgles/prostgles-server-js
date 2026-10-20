import type { AnyObject, InsertParams } from "prostgles-types";
import { isObject, omitKeys } from "prostgles-types";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import type { LocalParams, TableHandlers } from "../../DboBuilder";
import type { TableHandler } from "../TableHandler";
import type { ReferenceColumnInsert } from "./getReferenceColumnInserts";
import type { InsertedRowWithInfo } from "./insert";
import { getInsertTableRules } from "./getInsertTableRules";

type InsertNestedRecordsArgs = {
  data: AnyObject | AnyObject[];
  insertParams?: InsertParams;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
};

/**
 * Referenced inserts within a single transaction
 */
export async function insertRowWithNestedRecords(
  this: TableHandler,
  {
    row,
    extraKeys,
    colInserts,
    dbTX,
    rootOnConflict,
    preparedUpsertRow,
  }: {
    row: AnyObject;
    preparedUpsertRow: InsertedRowWithInfo | undefined;
    extraKeys: string[];
    colInserts: ReferenceColumnInsert<boolean>[];
    dbTX: TableHandlers;
    rootOnConflict: "DoNothing" | "DoUpdate" | undefined;
  },
  { insertParams, tableRules, localParams }: Omit<InsertNestedRecordsArgs, "data">,
) {
  /* Ensure we're using the same transaction */
  const tableHandler = this.tx ? this : (dbTX[this.name] as TableHandler);

  const omittedKeys = extraKeys.concat(colInserts.map((c) => c.insertedFieldName));

  const rootData: AnyObject = omitKeys(row, omittedKeys);

  let insertedChildren: AnyObject[];
  let targetTableRules: ParsedTableRule;

  const colInsertsResult = colInserts.map((ci) => ({
    ...ci,
    inserted: undefined as AnyObject[] | undefined,
  }));

  /** Insert referenced first and then populate root data with referenced keys */
  for (const colInsert of colInsertsResult) {
    const newLocalParams: LocalParams = {
      ...localParams,
      nestedInsert: {
        depth: (localParams?.nestedInsert?.depth ?? 0) + 1,
        previousData: rootData,
        previousTable: this.name,
        referencingColumn: colInsert.insertedFieldName,
      },
    };
    const colRows = await referencedInsert(
      tableHandler,
      dbTX,
      newLocalParams,
      colInsert.tableName,
      row[colInsert.insertedFieldName] as AnyObject | AnyObject[],
      rootOnConflict,
    );
    const [colRow, ...otherColRows] = colRows;
    if (!Array.isArray(colRows) || !colRow || otherColRows.length) {
      const someFcolsAreNullOrUndefined =
        colRow && colInsert.insertedFieldRef.fcols.some((fcol) => colRow[fcol] === undefined);
      throw new Error(
        [
          "Could not do nested column insert: ",
          someFcolsAreNullOrUndefined ?
            "Some fcols values are undefined"
          : "Unexpected return " + JSON.stringify(colRows),
        ].join("\n"),
      );
    }
    colInsert.inserted = colRows;

    colInsert.insertedFieldRef.fcols.map((fcol, idx) => {
      const col = colInsert.insertedFieldRef.cols[idx];
      if (!col) throw "Invalid column name for colInsert.insertedFieldRef.cols";
      const foreignKey = colRow[fcol] as string | number;
      rootData[col] = foreignKey;
    });
  }

  const fullRootResult = await tableHandler.insert(
    rootData,
    { returning: "*", onConflict: insertParams?.onConflict },
    undefined,
    /** Remove requiredNestedInserts check before doing the actual insert */
    tableRules?.insert?.requiredNestedInserts ?
      {
        ...tableRules,
        insert: {
          ...tableRules.insert,
          requiredNestedInserts: tableRules.insert.requiredNestedInserts.filter(
            ({ ftable }) => !extraKeys.includes(ftable),
          ),
        },
      }
    : tableRules,
    localParams,
    preparedUpsertRow && [preparedUpsertRow],
  );
  let returnData: AnyObject | undefined;
  const returning = insertParams?.returning;
  if (returning) {
    returnData = {};
    const returningItems = await this.prepareReturning(
      returning,
      this.parseFieldFilter(tableRules?.insert?.returningFields),
    );
    returningItems
      .filter((s) => s.selected)
      .map((rs) => {
        const colInsertResult = colInsertsResult.find(
          ({ insertedFieldName }) => insertedFieldName === rs.columnName,
        );
        const inserted =
          colInsertResult?.singleInsert ? colInsertResult.inserted?.[0] : colInsertResult?.inserted;
        returnData![rs.alias] = inserted ?? fullRootResult[rs.alias];
      });
  }

  for (const targetTable of extraKeys) {
    const childDataItems = (
      Array.isArray(row[targetTable]) ?
        row[targetTable]
      : [row[targetTable]]) as AnyObject[];

    /** check */
    if (childDataItems.some((childData) => !isObject(childData))) {
      throw "Expected array of objects";
    }

    const childInsert = async (childData: AnyObject | AnyObject[], tableName: string) => {
      return referencedInsert(this, dbTX, localParams, tableName, childData, rootOnConflict);
    };

    const joinPath = getJoinPath(this, targetTable);

    const { path } = joinPath;
    const [rootTableName, referencingTableName, indirectTargetTableName] = path;
    targetTableRules = await getInsertTableRules(
      this,
      targetTable,
      localParams?.clientReq,
      localParams?.scope,
    );

    const referencingTableColumns =
      this.dboBuilder.dboMap.get(referencingTableName!)?.columns || [];
    if (!this.dboBuilder.dboMap.get(referencingTableName!))
      throw "Invalid/disallowed table: " + referencingTableName;
    const columnsReferencingRoot = referencingTableColumns.filter((column) =>
      column.references?.some(
        (reference) => reference.cols.length === 1 && reference.ftable === rootTableName,
      ),
    );

    if (!path.length) {
      throw "Nested inserts join path not found for " + [this.name, targetTable].join(", ");
    } else if (path.length === 2) {
      if (targetTable !== referencingTableName) throw "Did not expect this";

      if (!columnsReferencingRoot.length) {
        throw `Target table ${referencingTableName} does not reference any columns from the root table ${this.name}. Cannot insert nested data`;
      }

      const { allowedNestedInserts } = targetTableRules.insert ?? {};
      const referencingColumn = columnsReferencingRoot.find(
        ({ name }) =>
          !allowedNestedInserts ||
          allowedNestedInserts.some(({ table, column }) => table === this.name && column === name),
      );
      insertedChildren = await referencedInsert(
        this,
        dbTX,
        {
          ...localParams,
          nestedInsert: {
            depth: (localParams?.nestedInsert?.depth ?? 0) + 1,
            previousData: fullRootResult,
            previousTable: this.name,
            referencingColumn: referencingColumn?.name,
          },
        },
        targetTable,
        childDataItems.map((childData) => {
          const childRow = { ...childData };
          columnsReferencingRoot.map((column) => {
            childRow[column.references![0]!.cols[0]!] =
              fullRootResult[column.references![0]!.fcols[0]!];
          });
          return childRow;
        }),
        rootOnConflict,
      );
    } else if (path.length === 3) {
      if (targetTable !== indirectTargetTableName) throw "Did not expect this";
      const columnsReferencingTarget = referencingTableColumns.filter((column) =>
        column.references?.some(
          (reference) =>
            reference.cols.length === 1 && reference.ftable === indirectTargetTableName,
        ),
      );
      if (!columnsReferencingRoot.length || !columnsReferencingTarget.length)
        throw "Incorrectly referenced or missing columns for nested insert";

      const fileTable = this.dboBuilder.prostgles.opts.fileTable?.tableName;
      if (targetTable !== fileTable) {
        throw "Only media allowed to have nested inserts more than 2 tables apart";
      }

      /* We expect the linking table to have only 2 columns (media_id and foreign_id) */
      if (!(
        referencingTableColumns.filter((column) => column.references?.[0]?.ftable === fileTable)
          .length === 1 &&
        referencingTableColumns.filter(
          (column) => column.references?.[0]?.ftable === tableHandler.name,
        ).length === 1
      )) {
        throw (
          "Second joining table (" +
          referencingTableName +
          ")  not of expected format. Must contain exactly one reference column for each table (file table and target table)  "
        );
      }

      insertedChildren = await childInsert(childDataItems, targetTable);

      /* Insert in key_lookup table */
      for (const insertedFile of insertedChildren) {
        const linkingRow: AnyObject = {};

        columnsReferencingTarget.map((column) => {
          linkingRow[column.name] = insertedFile[column.references![0]!.fcols[0]!];
        });
        columnsReferencingRoot.map((column) => {
          linkingRow[column.name] = fullRootResult[column.references![0]!.fcols[0]!];
        });

        await childInsert(linkingRow, referencingTableName!);
      }
    } else {
      console.error(JSON.stringify({ path, thisTable: this.name, targetTable }, null, 2));
      throw "Unexpected path for Nested inserts";
    }

    /* Return also the nested inserted data */
    if (insertedChildren.length && returning) {
      const targetTableHandler = dbTX[targetTable] as TableHandler;
      const targetReturning = await targetTableHandler.prepareReturning(
        "*",
        targetTableHandler.parseFieldFilter(targetTableRules.insert?.returningFields),
      );
      const clientTargetInserts = insertedChildren.map((insertedChild) => {
        const childRow = { ...insertedChild };
        const returnedChild: AnyObject = {};
        targetReturning.map((returningItem) => {
          returnedChild[returningItem.alias] = childRow[returningItem.alias];
        });
        return returnedChild;
      });

      returnData![targetTable] =
        clientTargetInserts.length === 1 ? clientTargetInserts[0] : clientTargetInserts;
    }
  }

  return returnData;
}

const getJoinPath = (
  tableHandler: TableHandler,
  targetTable: string,
): {
  t1: string;
  t2: string;
  path: string[];
} => {
  const jp = tableHandler.dboBuilder.getShortestJoinPath(tableHandler, targetTable);
  if (!jp) {
    const pref =
      tableHandler.dboBuilder.prostgles.opts.joins !== "inferred" ? "Joins are not inferred! " : "";
    throw new Error(
      `${pref}Could not find a single join path for the nested data ( sourceTable: ${tableHandler.name} targetTable: ${targetTable} ) `,
    );
  }
  return jp;
};

const referencedInsert = async (
  tableHandler: TableHandler,
  dbTX: TableHandlers | undefined,
  localParams: LocalParams | undefined,
  targetTable: string,
  targetData: AnyObject | AnyObject[],
  onConflict: Extract<InsertParams["onConflict"], string> | undefined,
): Promise<AnyObject[]> => {
  getJoinPath(tableHandler, targetTable);

  if (!dbTX?.[targetTable] || !("insert" in dbTX[targetTable])) {
    throw new Error("childInsertErr: Table handler missing for referenced table: " + targetTable);
  }

  const childRules = await getInsertTableRules(
    tableHandler,
    targetTable,
    localParams?.clientReq,
    localParams?.scope,
  );

  const results: AnyObject[] = [];
  for (const dataItem of (Array.isArray(targetData) ? targetData : [targetData]) as AnyObject[]) {
    const result = await dbTX[targetTable]
      .insert(dataItem, { returning: "*", onConflict }, undefined, childRules, localParams)
      .catch((e) => {
        return Promise.reject(e);
      });
    results.push(result);
  }
  return results;
};
