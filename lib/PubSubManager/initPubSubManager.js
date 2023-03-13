"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPubSubManager = void 0;
const PostgresNotifListenManager_1 = require("../PostgresNotifListenManager");
const PubSubManager_1 = require("./PubSubManager");
const REALTIME_TRIGGER_CHECK_QUERY = "prostgles-server internal query used to manage realtime triggers";
const getInitQuery_1 = require("./getInitQuery");
async function initPubSubManager() {
    if (!this.canContinue())
        return undefined;
    let tries = 5;
    try {
        await this.db.any(await getInitQuery_1.getInitQuery.bind(this)());
        if (!this.canContinue())
            return;
        /* Prepare App id */
        if (!this.appID) {
            const raw = await this.db.one("INSERT INTO prostgles.apps (check_frequency_ms, watching_schema, application_name) VALUES($1, $2, current_setting('application_name')) RETURNING *; ", [this.appCheckFrequencyMS, Boolean(this.onSchemaChange)]);
            this.appID = raw.id;
            if (!this.appCheck) {
                this.appCheck = setInterval(async () => {
                    let appQ = "";
                    try { //  drop owned by api
                        this.appChecking = true;
                        const listeners = this.getActiveListeners();
                        appQ = `                          
              DO $$
              BEGIN

                  /* 
                    ${REALTIME_TRIGGER_CHECK_QUERY} 
                    ${PubSubManager_1.PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
                  */
                  /* prostgles schema must exist */
                  IF
                    EXISTS (
                      SELECT 1 
                      FROM information_schema.tables 
                      WHERE  table_schema = 'prostgles'
                      AND    table_name   = 'apps'
                    )
                  THEN
 
                      UPDATE prostgles.apps 
                      SET last_check = NOW()
                      WHERE id = ${(0, PubSubManager_1.asValue)(this.appID)};



                      /* Delete unused triggers. Might deadlock */
                      IF EXISTS ( SELECT 1 FROM prostgles.app_triggers) 
                          
                      THEN

                          /* TODO: Fixed deadlocks */
                          --LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

                          /* UPDATE currently used triggers */
                          ${!listeners.length ? "" : `
                            UPDATE prostgles.app_triggers
                            SET last_used = CASE WHEN (table_name, condition) IN (
                              ${listeners.map(l => ` ( ${(0, PubSubManager_1.asValue)(l.table_name)}, ${(0, PubSubManager_1.asValue)(l.condition)} ) `).join(", ")}
                            ) THEN NOW() ELSE last_used END
                            WHERE app_id = ${(0, PubSubManager_1.asValue)(this.appID)};
                          `}

                          /* DELETE stale triggers for current app. Other triggers will be deleted on app startup */
                          DELETE FROM prostgles.app_triggers
                          WHERE app_id = ${(0, PubSubManager_1.asValue)(this.appID)}
                          AND last_used < NOW() - 4 * ${(0, PubSubManager_1.asValue)(this.appCheckFrequencyMS)} * interval '1 millisecond'; -- 10 seconds at the moment

                      END IF;

                      UPDATE prostgles.apps 
                      SET last_check_ended = NOW()
                      WHERE id = ${(0, PubSubManager_1.asValue)(this.appID)};


                  END IF;
 
              END $$;
          `;
                        await this.db.any(appQ);
                        tries = 5;
                        (0, PubSubManager_1.log)("updated last_check");
                    }
                    catch (e) {
                        tries--;
                        /** In some cases a query idles and blocks everything else. Terminate all similar queries */
                        this.db.any("SELECT state, pg_terminate_backend(pid) from pg_stat_activity WHERE query ilike ${qid} and pid <>  pg_backend_pid();", { qid: "%" + REALTIME_TRIGGER_CHECK_QUERY + "%" });
                        /** If no tries left
                         * OR
                         * If this database was dropped
                         *
                         * then stop interval
                         * */
                        if (tries <= 0 || e?.code === "3D000") { //  && e.message.includes(this.db.$cn.database)
                            clearInterval(this.appCheck);
                        }
                        console.error("appCheck FAILED: \n", e, appQ);
                    }
                    this.appChecking = false;
                }, 0.8 * this.appCheckFrequencyMS);
            }
        }
        this.postgresNotifListenManager = new PostgresNotifListenManager_1.PostgresNotifListenManager(this.db, this.notifListener, this.NOTIF_CHANNEL.getFull());
        await this.prepareTriggers();
        return this;
    }
    catch (e) {
        console.error("PubSubManager init failed: ", e);
    }
}
exports.initPubSubManager = initPubSubManager;
