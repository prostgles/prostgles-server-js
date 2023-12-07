import * as pg from "pg";
import QueryStreamType from 'pg-query-stream';
import { CHANNELS, SQLOptions, SocketSQLStreamPacket, SocketSQLStreamServer, omitKeys } from "prostgles-types";
import { BasicCallback } from "../PubSubManager/PubSubManager";
import { DB } from "../initProstgles";
import { DboBuilder } from "./DboBuilder";
import { PRGLIOSocket } from "./DboBuilderTypes";
import { getErrorAsObject, getSerializedClientErrorFromPGError } from "./dboBuilderUtils";
import { getDetailedFieldInfo, watchSchemaFallback } from "./runSQL";
const QueryStream: typeof QueryStreamType = require('pg-query-stream');


type ClientStreamedRequest = {
  socket: PRGLIOSocket;
  query: string;
  options: SQLOptions | undefined;
  persistConnection?: boolean;

}
type StreamedQuery = ClientStreamedRequest & {
  stream: QueryStreamType | undefined;
  client: pg.Client | undefined;
  onError: ((error: any) => void);
}
type Info = { command: string; fields: any[]; rowCount: number; duration: number; }

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
    Object.values(socketQueries).forEach(({ client }) => {
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
      stream: undefined,
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
    let streamState: "started" | "ended" | undefined;

    const startStream = async (client: pg.Client | undefined, query: ClientStreamedRequest) => {
      const socketQuery = this.socketQueries[socketId]?.[id];
      if(!socketQuery){
        throw "socket query not found";
      } 
      
      let batchRows: any[] = [];
      let finished = false;
      const batchSize = 10000;
      let stream: QueryStreamType; 
      const emit = (type: "rows" | "ended", streamResult: Info | undefined) => {
        const ended = type === "ended";
        if(finished) return;
        finished = finished || ended;
        if(!streamResult?.fields) throw "No fields";
        const fields = getDetailedFieldInfo.bind(this.dboBuilder)(streamResult.fields as any);
        const packet: SocketSQLStreamPacket = { type: "data", rows: batchRows, fields, info: streamResult, ended, processId: processID };
        socket.emit(channel, packet);
        if(ended){
          if(!streamResult) throw "No result info";
          watchSchemaFallback.bind(this.dboBuilder)({ queryWithoutRLS: query.query, command: streamResult.command });
        }
      }
      const currentClient = client ?? this.getConnection(err => {
        socketQuery.onError(err);
        currentClient.end();
      });
      this.socketQueries[socketId]![id]!.client = currentClient;
      try {
        await currentClient.connect();  
        processID = (currentClient as any).processID
        const queryStream = new QueryStream(query.query, undefined, { batchSize: 1e6, highWaterMark: 1e6, rowMode: "array" });
        stream = currentClient.query(queryStream);
        this.socketQueries[socketId]![id]!.stream = stream;
        const getStreamResult = () => omitKeys(stream._result, ["rows"]) as Info;
        stream.on('data', async (data) => {
          batchRows.push(data);
          if(query.options?.streamLimit) {
            if(batchRows.length >= query.options.streamLimit){
              emit("ended", getStreamResult());
            }
          }
          if (batchRows.length >= batchSize) {
            emit("rows", getStreamResult());
            batchRows = [];
          }
        });
        stream.on('error', error => {
          if(error.message === "cannot insert multiple commands into a prepared statement") {
            this.dboBuilder.dbo.sql!(query.query, {}, { returnType: "arrayMode", hasParams: false }).then(res => {
              batchRows.push(res.rows);
              emit("ended", res);
            }).catch(newError => {
              socketQuery.onError(newError);
            });
          } else {
            socketQuery.onError(error);
          }
        });
        stream.on('end', () => {
          const streamResult = getStreamResult();
          streamState = "ended";
          emit("ended", streamResult);
          // release the client when the stream is finished AND connection is not persisted
          if(!query.options?.persistStreamConnection){
            delete this.socketQueries[socketId]?.[id];
            currentClient.end();
          }
        });
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
      try {
        const stopFunction = opts?.terminate? "pg_terminate_backend" : "pg_cancel_backend";
        const rows = await this.adminClient.query(`SELECT ${stopFunction}(pid), pid, state, query FROM pg_stat_activity WHERE pid = $1 AND query = $2`, [processID, query.query]);
        cleanup()
        cb({ processID, info: rows.rows[0] });
      } catch (error){
        cb(null, error);
      }
    }

    socket.removeAllListeners(unsubChannel);
    socket.once(unsubChannel, stop);

    let runCount = 0;
    socket.removeAllListeners(channel);
    socket.on(channel, async (_data: { query: string; params: any } | undefined, cb: BasicCallback) => {
      if(streamState === "started"){
        // TODO
        return cb(null, "Already started");
      }
      streamState = "started";
      try {
        /* Query for persisted connection */
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

    /** If not started in 5 seconds then assume this will never happen */
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