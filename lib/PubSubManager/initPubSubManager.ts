import { isDefined, isObject } from "prostgles-types";
import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { getWatchSchemaTagList } from "../SchemaWatch/getWatchSchemaTagList";
import { NOTIF_CHANNEL, PubSubManager, asValue } from "./PubSubManager";
import { getPubSubManagerInitQuery } from "./getPubSubManagerInitQuery";
export const REALTIME_TRIGGER_CHECK_QUERY = "prostgles-server internal query used to manage realtime triggers" as const;  

export const tout = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function initPubSubManager(this: PubSubManager): Promise<PubSubManager | undefined> {
  if (!this.getIsDestroyed()) return undefined;

  try {

    const initQuery = await getPubSubManagerInitQuery.bind(this.dboBuilder)();

    /**
     * High database activity might cause deadlocks.
     * Must retry
    */
    let didDeadlock = false;
    let tries = 3;
    let error: any;
    while (isDefined(initQuery) && tries > 0) {
      try {
        /** Try to reduce race condition deadlocks due to multiple clients connecting at the same time */
        await tout(Math.random());

        await this.db.tx(t => t.any(initQuery));
        error = undefined;
        tries = 0;
      } catch (e: any) {
        if(!didDeadlock && isObject(e) && e.code === "40P01"){
          didDeadlock = true;
          tries = 5;
          console.error("Deadlock detected. Retrying...");
        }
        error = e;
        tries --;
      }
    }
    if(error){
      throw error;
    }

    if (!this.getIsDestroyed()) return;

    /* Prepare App id */
    if (!this.appInfoWasInserted) {
      this.appInfoWasInserted = true;
      const check_frequency_ms = this.appCheckFrequencyMS;
      const watching_schema_tag_names = this.dboBuilder.prostgles.schemaWatch?.type.watchType !== "NONE" ? getWatchSchemaTagList(this.dboBuilder.prostgles.opts.watchSchema) : null;
      await this.db.one(
        "INSERT INTO prostgles.apps (id, check_frequency_ms, watching_schema_tag_names, application_name) \
        VALUES($1, $2, $3, current_setting('application_name')) \
        RETURNING *; "
        , [
          this.appId,
          check_frequency_ms,
          watching_schema_tag_names
        ]
      );

      const appRecord = await this.db.one("SELECT * FROM prostgles.apps WHERE id = $1", [this.appId]);
      if (!appRecord || !appRecord.application_name?.includes(this.appId)) {
        throw `initPubSubManager error: App record with application_name containing appId (${this.appId}) not found`;
      }

      await this.db.any(`
        DELETE FROM prostgles.app_triggers
        WHERE app_id = ${asValue(this.appId)}
      `);
    }

    this.postgresNotifListenManager = new PostgresNotifListenManager(this.db, this.notifListener, NOTIF_CHANNEL.getFull(this.appId));

    await this.initialiseEventTriggers();

    return this;

  } catch (e) {
    console.error("PubSubManager init failed: ", e);
  }
}