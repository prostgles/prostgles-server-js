import type { DboBuilder } from "./DboBuilder/DboBuilder";
import { EVENT_TRIGGER_TAGS } from "./Event_Trigger_Tags";
import { OnSchemaChangeCallback, ProstglesInitOptions } from "./Prostgles";
import { getKeys, isObject } from "prostgles-types";
import { PubSubManager, log } from "./PubSubManager/PubSubManager";

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

type ValidatedWatchSchemaType = 
| { watchType: "NONE" }
| { watchType: "DDL_trigger"; onChange?: OnSchemaChangeCallback; }
| { watchType: "prostgles_queries"; onChange?: OnSchemaChangeCallback; isFallbackFromDDL: boolean; }

const getValidatedWatchSchemaType = (dboBuilder: DboBuilder): ValidatedWatchSchemaType => {
  const {watchSchema, watchSchemaType, tsGeneratedTypesDir} = dboBuilder.prostgles.opts;
  if(!watchSchema) return { watchType: "NONE" };
  
  if (watchSchema === "hotReloadMode" && !tsGeneratedTypesDir) {
    throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
  }

  const onChange = typeof watchSchema === "function"? watchSchema : undefined;

  if(watchSchemaType === "DDL_trigger" || !watchSchemaType){
    if(!dboBuilder.prostgles.isSuperUser){

      if(watchSchemaType === "DDL_trigger"){
        console.error(`watchSchemaType "DDL_trigger" cannot be used because db user is not a superuser. Will fallback to watchSchemaType "prostgles_queries" `)
      } else {
        console.warn(`watchSchema fallback to watchSchemaType "prostgles_queries" due to non-superuser`)
      }
      return {
        watchType: "prostgles_queries",
        onChange,
        isFallbackFromDDL: true
      }
    }

    return {
      watchType: "DDL_trigger",
      onChange
    };
  }
  
  return {
    watchType: watchSchemaType,
    isFallbackFromDDL: false,
    onChange
  }
}

export const getWatchSchemaTagList = (watchSchema: ProstglesInitOptions["watchSchema"]) => {
  if(!watchSchema) return undefined;

  if(watchSchema === "*"){
    return EVENT_TRIGGER_TAGS.slice(0);
  } 
  if (isObject(watchSchema) && typeof watchSchema !== "function"){
    const watchSchemaKeys = getKeys(watchSchema);
    const isInclusive = Object.values(watchSchema).every(v => v);
    return EVENT_TRIGGER_TAGS
      .slice(0)
      .filter(v => {
        const matches = watchSchemaKeys.includes(v);
        return isInclusive? matches : !matches;
      });
  }

  const coreTags: typeof EVENT_TRIGGER_TAGS[number][] = [
    'COMMENT', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 
    'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE POLICY'
  ];
  return coreTags;
}



/**
 * Fallback for watchSchema in case of not a superuser (cannot add db event listener)
 */
export const watchSchemaFallback = async function(this: DboBuilder, { queryWithoutRLS, command }: { queryWithoutRLS: string; command: string; }){
  const SCHEMA_ALTERING_COMMANDS = EVENT_TRIGGER_TAGS;// ["CREATE", "ALTER", "DROP", "REVOKE", "GRANT"];
  const isNotPickedUpByDDLTrigger = ["REVOKE", "GRANT"].includes(command);
  const { watchSchema, watchSchemaType } = this.prostgles?.opts || {};
  if (
    watchSchema &&
    (!this.prostgles.isSuperUser || watchSchemaType === "prostgles_queries" || isNotPickedUpByDDLTrigger)
  ) {
    if (SCHEMA_ALTERING_COMMANDS.includes(command as any)) {
      this.prostgles.schemaWatch?.onSchemaChange?.({ command, query: queryWithoutRLS })
    }
  }
}