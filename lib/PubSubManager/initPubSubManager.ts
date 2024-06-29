import { isDefined, isObject } from "prostgles-types";
import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { getWatchSchemaTagList } from "../SchemaWatch/getWatchSchemaTagList";
import { NOTIF_CHANNEL, PubSubManager, asValue } from "./PubSubManager";
import { getPubSubManagerInitQuery } from "./getInitQuery";
export const REALTIME_TRIGGER_CHECK_QUERY = "prostgles-server internal query used to manage realtime triggers" as const;  

export const tout = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function initPubSubManager(this: PubSubManager): Promise<PubSubManager | undefined> {
  if (!this.getIsDestroyed()) return undefined;

  try {

    const initQuery = await getPubSubManagerInitQuery.bind(this)();

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

        await this.db.any(initQuery);
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
      
      // console.log("REMOVE app check disabled");
      // if (!this.appCheck && Math.random() > 12) {

      //   this.appCheck = setInterval(async () => {
      //     let checkForStaleTriggers = "";
      //     try {

      //       this.appChecking = true;
 
      //       const listeners = this.getActiveListeners();
      //       const updateCurrentlyUsedTriggersQuery = !listeners.length? "" : `
      //         UPDATE prostgles.app_triggers
      //         SET last_used = CASE WHEN (table_name, condition) IN (
      //           ${listeners.map(l => ` ( ${asValue(l.table_name)}, ${asValue(l.condition)} ) `).join(", ")}
      //         ) THEN NOW() ELSE last_used END
      //         WHERE app_id = ${asValue(this.appId)};
      //       `;

      //       const checkedListenerTableCond = listeners.map(l => `${l.table_name}.${l.condition}`);
      //       let dataTriggerCheckQuery = "";
      //       if(this.checkedListenerTableCond?.sort().join() !== checkedListenerTableCond.sort().join()){
      //         this.checkedListenerTableCond = checkedListenerTableCond;
      //         dataTriggerCheckQuery = `
      //           /* Delete unused triggers. Might deadlock */
      //           IF EXISTS ( SELECT 1 FROM prostgles.app_triggers) 
                    
      //           THEN

      //               /* TODO: Fixed deadlocks */
      //               --LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

      //               /* UPDATE currently used triggers */
      //               ${updateCurrentlyUsedTriggersQuery}

      //               /* DELETE stale triggers for current app. Other triggers will be deleted on app startup 
      //                 DELETE FROM prostgles.app_triggers
      //                 WHERE app_id = ${asValue(this.appId)}
      //                 AND last_used < NOW() - 4 * ${asValue(this.appCheckFrequencyMS)} * interval '1 millisecond'; -- 10 seconds at the moment
      //               */

      //           END IF;
              
      //         `
      //       }

      //       const queryIdentifier = "prostgles query used to keep track of which prgl backend clients are still connected"
      //       checkForStaleTriggers = `                          
      //         DO $$
      //         BEGIN
      //           /* 
      //             ${queryIdentifier}
      //             ${REALTIME_TRIGGER_CHECK_QUERY} 
      //             ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
      //           */
      //           /* prostgles schema must exist */
      //           IF
      //             EXISTS (
      //               SELECT 1 
      //               FROM information_schema.tables 
      //               WHERE  table_schema = 'prostgles'
      //               AND    table_name   = 'apps'
      //             )
      //           THEN

      //               /* Last check used to remove disconnected apps */
      //               UPDATE prostgles.apps 
      //               SET last_check = NOW()
      //               WHERE id = ${asValue(this.appId)};

      //               ${dataTriggerCheckQuery}
      //           END IF;
 
      //         END $$;`

      //       const queryTimeoutMillis = Math.min(5e3, Math.round(this.appCheckFrequencyMS/2));
      //       const timeout = setTimeout(() => {
      //         this.db.any(`    
      //         /* 
      //           ${queryIdentifier}
      //           ${REALTIME_TRIGGER_CHECK_QUERY}
      //           ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
      //         */
      //         DO $$ 
      //         BEGIN
      //           /* PERFORM pg_sleep(\${queryTimeoutMillis}/1e3); */
      //           PERFORM pg_cancel_backend(pid)
      //           FROM pg_catalog.pg_stat_activity
      //           WHERE pid <> pg_backend_pid()
      //           AND query = \${queryIdentifier};
      //         END $$;
      //       `, { queryTimeoutMillis, queryIdentifier })
      //       }, queryTimeoutMillis);
      //       await this.db.any(checkForStaleTriggers);
      //       clearTimeout(timeout);
            
      //       tries = 5;
      //       log("updated last_check");
      //     } catch (e: any) {
      //       tries --;

      //       /** In some cases a query idles and blocks everything else. Terminate all similar queries */
      //       this.db.any(
      //         "SELECT state, pg_terminate_backend(pid) from pg_stat_activity \
      //          WHERE query ilike ${qid} \
      //          AND pid <> pg_backend_pid();", 
      //         { qid: `%${REALTIME_TRIGGER_CHECK_QUERY}%` }
      //       );

      //       /** If no tries left
      //        * OR
      //        * If this database was dropped 
      //        * 
      //        * then stop interval 
      //        * */
      //       if(tries <= 0 || e?.code === "3D000"){ //  && e.message.includes(this.db.$cn.database)
      //         clearInterval(this.appCheck);
      //       }
      //       console.error("appCheck FAILED: \n", e, checkForStaleTriggers);
      //     }

      //     this.appChecking = false;
      //   }, 0.8 * this.appCheckFrequencyMS);
      // }
    }

    this.postgresNotifListenManager = new PostgresNotifListenManager(this.db, this.notifListener, NOTIF_CHANNEL.getFull(this.appId));

    await this.initialiseEventTriggers();

    return this;

  } catch (e) {
    console.error("PubSubManager init failed: ", e);
  }
}