import { AnyObject, ClientSchema } from "prostgles-types";
import { LocalParams } from "./DboBuilder/DboBuilder";
import { TableHandler } from "./DboBuilder/TableHandler/TableHandler";

type ClientInfo = {
  socketId: string | undefined;
  sid: string | undefined;
}

export namespace EventTypes {
  type DebugInfo = {
    duration: number;
    error?: any;
  }

  export type Table = ClientInfo & DebugInfo & {
    type: "table";
    tableName: string;
    command: keyof TableHandler;
    txInfo: AnyObject | undefined;
    data: AnyObject;
    localParams: LocalParams | undefined;
  };

  type SyncOneClient = ClientInfo & DebugInfo & {
    type: "sync";
    tableName: string;
    localParams?: LocalParams;
    connectedSocketIds: string[];
  } & (
    {
      command: "syncData";
      source: "client" | "trigger";
      connectedSocketIds: string[];
      lr: string;
    } | {
      command: "upsertData" | "pushData";
      rows: number;
      socketId: string;
    } | {
      command: "addTrigger";
      state: "ok" | "fail";
      /** If no socket id then it's a local subscribe */
      socketId: string | undefined;
      condition: string;
    } | {
      command: "addSync" | "unsync";
      socketId: string;
      condition: string;
    } | {
      command: "upsertSocket.disconnect";
      socketId: string;
      remainingSyncs: string;
      remainingSubs: string;
      connectedSocketIds: string[];
    }
  );
  export type SyncMultiClient = {
    type: "sync";
    tableName: string;
    localParams?: LocalParams;
    connectedSocketIds: string[];
  } & (
    {
      command: "notifListener";
      op_name: string | undefined;
      condition_ids_str: string | undefined;
      tableTriggers: string[] | undefined;
      tableSyncs: string;
      state: "ok" | "error" | "no-triggers" | "invalid_condition_ids";
    }
  );

  export type Sync = SyncOneClient | SyncMultiClient;

  export type Connection = (ClientInfo & {
    type: "connect" | "disconnect";
    socketId: string;
    connectedSocketIds: string[];
  }) | (ClientInfo & DebugInfo & {
    type: "connect.getClientSchema";
  });

  export type Method = ClientInfo & DebugInfo & {
    type: "method";
    args: any[];
    localParams: LocalParams;
  };
  export type Auth = ClientInfo & DebugInfo & {
    type: "auth";
  } & (
  | { command: "getClientInfo"; } 
  | { command: "login"; } 
  );

  export type Debug = DebugInfo & ({
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
    | "PubSubManager.create"
    data?: AnyObject;
  } | {
    type: "debug";
    command: "pushSocketSchema";
    data: { socketId: string, clientSchema: ClientSchema; }
  })
}

export type EventInfo =
  | EventTypes.Auth
  | EventTypes.Table
  | EventTypes.Method
  | EventTypes.Sync 
  | EventTypes.SyncMultiClient 
  | EventTypes.Connection
  | EventTypes.Debug;

export type TableEvent = EventTypes.Table;