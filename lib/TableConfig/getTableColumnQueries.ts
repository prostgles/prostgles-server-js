import { getKeys, asName as _asName, isObject, asName } from "prostgles-types";
import { DB, DBHandlerServer } from "../Prostgles";
import { validate_jsonb_schema_sql } from "../JSONBValidation/validate_jsonb_schema_sql";
import { getColumnDefinitionQuery, getTableColumns } from "./getColumnDefinitionQuery";
import { TableConfig } from "./TableConfig"; 
import { getFutureTableSchema } from "./getFutureTableSchema";

type Args = {
  db: DB;
  tableConf: TableConfig[string];
  tableName: string;
  tableHandler: DBHandlerServer[string] | undefined;
}

export const getTableColumnQueries = async ({ db, tableConf, tableName, tableHandler }: Args): Promise<undefined | {
  columnDefs: string[];
  newColumnDefs: string[];
  fullQuery: string;
  isCreate: boolean;
}> => {

  let newColumnDefs: string[] = [];
  const droppedColNames: string[] = [];
  const alteredColQueries: string[] = [];
  let fullQuery = "";
  let isCreate = false;

  if ("columns" in tableConf && tableConf.columns) {
  
    const hasJSONBValidation = getKeys(tableConf.columns).some(c => {
      const cConf = tableConf.columns?.[c];
      return cConf && isObject(cConf) && (cConf.jsonbSchema || cConf.jsonbSchemaType)
    });

    /** Must install validation function */
    if(hasJSONBValidation){
      try {
        await db.any(validate_jsonb_schema_sql);
      } catch(err: any){
        console.error("Could not install the jsonb validation function due to error: ", err);
        throw err;
      }
    }

    const columns = getKeys(tableConf.columns).filter(c => {
      const colDef = tableConf.columns![c]!;
      /** Exclude NamedJoinColumn  */
      return typeof colDef === "string" || !("joinDef" in colDef)
    }) as string[];

    const colDefs: { name: string; def: string }[] = [];
    
    for (const colName of columns) {
      const colConf = tableConf.columns![colName]!;

      /* Get column definition */
      const colDef = await getColumnDefinitionQuery({ colConf, column: colName, db, table: tableName });
      if(colDef){
        colDefs.push({ name: colName, def: colDef});
      }
    }
    const columnDefs = colDefs.map(c => c.def);

    if(!colDefs.length){
      return undefined;
    }


    const ALTERQ = `ALTER TABLE ${asName(tableName)}`;
    if (!tableHandler) {
      newColumnDefs.push(...colDefs.map(c => c.def));

    } else if (tableHandler) {
      const currCols = await getTableColumns({ db, table: tableName });

      /** Add new columns */
      newColumnDefs = colDefs.filter(nc => !tableHandler.columns?.some(c => nc.name === c.name)).map(c => c.def);
      
      /** Altered/Dropped columns */
      const { cols: futureCols } = await getFutureTableSchema({ tableName, columnDefs, constraintDefs: [], db });
      currCols.forEach(c => {
        const newCol = futureCols.find(nc => nc.column_name === c.column_name);
        if(!newCol){
          droppedColNames.push(c.column_name);
        } else if(newCol.nullable !== c.nullable){
          alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${asName(c.column_name)} ${newCol.nullable? "SET" : "DROP"} NOT NULL;`)
        } else if(newCol.udt_name !== c.udt_name){
          alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${asName(c.column_name)} TYPE ${newCol.udt_name} USING ${asName(c.column_name)}::${newCol.udt_name};`)
        } else if(newCol.column_default !== c.column_default){
          const colConfig = colDefs.find(cd => cd.name === c.column_name);
          if(["serial", "bigserial"].some(t => colConfig?.def.toLowerCase().includes(` ${t}`)) && c.column_default?.toLowerCase().includes("nextval")){
            /** Ignore SERIAL/BIGSERIAL <> nextval mismatch */
          } else {
            alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${asName(c.column_name)} ${newCol.column_default === null? "DROP DEFAULT" : `SET DEFAULT ${newCol.column_default}`};`)
          }
        }
      });
    }

    if (!tableHandler || tableConf.dropIfExists || tableConf.dropIfExistsCascade) {
      isCreate = true;
      const DROPQ = `DROP TABLE IF EXISTS ${asName(tableName)}`;
      fullQuery = ([
        ...(tableConf.dropIfExists? [`${DROPQ};`] : tableConf.dropIfExistsCascade? [`${DROPQ} CASCADE;`] : []),
        `CREATE TABLE ${asName(tableName)} (`,
          columnDefs.join(", \n"),
        `);`
      ].join("\n"));

    } else {
      fullQuery = [
        ...droppedColNames.map(c => `${ALTERQ} DROP COLUMN ${asName(c)};`),
        ...newColumnDefs.map(c => `${ALTERQ} ADD COLUMN ${c};`),
        ...alteredColQueries,
      ].join("\n");
    }

    return {
      fullQuery,
      columnDefs,
      isCreate,
      newColumnDefs,
    }
  } else {
    return undefined;
  }


}