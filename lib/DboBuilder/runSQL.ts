import { PG_COLUMN_UDT_DATA_TYPE, SQLHandler, SQLOptions, SQLResult } from "prostgles-types";
import { DboBuilder, LocalParams, pgp, postgresToTsType } from "../DboBuilder";
import { DB, Prostgles } from "../Prostgles";
import { PubSubManager } from "../PubSubManager";
const { ParameterizedQuery: PQ } = require('pg-promise');

let DATA_TYPES: {oid: string, typname: PG_COLUMN_UDT_DATA_TYPE }[] | undefined;
let USER_TABLES: { relid: string; relname: string; }[] | undefined;

export async function runSQL(this: DboBuilder, query: string, params: any, options: SQLOptions | undefined, localParams?: LocalParams){

      /** Cache types */
      DATA_TYPES ??= await this.db.any("SELECT oid, typname FROM pg_type") ?? [];
      USER_TABLES ??= await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables") ?? [];

      if(!(await canRunSQL(this.prostgles, localParams))) throw "Not allowed to run SQL";

      const { returnType, allowListen }: SQLOptions = options || ({} as any);
      const { socket } = localParams || {};

      const db = localParams?.tx?.t || this.db;
      if(returnType === "noticeSubscription"){
          if(!socket) throw "Only allowed with client socket"
          return await this.prostgles.dbEventsManager?.addNotice(socket);
      } else if(returnType === "statement"){
          try {
              return pgp.as.format(query, params);
          } catch (err){
              throw (err as any).toString();
          }
      } else if(db) {

          let finalQuery = query + "";
          if(returnType === "arrayMode" && !["listen ", "notify "].find(c => query.toLowerCase().trim().startsWith(c))){
              finalQuery = new PQ({ text: pgp.as.format(query, params), rowMode: "array" });
          }

          let _qres = await db.result(finalQuery, params)
          const { fields, rows, command } = _qres;

          /**
           * Fallback for watchSchema in case not superuser and cannot add db event listener
           */
          const { watchSchema, watchSchemaType } = this.prostgles?.opts || {};

          if(
              watchSchema &&
              (!this.prostgles.isSuperUser || watchSchemaType === "prostgles_queries")
          ){
              if(["CREATE", "ALTER", "DROP"].includes(command)){
                  this.prostgles.onSchemaChange({ command, query })
              } else if(query) {
                  const cleanedQuery = query.toLowerCase().replace(/\s\s+/g, ' ');
                  if(PubSubManager.SCHEMA_ALTERING_QUERIES.some(q => cleanedQuery.includes(q.toLowerCase()))){
                      this.prostgles.onSchemaChange({ command, query })
                  }
              }
          }

          if(command === "LISTEN"){
              if(!allowListen) throw new Error(`Your query contains a LISTEN command. Set { allowListen: true } to get subscription hooks. Or ignore this message`)
              if(!socket) throw "Only allowed with client socket"
              return await this.prostgles.dbEventsManager?.addNotify(query, socket);

          } else if(returnType === "rows") {
              return rows;
              
          } else if(returnType === "row") {
              return rows[0];
              
          } else if(returnType === "value") {
              return Object.values(rows?.[0] || {})?.[0];
              
          } else if(returnType === "values") {
              return rows.map(r => Object.values(r[0]));
              
          } else {

              let qres: SQLResult<typeof returnType> = {
                  duration: 0,
                  ..._qres,
                  fields: fields?.map(f => {
                      const dataType = DATA_TYPES!.find(dt => +dt.oid === +f.dataTypeID)?.typname ?? "text",
                          tableName = USER_TABLES!.find(t => +t.relid === +f.tableID),
                          tsDataType = postgresToTsType(dataType);

                      return {
                          ...f,
                          tsDataType,
                          dataType,
                          udt_name: dataType,
                          tableName: tableName?.relname
                      }
                  }) ?? []
              };
              return qres;
          }
          
      } else console.error("db missing");
}

export const canRunSQL = async (prostgles: Prostgles, localParams?: LocalParams): Promise<boolean> => {
  if(!localParams?.socket || !localParams?.httpReq) return true;

  const { socket } = localParams;
  const publishParams = await prostgles.publishParser!.getPublishParams({ socket });
  let res = await prostgles.opts.publishRawSQL?.(publishParams);
  return Boolean(res && typeof res === "boolean" || res === "*");
}

export const canCreateTables = async(db: DB): Promise<boolean> => {
    return db.any(`SELECT has_database_privilege(current_database(), 'create') as yes`).then(rows => rows?.[0].yes === true)
} 