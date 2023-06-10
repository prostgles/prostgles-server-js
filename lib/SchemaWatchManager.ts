// import PubSubManager from "./PubSubManager";
import { DboBuilder, isPlainObject } from "./DboBuilder";
import { Prostgles, ProstglesInitOptions } from "./Prostgles";

/**
 * Prostgles creates an internal schema object that is used in providing core functionality: handles to explore and edit data within the database
 * This schema object is created once on startup
 * To allow reloading of internal schema without a full application restart we use schema watch
 * Schema watch triggers internal schema rebuild every time the schema changes
 * There are two methods for identifying a schema change:
 *  1) Create an EVENT TRIGGER - most resilient option but requires a superuser. It fires every time an sql command of a certain type is fired. 
 *      Example sql command signatures: 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO' 
 *  2) Check SQL queries executed by this prostgles instance. This option is used as a fallback to option 1 in cases where there is no superuser
 * 
 * Some schema altering queries are executed by prostgles on startup. To prevent an infinite loop a specific 
 * piece of text (PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID) is inserted in these queries to then disregard them from schema watch
 * 
 */
export class SchemaWatchManager {

  checkInterval?: NodeJS.Timeout;
  prostgles: Prostgles;

  constructor(prgl: Prostgles){
    this.prostgles = prgl;
    if(prgl.opts.watchSchema){

      if(isPlainObject(prgl.opts.watchSchemaType) && prgl.opts.watchSchemaType.checkIntervalMillis){

        clearInterval(this.checkInterval);
        this.checkInterval = setInterval(async () => {
            const dbuilder = await DboBuilder.create(this as any);
            if(dbuilder.tsTypesDefinition !== this.prostgles.dboBuilder.tsTypesDefinition){
              this.prostgles.refreshDBO();
              this.prostgles.init(this.prostgles.opts.onReady, "schema-watch-interval");
            }
        }, prgl.opts.watchSchemaType.checkIntervalMillis)
      }
    }
  }

  // async onSchemaChange(event: { command: string; query: string }){
  //     const { watchSchema, watchSchemaType, onReady, tsGeneratedTypesDir } = this.opts as any;
  //     if(watchSchema && this.loaded){
  //         console.log("Schema changed");
  //         const { query } = event;
  //         if(typeof query === "string" && query.includes(PubSubManag.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID)){
  //             console.log("Schema change event excluded from triggers due to EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID");
  //             return;
  //         }
          
  //         if(typeof watchSchema === "function"){
  //             /* Only call the provided func */
  //             watchSchema(event);

  //         } else if(watchSchema === "hotReloadMode") {
  //             if(tsGeneratedTypesDir) {
  //                 /* Hot reload integration. Will only touch tsGeneratedTypesDir */
  //                 console.log("watchSchema: Re-writing TS schema");

  //                 await this.refreshDBO();
  //                 this.writeDBSchema(true);
  //             }

  //         } else if(watchSchema === true || isPlainObject(watchSchemaType) && "checkIntervalMillis" in watchSchemaType){
  //             /* Full re-init. Sockets must reconnect */
  //             console.log("watchSchema: Full re-initialisation")
  //             this.init(onReady);
  //         }
  //     }  
  // }
}