import * as pg from "pg";
import { CHANNELS, SQLOptions, SocketSQLStreamPacket, SocketSQLStreamServer, omitKeys, pickKeys } from "prostgles-types";
import { BasicCallback } from "../PubSubManager/PubSubManager";
import { DB } from "../initProstgles";
import { DboBuilder } from "./DboBuilder";
import { PRGLIOSocket } from "./DboBuilderTypes";
import { getErrorAsObject, getSerializedClientErrorFromPGError } from "./dboBuilderUtils";
import { getDetailedFieldInfo } from "./runSQL";
import CursorType from 'pg-cursor'
import { VoidFunction, watchSchemaFallback } from "../SchemaWatch/SchemaWatch";
const Cursor: typeof CursorType = require('pg-cursor');

type ClientStreamedRequest = {
  socket: PRGLIOSocket;
  query: string;
  options: SQLOptions | undefined;
  persistConnection?: boolean;
}
type StreamedQuery = ClientStreamedRequest & {
  cursor: CursorType | undefined;
  client: pg.Client | undefined;
  stop?: VoidFunction;
  onError: ((error: any) => void);
}
type Info = { 
  command: string; 
  fields: any[]; 
  rowCount: number; 
  duration: number; 
};

const shortSocketIds: Record<string, number> = {};
const getSetShortSocketId = (socketId: string) => {
  const shortId = socketId.slice(0, 3);
  const currId = shortSocketIds[shortId] ?? 0;
  const newId = currId + 1;
  shortSocketIds[shortId] = newId;
  return newId;
};

