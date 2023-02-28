import { isObject } from "prostgles-types";
import { DboBuilder } from "./DboBuilder";
import { ProstglesInitOptions } from "./Prostgles";
export type VoidFunction = () => void;

export class SchemaWatch {
  schema_checkIntervalMillis?: NodeJS.Timeout;
  loaded = false;

  constructor({ watchSchema, watchSchemaType, tsGeneratedTypesDir, currDbuilder, onSchemaChanged }: ProstglesInitOptions & { currDbuilder: DboBuilder; onSchemaChanged: VoidFunction }){
    if(!watchSchema) return;

    if (watchSchema === "hotReloadMode" && !tsGeneratedTypesDir) {
      throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";

    } else if (
      isObject(watchSchemaType) &&
      "checkIntervalMillis" in watchSchemaType &&
      typeof watchSchemaType.checkIntervalMillis === "number"
    ) {

      if (this.schema_checkIntervalMillis) {
        clearInterval(this.schema_checkIntervalMillis);
      }
      this.schema_checkIntervalMillis = setInterval(async () => {
        if(!this.loaded) return;
        const dbuilder = await DboBuilder.create(this as any);
        if (dbuilder.tsTypesDefinition !== currDbuilder.tsTypesDefinition) {
          onSchemaChanged();
        }
      }, watchSchemaType.checkIntervalMillis);

    } else if(watchSchemaType === "DDL_trigger"){
      /** Do nothing */
    }

  }
  

}