import { AnyObject, asName, FieldFilter, get, getKeys, InsertParams, isDefined, isObject, PG_COLUMN_UDT_DATA_TYPE } from "prostgles-types";
import { DboBuilder, isPojoObject, LocalParams, makeErr, Media, parseError, pgp, TableHandler, TableHandlers } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { omitKeys } from "../PubSubManager";
import { isFile, uploadFile } from "./uploadFile";

/**
 * Used for doing referenced inserts within a single transaction
 */
export async function insertDataParse(
  this: TableHandler, 
  data: (AnyObject | AnyObject[]), 
  param2?: InsertParams, 
  param3_unused?: undefined, 
  tableRules?: TableRule, 
  _localParams?: LocalParams
): Promise<{
  data?: AnyObject | AnyObject[];
  insertResult?: AnyObject | AnyObject[];
}> {
  const localParams = _localParams || {};
  let dbTX = localParams?.dbTX || this.dbTX;
  const MEDIA_COL_NAMES = ["data", "name"];

  const isMultiInsert = Array.isArray(data);
  const getExtraKeys = (d: AnyObject) => getKeys(d).filter(k => {
    /* If media then use file insert columns */
    if(this.is_media){
      return !this.column_names.concat(MEDIA_COL_NAMES).includes(k)
    } else if(!this.columns.find(c => c.name === k)){
      if(!isPojoObject(d[k]) && !Array.isArray(d[k])){
        throw new Error("Invalid/Dissalowed field in data: " + k)
      } else if(!this.dboBuilder.dbo[k]){
        throw new Error("Invalid/Dissalowed nested insert table name in data: " + k)
      }
      return true;
    }
    return false;
  });
  const ALLOWED_COL_TYPES: PG_COLUMN_UDT_DATA_TYPE[] = ["int2", "int4", "int8", "numeric", "uuid", "text", "varchar", "char"];
  const getColumnInserts = (d: AnyObject) => getKeys(d)
    .filter(k => d[k] && isPojoObject(d[k]))
    .map(k => {
      const insertedCol = this.columns.find(c => 
        c.name === k && 
        ALLOWED_COL_TYPES.includes(c.udt_name)
      );
      if(insertedCol && (
        insertedCol.references?.fcols.length !== 1 ||
        this.columns.some(c => 
            // c.name !== insertedCol.name && // a bit reduntant: Cannot have one col reference two columns
            c.references &&
            c.references?.ftable === insertedCol.references?.ftable && // same ftable
            c.references?.fcols[0] !== insertedCol.references?.fcols[0] // different fcols
          ) 
      )){
        throw "A reference column insert is not possible for multiple column relationships"
      }
      if(insertedCol){
        return {
          tableName: insertedCol.references!.ftable!,
          col: insertedCol.name,
          fcol: insertedCol.references!.fcols[0]!
        }
      }
      return undefined;
    }).filter(isDefined);

  
  /**
   * True when: nested table data is provided within
   *    [nestedTable] property key
   *    OR
   *    [referencing_column] property key
   * If true then will do the full insert within this function
   * Nested insert is not allowed for the file table 
   * */
  const isNestedInsert = this.is_media ? false : (isMultiInsert ? data : [data]).some(d => getExtraKeys(d).length || getColumnInserts(d).length);

  /**
   * Make sure nested insert uses a transaction
   */
  if (isNestedInsert && !dbTX) {
    return {
      insertResult: await this.dboBuilder.getTX((dbTX) =>
        (dbTX[this.name] as TableHandler).insert(
          data,
          param2,
          param3_unused,
          tableRules,
          { dbTX, ...localParams }
        )
      )
    }
  }
  // if(!dbTX && this.t) dbTX = this.d;

  const preValidate = tableRules?.insert?.preValidate,
    validate = tableRules?.insert?.validate;

  let _data = await Promise.all((isMultiInsert? data : [data]).map(async row => {
    if (preValidate) {
      row = await preValidate(row);
    }

    const extraKeys = getExtraKeys(row);
    const colInserts = getColumnInserts(row);

    /* Upload file then continue insert */
    if (this.is_media) {
      return uploadFile.bind(this)(row, validate, localParams)

      /* Potentially a nested join */
    } else if (extraKeys.length || colInserts.length) {

      /* Ensure we're using the same transaction */
      const _this = this.t ? this : dbTX![this.name] as TableHandler;

      const omitedKeys = extraKeys.concat(colInserts.map(c => c.col));

      // let rootData = isMultiInsert? data.map(d => omitKeys(d, omitedKeys)) : omitKeys(data, omitedKeys);
      let rootData: AnyObject = omitKeys(row, omitedKeys);

      let insertedChildren: AnyObject[];
      let targetTableRules: TableRule;

      /** Insert referenced first and then populate root data with referenced keys */
      if(colInserts.length){
        for await(const colInsert of colInserts){
          const newLocalParams: LocalParams = {
            ...(localParams ?? {}),
            nestedInsert: {
              depth: (localParams.nestedInsert?.depth ?? 0) + 1,
              previousData: rootData,
              previousTable: this.name,
              referencingColumn: colInsert.col
            }
          }
          const colRows = await referencedInsert(_this, dbTX, newLocalParams, colInsert.tableName, row[colInsert.col]);
          if(!Array.isArray(colRows) || colRows.length !== 1 || [null, undefined].includes(colRows[0][colInsert.fcol])){
            throw new Error("Could not do nested column insert: Unexpected return " + JSON.stringify(colRows))
          }
          
          const foreignKey = colRows[0][colInsert.fcol];
          rootData[colInsert.col] = foreignKey;
        }
      }

      const fullRootResult = await _this.insert(rootData, { returning: "*" }, undefined, tableRules, localParams);
      let returnData: AnyObject | undefined;
      const returning = param2?.returning;
      if (returning) {
        returnData = {}
        const returningItems = await this.prepareReturning(returning, this.parseFieldFilter(tableRules?.insert?.returningFields));
        returningItems.filter(s => s.selected).map(rs => {
          returnData![rs.alias] = fullRootResult[rs.alias];
        })
      }

      await Promise.all(extraKeys.map(async targetTable => {
        const childDataItems = Array.isArray(row[targetTable]) ? row[targetTable] : [row[targetTable]];

        const childInsert = async (cdata: AnyObject | AnyObject[], tableName: string) => {

          return referencedInsert(this, dbTX, localParams, tableName, cdata);
        }

        const jp = await getJoinPath(this, targetTable);

        const { path } = jp;
        const [tbl1, tbl2, tbl3] = path;
        targetTableRules = await canInsert(this, targetTable, localParams);   //  tbl3

        const cols2 = this.dboBuilder.dbo[tbl2].columns || [];
        if (!this.dboBuilder.dbo[tbl2]) throw "Invalid/disallowed table: " + tbl2;
        const colsRefT1 = cols2?.filter(c => c.references?.cols.length === 1 && c.references?.ftable === tbl1);


        if (!path.length) {
          throw "Nested inserts join path not found for " + [this.name, targetTable];
        } else if (path.length === 2) {
          if (targetTable !== tbl2) throw "Did not expect this";

          if (!colsRefT1.length) throw `Target table ${tbl2} does not reference any columns from the root table ${this.name}. Cannot do nested insert`;

          // console.log(childDataItems, JSON.stringify(colsRefT1, null, 2))
          insertedChildren = await childInsert(
            childDataItems.map((d: AnyObject) => {
              let result = { ...d };
              colsRefT1.map(col => {
                result[col.references!.cols[0]] = fullRootResult[col.references!.fcols[0]]
              })
              return result;
            }),
            targetTable
          );
          // console.log({ insertedChildren })

        } else if (path.length === 3) {
          if (targetTable !== tbl3) throw "Did not expect this";
          const colsRefT3 = cols2?.filter(c => c.references?.cols.length === 1 && c.references?.ftable === tbl3);
          if (!colsRefT1.length || !colsRefT3.length) throw "Incorrectly referenced or missing columns for nested insert";

          const fileTable = this.dboBuilder.prostgles.fileManager?.tableName;
          if (targetTable !== fileTable) {
            throw "Only media allowed to have nested inserts more than 2 tables apart"
          }

          /* We expect tbl2 to have only 2 columns (media_id and foreign_id) */
          if (!cols2 || !(
            cols2.filter(c => c.references?.ftable === fileTable).length === 1 &&
            cols2.filter(c => c.references?.ftable === _this.name).length === 1
          )){
            console.log({ tbl1, tbl2, tbl3, name: _this.name, tthisName: this.name })
            throw "Second joining table not of expected format. Must contain exactly one reference column for each table (file table and target table)  ";
          }

          insertedChildren = await childInsert(childDataItems, targetTable);

          /* Insert in key_lookup table */
          await Promise.all(insertedChildren.map(async t3Child => {
            let tbl2Row: AnyObject = {};

            colsRefT3.map(col => {
              tbl2Row[col.name] = t3Child[col.references!.fcols[0]];
            })
            colsRefT1.map(col => {
              tbl2Row[col.name] = fullRootResult[col.references!.fcols[0]];
            })
            // console.log({ rootResult, tbl2Row, t3Child, colsRefT3, colsRefT1, t: this.t?.ctx?.start });

            await childInsert(tbl2Row, tbl2);//.then(() => {});
          }));

        } else {
          console.error(JSON.stringify({ path, thisTable: this.name, targetTable }, null, 2));
          throw "Unexpected path for Nested inserts";
        }

        /* Return also the nested inserted data */
        if (targetTableRules && insertedChildren?.length && returning) {
          const targetTableHandler = dbTX![targetTable] as TableHandler;
          const targetReturning = await targetTableHandler.prepareReturning("*", targetTableHandler.parseFieldFilter(targetTableRules?.insert?.returningFields));
          let clientTargetInserts = insertedChildren.map(d => {
            let _d = { ...d };
            let res: AnyObject = {};
            targetReturning.map(r => {
              res[r.alias] = _d[r.alias]
            });
            return res;
          });

          returnData![targetTable] = clientTargetInserts.length === 1 ? clientTargetInserts[0] : clientTargetInserts;
        }
      }));

      return returnData
    }

    return row;
  }));

  let result = isMultiInsert ? _data : _data[0];
  // if(validate && !isNestedInsert){
  //     result = isMultiInsert? await Promise.all(_data.map(async d => await validate({ ...d }))) : await validate({ ..._data[0] });
  // }
  let res = isNestedInsert ?
    { insertResult: result } :
    { data: result };

  return res;
}

