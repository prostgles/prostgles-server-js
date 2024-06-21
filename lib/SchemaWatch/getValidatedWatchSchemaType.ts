import type { DboBuilder } from "../DboBuilder/DboBuilder";
import { OnSchemaChangeCallback } from "./SchemaWatch";

export type ValidatedWatchSchemaType = 
| { watchType: "NONE" }
| { watchType: "DDL_trigger"; onChange?: OnSchemaChangeCallback; }
| { watchType: "prostgles_queries"; onChange?: OnSchemaChangeCallback; isFallbackFromDDL: boolean; }

export const getValidatedWatchSchemaType = (dboBuilder: DboBuilder): ValidatedWatchSchemaType => {
  const {watchSchema, watchSchemaType, tsGeneratedTypesDir, disableRealtime } = dboBuilder.prostgles.opts;
  if(!watchSchema) return { watchType: "NONE" };
  
  if (watchSchema === "hotReloadMode" && !tsGeneratedTypesDir) {
    throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
  }

  const onChange = typeof watchSchema === "function"? watchSchema : undefined;

  if(watchSchemaType === "DDL_trigger" || !watchSchemaType){
    if(!dboBuilder.prostgles.isSuperUser || disableRealtime){

      if(watchSchemaType === "DDL_trigger"){
        console.error(`watchSchemaType "DDL_trigger" cannot be used because db user is not a superuser. Will fallback to watchSchemaType "prostgles_queries" `)
      } else {
        console.warn(`watchSchema fallback to watchSchemaType "prostgles_queries" due to ${disableRealtime? "disableRealtime setting" : "non-superuser"}`)
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
