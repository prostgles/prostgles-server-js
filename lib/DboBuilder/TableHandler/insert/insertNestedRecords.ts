import {
  AnyObject,
  getKeys,
  getPossibleNestedInsert,
  InsertParams,
  isDefined,
  isObject,
  type ColumnInfo,
} from "prostgles-types";
import { LocalParams, TableHandlers } from "../../DboBuilder";
import { ParsedTableRule } from "../../../PublishParser/PublishParser";
import { omitKeys } from "../../../PubSubManager/PubSubManager";
import { TableHandler } from "../TableHandler";
import { AuthClientRequest } from "../../../Auth/AuthTypes";

type InsertNestedRecordsArgs = {
  data: AnyObject | AnyObject[];
  param2?: InsertParams;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
};

/**
 * Referenced inserts within a single transaction
 */
export async function insertNestedRecords(
  this: TableHandler,
  { data, param2, tableRules, localParams }: InsertNestedRecordsArgs
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
        if (!isObject(row[fieldName]) && !Array.isArray(row[fieldName])) {
          throw new Error("Invalid/Dissalowed field in data: " + fieldName);
        } else if (!this.dboBuilder.dbo[fieldName]) {
          return false;
          // throw new Error("Invalid/Dissalowed nested insert table name in data: " + fieldName)
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
  const hasNestedInserts =
    this.is_media ? false : (
      insertedRows.some((d) => getExtraKeys(d).length || getReferenceColumnInserts(this, d).length)
    );

  /**
   * Make sure nested insert uses a transaction
   */
  const dbTX = this.getFinalDBtx(localParams);
  const t = localParams?.tx?.t || this.tx?.t;
  if (hasNestedInserts && (!dbTX || !t)) {
    return {
      insertResult: await this.dboBuilder.getTX((dbTX, _t) =>
        (dbTX[this.name] as TableHandler).insert(data, param2, undefined, tableRules, {
          tx: { dbTX, t: _t },
          ...localParams,
        })
      ),
    };
  }

  const _data = await Promise.all(
    insertedRows.map(async (row) => {
      // const { preValidate, validate } = tableRules?.insert ?? {};
      // const { tableConfigurator } = this.dboBuilder.prostgles;
      // if(!tableConfigurator) throw "tableConfigurator missing";
      // let row = await tableConfigurator.getPreInsertRow(this, { dbx: this.getFinalDbo(localParams), validate, localParams, row: _row })
      // if (preValidate) {
      //   row = await preValidate({ row, dbx: this.tx?.dbTX || this.dboBuilder.dbo, localParams });
      // }

      /* Potentially a nested join */
      if (hasNestedInserts) {
        const extraKeys = getExtraKeys(row);
        const colInserts = getReferenceColumnInserts(this, row);

        /* Ensure we're using the same transaction */
        const _this = this.tx ? this : (dbTX![this.name] as TableHandler);

        const omitedKeys = extraKeys.concat(colInserts.map((c) => c.insertedFieldName));

        const rootData: AnyObject = omitKeys(row, omitedKeys);

        let insertedChildren: AnyObject[];
        let targetTableRules: ParsedTableRule;

        const colInsertsResult = colInserts.map((ci) => ({
          ...ci,
          inserted: undefined as AnyObject[] | undefined,
        }));

        /** Insert referenced first and then populate root data with referenced keys */
        if (colInserts.length) {
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
              _this,
              dbTX,
              newLocalParams,
              colInsert.tableName,
              row[colInsert.insertedFieldName] as AnyObject | AnyObject[]
            );
            const [colRow, ...otherColRows] = colRows;
            if (!Array.isArray(colRows) || !colRow || otherColRows.length) {
              const someFcolsAreNullOrUndefined =
                colRow &&
                colInsert.insertedFieldRef.fcols.some((fcol) => colRow[fcol] === undefined);
              throw new Error(
                [
                  "Could not do nested column insert: ",
                  someFcolsAreNullOrUndefined ?
                    "Some fcols values are undefined"
                  : "Unexpected return " + JSON.stringify(colRows),
                ].join("\n")
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
        }

        const fullRootResult = (await _this.insert(
          rootData,
          { returning: "*" },
          undefined,
          /** Remove requiredNestedInserts check before doing the actual insert */
          tableRules?.insert?.requiredNestedInserts ?
            {
              ...tableRules,
              insert: {
                ...tableRules.insert,
                requiredNestedInserts: tableRules.insert.requiredNestedInserts.filter(
                  ({ ftable }) => !extraKeys.includes(ftable)
                ),
              },
            }
          : tableRules,
          localParams
        )) as AnyObject;
        let returnData: AnyObject | undefined;
        const returning = param2?.returning;
        if (returning) {
          returnData = {};
          const returningItems = await this.prepareReturning(
            returning,
            this.parseFieldFilter(tableRules?.insert?.returningFields)
          );
          returningItems
            .filter((s) => s.selected)
            .map((rs) => {
              const colInsertResult = colInsertsResult.find(
                ({ insertedFieldName }) => insertedFieldName === rs.columnName
              );
              const inserted =
                colInsertResult?.singleInsert ?
                  colInsertResult.inserted?.[0]
                : colInsertResult?.inserted;
              returnData![rs.alias] = inserted ?? fullRootResult[rs.alias];
            });
        }

        await Promise.all(
          extraKeys.map(async (targetTable) => {
            const childDataItems = (
              Array.isArray(row[targetTable]) ?
                row[targetTable]
              : [row[targetTable]]) as AnyObject[];

            /** check */
            if (childDataItems.some((d) => !isObject(d))) {
              throw "Expected array of objects";
            }

            const childInsert = async (cdata: AnyObject | AnyObject[], tableName: string) => {
              return referencedInsert(this, dbTX, localParams, tableName, cdata);
            };

            const joinPath = getJoinPath(this, targetTable);

            const { path } = joinPath;
            const [tbl1, tbl2, tbl3] = path;
            targetTableRules = await getInsertTableRules(this, targetTable, localParams?.clientReq);

            const cols2 = this.dboBuilder.dbo[tbl2!]!.columns || [];
            if (!this.dboBuilder.dbo[tbl2!]) throw "Invalid/disallowed table: " + tbl2;
            const colsRefT1 = cols2.filter((c) =>
              c.references?.some((rc) => rc.cols.length === 1 && rc.ftable === tbl1)
            );

            if (!path.length) {
              throw "Nested inserts join path not found for " + [this.name, targetTable].join(", ");
            } else if (path.length === 2) {
              if (targetTable !== tbl2) throw "Did not expect this";

              if (!colsRefT1.length) {
                throw `Target table ${tbl2} does not reference any columns from the root table ${this.name}. Cannot insert nested data`;
              }

              insertedChildren = await childInsert(
                childDataItems.map((d: AnyObject) => {
                  const result = { ...d };
                  colsRefT1.map((col) => {
                    result[col.references![0]!.cols[0]!] =
                      fullRootResult[col.references![0]!.fcols[0]!];
                  });
                  return result;
                }),
                targetTable
              );
            } else if (path.length === 3) {
              if (targetTable !== tbl3) throw "Did not expect this";
              const colsRefT3 = cols2.filter((c) =>
                c.references?.some((rc) => rc.cols.length === 1 && rc.ftable === tbl3)
              );
              if (!colsRefT1.length || !colsRefT3.length)
                throw "Incorrectly referenced or missing columns for nested insert";

              const fileTable = this.dboBuilder.prostgles.fileManager?.tableName;
              if (targetTable !== fileTable) {
                throw "Only media allowed to have nested inserts more than 2 tables apart";
              }

              /* We expect tbl2 to have only 2 columns (media_id and foreign_id) */
              if (
                !(
                  cols2.filter((c) => c.references?.[0]?.ftable === fileTable).length === 1 &&
                  cols2.filter((c) => c.references?.[0]?.ftable === _this.name).length === 1
                )
              ) {
                console.log({
                  tbl1,
                  tbl2,
                  tbl3,
                  name: _this.name,
                  tthisName: this.name,
                });
                throw (
                  "Second joining table (" +
                  tbl2 +
                  ")  not of expected format. Must contain exactly one reference column for each table (file table and target table)  "
                );
              }

              insertedChildren = await childInsert(childDataItems, targetTable);

              /* Insert in key_lookup table */
              await Promise.all(
                insertedChildren.map(async (t3Child) => {
                  const tbl2Row: AnyObject = {};

                  colsRefT3.map((col) => {
                    tbl2Row[col.name] = t3Child[col.references![0]!.fcols[0]!];
                  });
                  colsRefT1.map((col) => {
                    tbl2Row[col.name] = fullRootResult[col.references![0]!.fcols[0]!];
                  });

                  await childInsert(tbl2Row, tbl2!); //.then(() => {});
                })
              );
            } else {
              console.error(JSON.stringify({ path, thisTable: this.name, targetTable }, null, 2));
              throw "Unexpected path for Nested inserts";
            }

            /* Return also the nested inserted data */
            if (insertedChildren.length && returning) {
              const targetTableHandler = dbTX![targetTable] as TableHandler;
              const targetReturning = await targetTableHandler.prepareReturning(
                "*",
                targetTableHandler.parseFieldFilter(targetTableRules.insert?.returningFields)
              );
              const clientTargetInserts = insertedChildren.map((d) => {
                const _d = { ...d };
                const res: AnyObject = {};
                targetReturning.map((r) => {
                  res[r.alias] = _d[r.alias];
                });
                return res;
              });

              returnData![targetTable] =
                clientTargetInserts.length === 1 ? clientTargetInserts[0] : clientTargetInserts;
            }
          })
        );

        return returnData;
      }

      return row;
    })
  );

  const result = isMultiInsert ? _data : _data[0];
  const res = hasNestedInserts ? { insertResult: result } : { data: result };

  return res;
}

/* Must be allowed to insert into referenced table */
export const getInsertTableRules = async (
  tableHandler: TableHandler,
  targetTable: string,
  clientReq: AuthClientRequest | undefined
) => {
  const childRules = await tableHandler.dboBuilder.publishParser?.getValidatedRequestRuleWusr({
    tableName: targetTable,
    command: "insert",
    clientReq,
  });
  if (!childRules || !childRules.insert)
    throw "Dissallowed nested insert into table " + targetTable;
  return childRules;
};

const getJoinPath = (
  tableHandler: TableHandler,
  targetTable: string
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
      `${pref}Could not find a single join path for the nested data ( sourceTable: ${tableHandler.name} targetTable: ${targetTable} ) `
    );
  }
  return jp;
};

