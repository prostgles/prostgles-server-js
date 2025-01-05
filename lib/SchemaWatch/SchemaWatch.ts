import type { DboBuilder } from "../DboBuilder/DboBuilder";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import { PubSubManager, log } from "../PubSubManager/PubSubManager";
import {
  ValidatedWatchSchemaType,
  getValidatedWatchSchemaType,
} from "./getValidatedWatchSchemaType";
const COMMAND_FIRST_KEYWORDS = EVENT_TRIGGER_TAGS.map((tag) => tag.split(" ")[0]!).filter(
  (tag) => tag !== "SELECT"
); /** SELECT INTO is not easily detectable with pg-node (command = "SELECT")  */

const DB_FALLBACK_COMMANDS = Array.from(new Set(COMMAND_FIRST_KEYWORDS)).concat([
  "DO", // Do statement
  "COMMIT", // Transaction block
]);

export type VoidFunction = () => void;

export type OnSchemaChangeCallback = (event: { command: string; query: string }) => void;

export class SchemaWatch {
  dboBuilder: DboBuilder;
  type: ValidatedWatchSchemaType;
  private constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;
    this.type = getValidatedWatchSchemaType(dboBuilder);
    if (this.type.watchType === "NONE") {
      this.onSchemaChange = undefined;
      this.onSchemaChangeFallback = undefined;
    }
    if (this.type.watchType === "DDL_trigger") {
      this.onSchemaChangeFallback = undefined;
    }
  }

  static create = async (dboBuilder: DboBuilder) => {
    const instance = new SchemaWatch(dboBuilder);
    if (instance.type.watchType === "DDL_trigger") {
      await dboBuilder.getPubSubManager();
      // TODO finish createSchemaWatchEventTrigger to ensure the query is not used in NOTIFY and exclude happens inside Postgres
    }
    return instance;
  };

  /**
   * Fallback for watchSchema in case of not a superuser (cannot add db event listener)
   */
  onSchemaChangeFallback: OnSchemaChangeCallback | undefined = async ({ command, query }) => {
    if (
      typeof query === "string" &&
      query.includes(PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID)
    ) {
      log("Schema change event excluded from triggers due to EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID");
      return;
    }
    if (
      this.type.watchType !== "prostgles_queries" ||
      !this.onSchemaChange ||
      !DB_FALLBACK_COMMANDS.includes(command)
    )
      return;

    this.onSchemaChange({ command, query });
  };

  onSchemaChange: OnSchemaChangeCallback | undefined = async (event) => {
    const { watchSchema, onReady, tsGeneratedTypesDir } = this.dboBuilder.prostgles.opts;
    if (watchSchema && this.dboBuilder.prostgles.loaded) {
      log("Schema changed");
      const { query, command } = event;

      void this.dboBuilder.cacheDBTypes(true);
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
      } else {
        /* Full re-init. Sockets must reconnect */
        console.log("watchSchema: Full re-initialisation", { query });
        void this.dboBuilder.prostgles.init(onReady as any, {
          type: "schema change",
          query,
          command,
        });
      }
    }
  };
}