export class QueryStreamer {
  db: DB;
  dboBuilder: DboBuilder;
  socketQueries: Record<string, Record<string, StreamedQuery>> = {};
  adminClient: pg.Client;
  constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;
    this.db = dboBuilder.db;
    const setAdminClient = () => {
      this.adminClient = this.getConnection(undefined, { keepAlive: true });
      this.adminClient.connect();
    }    
    this.adminClient = this.getConnection((error) => {
      if(error.message?.includes("database") && error.message?.includes("does not exist")) return;
      console.log("Admin client error. Reconnecting...", error);
      setAdminClient();
    }, { keepAlive: true });
    this.adminClient.connect();
  }

  getConnection = (onError: ((err: any) => void) | undefined, extraOptions?: pg.ClientConfig) => {
    const connectionInfo = typeof this.db.$cn === "string"? { connectionString: this.db.$cn } : this.db.$cn as any;
    const client = new pg.Client({ ...connectionInfo, ...extraOptions });
    client.on("error", (err) => { 
      onError?.(err);
    });
    return client;
  }

  onDisconnect = (socketId: string) => {
    const socketQueries = this.socketQueries[socketId];
    if(!socketQueries) return;
    Object.values(socketQueries).forEach(({ client, stop }) => {
      stop?.();
      /** end does not stop active query?! */
      client?.end();
    });
    delete this.socketQueries[socketId];
  }

  create = async (query: ClientStreamedRequest): Promise<SocketSQLStreamServer> => {
    const { socket, persistConnection } = query;
    const socketId = socket.id;
    const id = getSetShortSocketId(socketId);
    const channel = `${CHANNELS.SQL_STREAM}__${socketId}_${id}`;
    const unsubChannel = `${channel}.unsubscribe`;
    if(this.socketQueries[id] && !persistConnection){
      throw `Must stop existing query ${id} first`;
    }

    this.socketQueries[socketId] ??= {};
    let errored = false;
    const socketQuery = {
      ...query,
      id,
      client: undefined,
      cursor: undefined,
      onError: (rawError: any) => {
        if(errored) return;
        errored = true;

        const errorWithoutQuery = getSerializedClientErrorFromPGError(rawError, { type: "sql" });
        // For some reason query is not present on the error object from sql stream mode
        const error = { ...errorWithoutQuery, query: query.query };
        socket.emit(channel, { type: "error", error } satisfies SocketSQLStreamPacket);
      },
    };
    this.socketQueries[socketId]![id] ??= socketQuery;
    let processID = -1;
    let streamState: "started" | "ended" | "errored" | undefined;

    const startStream = async (client: pg.Client | undefined, query: ClientStreamedRequest) => {
      const socketQuery = this.socketQueries[socketId]?.[id];
      if(!socketQuery){
        throw "socket query not found";
      } 
      
      /** Only send fields on first request */
      let fieldsWereSent = false;
      const emit = ({ reachedEnd, rows, info }: { reachedEnd: true; rows: any[]; info: Info } | { reachedEnd: false; rows: any[]; info: Omit<Info, "command"> }) => {
        if(!info?.fields) throw "No fields";
        const fields = getDetailedFieldInfo.bind(this.dboBuilder)(info.fields as any);
        const packet: SocketSQLStreamPacket = { type: "data", rows, fields: fieldsWereSent? undefined : fields, info: reachedEnd? info : undefined, ended: reachedEnd, processId: processID };
        socket.emit(channel, packet);
        if(reachedEnd){
          watchSchemaFallback.bind(this.dboBuilder)({ queryWithoutRLS: query.query, command: info.command });
        }
        fieldsWereSent = true;
      }
      const currentClient = client ?? this.getConnection(err => {
        socketQuery.onError(err);
        currentClient.end();
      });
      this.socketQueries[socketId]![id]!.client = currentClient;
      try {
        if(!client){
          await currentClient.connect();
        }
        processID = (currentClient as any).processID;

        if(query.options?.streamLimit && (!Number.isInteger(query.options.streamLimit) || query.options.streamLimit < 0)){
          throw "streamLimit must be a positive integer";
        }
        const batchSize = query.options?.streamLimit? Math.min(1e3, query.options?.streamLimit) : 1e3;
        const cursor = currentClient.query(new Cursor(query.query, undefined, { rowMode: "array" }));
        this.socketQueries[socketId]![id]!.cursor = cursor;
        let streamLimitReached = false;
        let reachedEnd = false;
        (async () => {
          try {
            let rowChunk: any[] = [];
            let rowsSent = 0;
            do {
              rowChunk = await cursor.read(batchSize);
              const info = pickKeys((cursor as any)._result, ["fields", "rowCount", "command", "duration"]) as Info;
              rowsSent += rowChunk.length;
              streamLimitReached = Boolean(query.options?.streamLimit && rowsSent >= query.options.streamLimit);
              reachedEnd = rowChunk.length < batchSize;
              emit({ info, rows: rowChunk, reachedEnd: reachedEnd || streamLimitReached });
            } while (!reachedEnd && !streamLimitReached);
            
            streamState = "ended"; 
  
            if(!query.options?.persistStreamConnection){
              delete this.socketQueries[socketId]?.[id];
              currentClient.end();
            }
            cursor.close();
          } catch(error: any){
            streamState = "errored";
            if(error.message === "cannot insert multiple commands into a prepared statement") {
              this.dboBuilder.dbo.sql!(query.query, {}, { returnType: "arrayMode", hasParams: false }).then(res => {
                emit({ info: omitKeys(res, ["rows"]), reachedEnd: true, rows: res.rows});
              }).catch(newError => {
                socketQuery.onError(newError);
              });
            } else {
              socketQuery.onError(error);
            }
          } 
        })()
      } catch(err){
        socketQuery.onError(err);
        await currentClient.end();
      }
    }

    const cleanup = () => {
      socket.removeAllListeners(unsubChannel);
      socket.removeAllListeners(channel);
      delete this.socketQueries[socketId]?.[id];
    }
    const stop = async (opts: { terminate?: boolean; } | undefined, cb: BasicCallback) => {
      const { client: queryClient } = this.socketQueries[socketId]?.[id] ?? {};
      if(!queryClient) return;
      if(opts?.terminate){
        setTimeout(() => {
          queryClient.end();
        }, 4e3);
      }
      try {
        const stopFunction = opts?.terminate? "pg_terminate_backend" : "pg_cancel_backend";
        const rows = await this.adminClient.query(`SELECT ${stopFunction}(pid), pid, state, query FROM pg_stat_activity WHERE pid = $1`, [processID]);
        cleanup();
        cb({ processID, info: rows.rows[0] });
      } catch (error){
        cb(null, error);
      }
    }
    this.socketQueries[socketId]![id]!.stop = () => stop({ terminate: true }, () => { /* Empty */ });

    socket.removeAllListeners(unsubChannel);
    socket.once(unsubChannel, stop);

    let runCount = 0;
    socket.removeAllListeners(channel);
    socket.on(channel, async (_data: { query: string; params: any } | undefined, cb: BasicCallback) => {
      if(streamState === "started"){
        return cb(null, "Already started");
      }
      streamState = "started";
      try {
        /* Persisted connection query */
        if(runCount){
          const persistedClient = this.socketQueries[socketId]?.[id];
          if(!persistedClient) throw "Persisted query client not found"; 

          await startStream(persistedClient.client, { ...query, query: _data!.query! });
        } else {
          await startStream(undefined, query);
        }
        cb();
      } catch(err){
        console.error(err)
        cb(null, getErrorAsObject(err) ?? "Something went wrong");
      }
      runCount++;
    });

    /** If not started within 5 seconds then assume it will never happen */
    setTimeout(() => {
      if(streamState) return;
      cleanup();
    }, 5e3);

    return {
      channel,
      unsubChannel
    }
  }
}