const referencedInsert = async (
  tableHandler: TableHandler,
  dbTX: TableHandlers | undefined,
  localParams: LocalParams | undefined,
  targetTable: string,
  targetData: AnyObject | AnyObject[]
): Promise<AnyObject[]> => {
  getJoinPath(tableHandler, targetTable);

  if (!dbTX?.[targetTable] || !("insert" in dbTX[targetTable]!)) {
    throw new Error("childInsertErr: Table handler missing for referenced table: " + targetTable);
  }

  const childRules = await getInsertTableRules(tableHandler, targetTable, localParams?.clientReq);

  return Promise.all(
    ((Array.isArray(targetData) ? targetData : [targetData]) as AnyObject[]).map((m) =>
      (dbTX[targetTable] as TableHandler)
        .insert(m, { returning: "*" }, undefined, childRules, localParams)
        .catch((e) => {
          return Promise.reject(e);
        })
    )
  ) as Promise<AnyObject[]>;
};

type ReferenceColumnInsert<ExpectSingleInsert> = {
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
  expectSingleInsert?: ExpectSingleInsert
): ReferenceColumnInsert<ExpectSingleInsert>[] => {
  return Object.entries(parentRow)
    .map(([insertedFieldName, insertedFieldValue]) => {
      if (insertedFieldValue && isObject(insertedFieldValue)) {
        const insertedRefCol = tableHandler.columns.find(
          (c) => c.name === insertedFieldName && c.references?.length
        );
        if (!insertedRefCol) return undefined;
        const insertedFieldRef = getPossibleNestedInsert(
          insertedRefCol,
          tableHandler.dboBuilder.tablesOrViews ?? [],
          false
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
