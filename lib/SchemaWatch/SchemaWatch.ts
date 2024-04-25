import type { DboBuilder } from "../DboBuilder/DboBuilder";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import { OnSchemaChangeCallback } from "../Prostgles";
import { PubSubManager, log } from "../PubSubManager/PubSubManager";
import { ValidatedWatchSchemaType, getValidatedWatchSchemaType } from "./getValidatedWatchSchemaType";

export type VoidFunction = () => void;

export class SchemaWatch {

  dboBuilder: DboBuilder;
  type: ValidatedWatchSchemaType;
  private constructor(dboBuilder: DboBuilder){
    this.dboBuilder = dboBuilder;
    this.type = getValidatedWatchSchemaType(dboBuilder);
    if(this.type.watchType === "NONE") {
      this.onSchemaChange = undefined;
    }
  }

  static create = async (dboBuilder: DboBuilder) => {
    const instance = new SchemaWatch(dboBuilder);
    if(instance.type.watchType === "DDL_trigger") {
      await dboBuilder.getPubSubManager()
    }
    return instance;
  }

  /**
   * Fallback for watchSchema in case of not a superuser (cannot add db event listener)
   */
  onSchemaChangeFallback: OnSchemaChangeCallback = async ({ command, query }) => {
    if(
      this.type.watchType !== "prostgles_queries" || 
      !this.onSchemaChange || 
      !EVENT_TRIGGER_TAGS.includes(command as any)
    ) return;

    this.onSchemaChange({ command, query })
  }
  
  onSchemaChange: OnSchemaChangeCallback | undefined = async (event) => {
    if(this.type.watchType === "NONE") return;
    
    const { watchSchema, onReady, tsGeneratedTypesDir } = this.dboBuilder.prostgles.opts;
    if (watchSchema && this.dboBuilder.prostgles.loaded) {
      log("Schema changed");
      const { query, command } = event;
      if (typeof query === "string" && query.includes(PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID)) {
        log("Schema change event excluded from triggers due to EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID");
        return;
      }

      if (typeof watchSchema === "function") {
        /* Only call the provided func */
        watchSchema(event);

      } else if (watchSchema === "hotReloadMode") {
        if (tsGeneratedTypesDir) {
          /* Hot reload integration. Will only touch tsGeneratedTypesDir */
          console.log("watchSchema: Re-writing TS schema");

          await this.dboBuilder.prostgles.refreshDBO();
          this.dboBuilder.prostgles.writeDBSchema(true);
        }

      } else if (watchSchema) {
        /* Full re-init. Sockets must reconnect */
        console.log("watchSchema: Full re-initialisation", { query })
        this.dboBuilder.prostgles.init(onReady as any, { type: "schema change", query, command });
      }
    }
  };
}