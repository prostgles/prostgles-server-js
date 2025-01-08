import { AnyObject, ClientSchema, TableHandler } from "prostgles-types";
import { LocalParams } from "./DboBuilder/DboBuilder";
import { NotifTypeName, PubSubManagerTriggers } from "./PubSubManager/PubSubManager";

type ClientInfo = {
  socketId: string | undefined;
  sid: string | undefined;
};

export namespace EventTypes {
  type DebugInfo = {
    duration: number;
    error?: any;
  };

  export type Table = ClientInfo &
    DebugInfo & {
      type: "table";
      tableName: string;
      command: keyof TableHandler | "sync";
      txInfo: AnyObject | undefined;
      data: AnyObject;
      localParams: LocalParams | undefined;
    };

  export type Sync = ClientInfo &
    DebugInfo & {
      type: "sync";
      tableName: string;
      localParams?: LocalParams;
      connectedSocketIds: string[];
    } & (
      | {
          command: "syncData";
          source: "client" | "trigger";
          lr: string;
        }
      | {
          command: "upsertData" | "pushData";
          rows: number;
          socketId: string;
        }
      | {
          command: "addSync" | "unsync";
          socketId: string;
          condition: string;
        }
      | {
          command: "upsertSocket.disconnect";
          socketId: string;
          remainingSyncs: string;
          remainingSubs: string;
        }
    );

  type SyncOrSubWithClientInfo = ClientInfo & {
    tableName: string;
    localParams?: LocalParams;
  };
  export type SyncOrSub = DebugInfo & {
    type: "syncOrSub";
    connectedSocketIds: string[];
    triggers: PubSubManagerTriggers | undefined;
  } & (
      | (SyncOrSubWithClientInfo & {
          command: "addTrigger";
          state: "ok" | "fail";
          /** If no socket id then it's a local subscribe */
          socketId: string | undefined;
          condition: string;
        })
      | (SyncOrSubWithClientInfo & {
          command: "unsubscribe";
          channel_name: string;
        })
      | (SyncOrSubWithClientInfo & {
          command: "notifListener";
          notifType: NotifTypeName;
          dataArr: any[];
        })
      | (SyncOrSubWithClientInfo & {
          command: "notifListener.Finished";
          op_name: string | undefined;
          condition_ids_str: string | undefined;
          tableTriggers: PubSubManagerTriggers[string] | undefined;
          tableSyncs: string;
          state: "ok" | "error" | "no-triggers" | "invalid_condition_ids";
        })
      | {
          command: "pushSubData";
          channel_name: string;
          state:
            | "sub_not_found"
            | "error"
            | "Emiting to socket"
            | "pushed to local client"
            | "no client to push data to"
            | "fetch data error";
        }
      | {
          command: "postgresNotifListenManager.create" | "postgresNotifListenManager.destroy";
        }
      | {
          command: "refreshTriggers";
          oldTriggers: PubSubManagerTriggers;
        }
    );

  export type Connection =
    | (ClientInfo & {
        type: "connect" | "disconnect";
        socketId: string;
        connectedSocketIds: string[];
      })
    | (ClientInfo &
        DebugInfo & {
          type: "connect.getClientSchema";
        });

  export type Method = ClientInfo &
    DebugInfo & {
      type: "method";
      args: any[];
      localParams: LocalParams;
    };
  export type Auth = ClientInfo &
    DebugInfo & {
      type: "auth";
    } & ({ command: "getClientInfo" } | { command: "login"; success: boolean });

  export type Debug = DebugInfo &
    (
      | {
          type: "debug";
          command:
            | "initFileTable"
            | "initTableConfig"
            | "runSQLFile"
            | "schemaChangeNotif"
            | "TableConfig.runQueries.start"
            | "TableConfig.runQueries.end"
            | "refreshDBO.start"
            | "refreshDBO.end"
            | "tableConfigurator.init.start"
            | "tableConfigurator.init.end"
            | "initFileTable.start"
            | "initFileTable.end"
            | "initFileManager.runQuery"
            | "DboBuilder.getTablesForSchemaPostgresSQL"
            | "PubSubManager.create";
          data?: AnyObject;
        }
      | {
          type: "debug";
          command: "pushSocketSchema";
          data: { socketId: string; clientSchema: ClientSchema };
        }
    );
}

export type EventInfo =
  | EventTypes.Auth
  | EventTypes.Table
  | EventTypes.Method
  | EventTypes.Sync
  | EventTypes.SyncOrSub
  | EventTypes.Connection
  | EventTypes.Debug;

export type TableEvent = EventTypes.Table;
