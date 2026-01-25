import type { DB } from "./Prostgles";
import type pg from "pg-promise/typescript/pg-subset";
import type pgPromise from "pg-promise";

export type PrglNotifListener = (args: {
  length: number;
  processId: number;
  channel: string;
  payload: string;
  name: string;
}) => void;

export class PostgresNotifListenManager {
  connection?: pgPromise.IConnected<{}, pg.IClient>;
  db_pg: DB;
  notifListener: PrglNotifListener;
  db_channel_name: string;
  isListening: any;
  client?: pg.IClient;

  static create = (
    db_pg: DB,
    notifListener: PrglNotifListener,
    db_channel_name: string,
  ): Promise<PostgresNotifListenManager> => {
    const res = new PostgresNotifListenManager(db_pg, notifListener, db_channel_name, true);
    return res.init();
  };

  constructor(
    db_pg: DB,
    notifListener: PrglNotifListener,
    db_channel_name: string,
    noInit = false,
  ) {
    if (!db_channel_name)
      throw "PostgresNotifListenManager: db_pg OR notifListener OR db_channel_name MISSING";
    this.db_pg = db_pg;
    this.notifListener = notifListener;
    this.db_channel_name = db_channel_name;

    if (!noInit) void this.init();
  }

  async init(): Promise<PostgresNotifListenManager> {
    this.connection = undefined;

    this.isListening = await this.startListening();
    return this;
  }

  get isReady() {
    return this.isListening;
  }

  startListening() {
    return this.reconnect().catch((error) => {
      console.log("PostgresNotifListenManager: Failed Initial Connection:", error);
    });
  }

  destroyed = false;
  destroy = async () => {
    this.destroyed = true;
    await this.stopListening();
    await this.connection?.done();
    this.connection = undefined;
  };

  stopListening = async () => {
    if (this.db_channel_name) {
      try {
        await this.connection?.none("UNLISTEN $1~", [this.db_channel_name]);
        await this.client?.query("UNLISTEN $1~", [this.db_channel_name]);
      } catch {}
    }
  };

  reconnect(delay: number | undefined = 0, maxAttempts: number | undefined = 0) {
    if (this.destroyed) {
      return Promise.reject("Destroyed");
    }

    delay = delay > 0 ? parseInt(delay + "") : 0;
    maxAttempts = maxAttempts > 0 ? parseInt(maxAttempts + "") : 1;

    const setListeners = (
        client: pg.IClient,
        notifListener: PrglNotifListener,
        db_channel_name: string,
      ) => {
        client.on("notification", notifListener);
        this.client = client;
        if (!this.connection) throw "Connection missing";
        return this.connection
          .none(
            `/* prostgles-server internal query used for subscriptions and schema hot reload */ \nLISTEN $1~`,
            db_channel_name,
          )
          .catch((error) => {
            console.log("PostgresNotifListenManager: unexpected error: ", error); // unlikely to ever happen
          });
      },
      removeListeners = (client: pg.IClient) => {
        client.removeListener("notification", this.notifListener);
      },
      onConnectionLost = (err: any, e: pgPromise.ILostContext<pg.IClient>) => {
        console.log("PostgresNotifListenManager: Connectivity Problem:", err);
        this.connection = undefined; // prevent use of the broken connection
        removeListeners(e.client);

        this.reconnect(5000, 10) // retry 10 times, with 5-second intervals
          .then(() => {
            console.log("PostgresNotifListenManager: Successfully Reconnected");
          })
          .catch(() => {
            // failed after 10 attempts
            console.log(
              "PostgresNotifListenManager: Connection Lost Permanently. No more retryies",
            );
            // process.exit(); // exiting the process
          });
      };

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        this.db_pg
          .connect({ direct: true, onLost: onConnectionLost })
          .then((obj) => {
            this.connection = obj; // global connection is now available
            resolve(obj);
            return setListeners(obj.client, this.notifListener, this.db_channel_name);
          })
          .catch((error) => {
            /** Database was destroyed */
            if (this.destroyed || (error && error.code === "3D000")) return;
            console.log("PostgresNotifListenManager: Error Connecting:", error);
            if (--maxAttempts) {
              this.reconnect(delay, maxAttempts).then(resolve).catch(reject);
            } else {
              reject(error);
            }
          });
      }, delay);
    });
  }
}
