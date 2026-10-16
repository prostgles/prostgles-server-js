import type { DboBuilder } from "../DboBuilder/DboBuilder";
import { AsyncLocalStorage } from "node:async_hooks";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import type { OnReadyCallbackBasic } from "../initProstgles";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID, log } from "../PubSubManager/PubSubManagerUtils";
import type { ValidatedWatchSchemaType } from "./getValidatedWatchSchemaType";
import { getValidatedWatchSchemaType } from "./getValidatedWatchSchemaType";
const COMMAND_FIRST_KEYWORDS = EVENT_TRIGGER_TAGS.map((tag) => tag.split(" ")[0]!).filter(
  (tag) => tag !== "SELECT",
); /** SELECT INTO is not easily detectable with pg-node (command = "SELECT")  */

const DB_FALLBACK_COMMANDS = Array.from(new Set(COMMAND_FIRST_KEYWORDS)).concat([
  "DO", // Do statement
  "COMMIT", // Transaction block
]);

export type VoidFunction = () => void;

type SchemaChangeEvent = {
  command: string | undefined;
  query: string;
};

export type OnSchemaChangeCallback = (event: SchemaChangeEvent) => void;

export class SchemaWatch {
  dboBuilder: DboBuilder;
  type: ValidatedWatchSchemaType;
  private readonly schemaChangeTransactions = new WeakSet<object>();
  private readonly schemaRefreshStorage = new AsyncLocalStorage<Promise<void>>();
  private pendingSchemaChange: SchemaChangeEvent | undefined;
  private schemaChangePromise: Promise<void> | undefined;
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

  destroy = async () => {
    this.onSchemaChange = undefined;
    this.pendingSchemaChange = undefined;
    await this.schemaChangePromise;
    this.schemaRefreshStorage.disable();
  };

  /**
   * Fallback for watchSchema in case of not a superuser (cannot add db event listener)
   */
  onSchemaChangeFallback:
    ((event: SchemaChangeEvent, transaction: object | undefined) => void) | undefined = (
    { command, query },
    transaction,
  ) => {
    if (typeof query === "string" && query.includes(EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID)) {
      log("Schema change event excluded from triggers due to EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID");
      return;
    }
    if (
      this.type.watchType !== "prostgles_queries" ||
      !this.onSchemaChange ||
      (command && !DB_FALLBACK_COMMANDS.includes(command))
    )
      return;

    if (!transaction) return this.onSchemaChange({ command, query });
    if (this.schemaChangeTransactions.has(transaction)) return;
    this.dboBuilder.registerOnCommitCallback(transaction, () =>
      this.onSchemaChange?.({ command, query }),
    );
    this.schemaChangeTransactions.add(transaction);
  };

  onSchemaChange: OnSchemaChangeCallback | undefined = (event) => {
    const { prostgles } = this.dboBuilder;
    // Ignore initialization's own SQL while retaining external schema changes.
    const isRefreshCallback = this.schemaRefreshStorage.getStore() === this.schemaChangePromise;
    if (
      prostgles.destroyed ||
      !prostgles.opts.watchSchema ||
      (!prostgles.loaded && (!this.schemaChangePromise || isRefreshCallback))
    )
      return;

    this.pendingSchemaChange = event;
    this.schemaChangePromise ??= Promise.resolve()
      .then(async () => {
        try {
          while (this.pendingSchemaChange) {
            const pendingEvent = this.pendingSchemaChange;
            this.pendingSchemaChange = undefined;
            await this.schemaRefreshStorage.run(this.schemaChangePromise!, () =>
              this.refreshSchema(pendingEvent),
            );
          }
        } finally {
          this.schemaChangePromise = undefined;
        }
      })
      .catch((error) => {
        console.error("watchSchema: Schema refresh failed", error);
      });
  };

  private refreshSchema = async (event: SchemaChangeEvent) => {
    const { watchSchema, onReady, tsGeneratedTypesDir } = this.dboBuilder.prostgles.opts;
    if (watchSchema) {
      log("Schema changed");
      const { query, command } = event;

      await this.dboBuilder.cacheDBTypes(true);
      if (this.dboBuilder.prostgles.destroyed) return;
      if (typeof watchSchema === "function") {
        /* Only call the provided func */
        void watchSchema(event);
      } else if (watchSchema === "hotReloadMode") {
        if (tsGeneratedTypesDir) {
          /* Hot reload integration. Will only touch tsGeneratedTypesDir */
          console.log("watchSchema: Re-writing TS schema");

          await this.dboBuilder.prostgles.refreshDBO();
          await this.dboBuilder.prostgles.writeDBSchema(true);
        }
      } else {
        /* Full re-init. Sockets must reconnect */
        console.log("watchSchema: Full re-initialisation", { query });
        await this.dboBuilder.prostgles.init(onReady as OnReadyCallbackBasic, {
          type: "schema change",
          query,
          command,
        });
      }
    }
  };
}