/* Must be allowed to insert into referenced table */
const canInsert = async (tableHandler: TableHandler, targetTable: string, localParams: LocalParams) => {
  const childRules = await tableHandler.dboBuilder.publishParser?.getValidatedRequestRuleWusr({ tableName: targetTable, command: "insert", localParams });
  if (!childRules || !childRules.insert) throw "Dissallowed nested insert into table " + childRules;
  return childRules;
}

const getJoinPath = async (tableHandler: TableHandler, targetTable: string): Promise<{
  t1: string;
  t2: string;
  path: string[];
}> => {

  const jp = tableHandler.dboBuilder.joinPaths.find(jp => jp.t1 === tableHandler.name && jp.t2 === targetTable);
  if (!jp) {
    console.trace(tableHandler.dboBuilder.joinPaths)
    const pref = tableHandler.dboBuilder.prostgles.opts.joins !== "inferred"? "Joins are not inferred! " : ""
    throw new Error(`${pref}Could not find a single join path for the nested data ( sourceTable: ${tableHandler.name} targetTable: ${targetTable} ) `);
  }
  return jp;
}

const referencedInsert = async (tableHandler: TableHandler, dbTX: TableHandlers | undefined, localParams: LocalParams, targetTable: string, targetData: AnyObject | AnyObject[]): Promise<AnyObject[]> => {


  const thisInfo = await tableHandler.getInfo();
  await getJoinPath(tableHandler, targetTable);
  
  if (!targetData || !dbTX?.[targetTable] || !("insert" in dbTX[targetTable])) throw new Error("childInsertErr: Table handler missing for referenced table: " + targetTable);

  const childRules = await canInsert(tableHandler, targetTable, localParams);

  if (thisInfo.has_media === "one" && thisInfo.media_table_name === targetTable && Array.isArray(targetData) && targetData.length > 1) {
    throw "Constraint check fail: Cannot insert more than one record into " + JSON.stringify(targetTable);
  }
  return Promise.all(
    (Array.isArray(targetData) ? targetData : [targetData])
      .map(m => (dbTX![targetTable] as TableHandler)
        .insert(m, { returning: "*" }, undefined, childRules, localParams)
        .catch(e => {
          console.trace({ childInsertErr: e })
          return Promise.reject(e);
          // return Promise.reject({ childInsertErr: e });
        })
      )
  );
    
}