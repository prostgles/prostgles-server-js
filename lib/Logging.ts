import { AnyObject } from "prostgles-types";
import { LocalParams } from "./DboBuilder";
import { TableHandler } from "./DboBuilder/TableHandler";

type ClientInfo = {
  socketId: string;
  sid: string | undefined;
}

export namespace EventTypes {
  type DebugInfo = {
    duration: number;
    error?: any;
  }

  export type Table = {
    type: "table";
    tableName: string;
    command: keyof TableHandler;
    data: AnyObject;
    localParams: LocalParams | undefined;
  };

  export type Sync = {
    type: "sync";
    tableName: string;
    localParams?: LocalParams;
    connectedSocketIds: string[];
    duration?: number;
    error?: any;
  } & (
    {
      command: "notifListener";
      op_name: string | undefined;
      condition_ids_str: string | undefined;
      tableTriggers: string[] | undefined;
      tableSyncs: string;
      state: "ok" | "error" | "no-triggers" | "invalid_condition_ids";
    } | {
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

  export type Connection = ClientInfo & {
    type: "connect" | "disconnect";
    socketId: string;
    connectedSocketIds: string[];
  };

  export type Method = {
    type: "method";
    args: any[];
  };

  export type Debug = DebugInfo & {
    type: "debug";
    command: 
    | "initFileTable" 
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
    data?: AnyObject;
  }
}

export type EventInfo =
  | EventTypes.Table
  | EventTypes.Method
  | EventTypes.Sync 
  | EventTypes.Connection
  | EventTypes.Debug;

export type TableEvent = EventTypes.Table;