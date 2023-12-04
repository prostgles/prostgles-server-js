import { DB } from "../initProstgles";
import * as pg from "pg";
import { CHANNELS, SQLOptions, SocketSQLStreamPacket, SocketSQLStreamServer } from "prostgles-types";
import { PRGLIOSocket } from "./DboBuilderTypes";
import { getSerializedClientErrorFromPGError } from "./dboBuilderUtils";
import { getDetailedFieldInfo, watchSchemaFallback } from "./runSQL";
import { DboBuilder } from "./DboBuilder";
import QueryStreamType from 'pg-query-stream';
import { BasicCallback } from "../PubSubManager/PubSubManager";
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
  constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;
    this.db = dboBuilder.db;
  }

  getConnection = (onError: ((err: any) => void) | undefined) => {
    const connectionInfo = typeof this.db.$cn === "string"? { connectionString: this.db.$cn } : this.db.$cn as any;
    const client = new pg.Client(connectionInfo);
    client.on("error", (err) => { 
      onError?.(err);
    });
    return client;
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
    const { options } = query
    let processID = -1;

    const startStream = async () => {
      const socketQuery = this.socketQueries[socketId]?.[id];
      if(!socketQuery){
        throw "socket query not found";
      } 
      let emittedPackets = 0;
      let batchRows: any[] = [];
      let finished = false;
      const batchSize = 10000;
      let stream: QueryStreamType;
      let poolClient: pg.Client;
      const emit = (type: "rows" | "ended", stream: QueryStreamType | undefined) => {
        const result = stream?._result as { command: string; fields: any[] } | undefined;
        let packet: SocketSQLStreamPacket | undefined;
        const ended = type === "ended";
        if(finished) return;
        finished = finished || ended;
        if (!emittedPackets) {
          if(!result?.fields) throw "No fields";
          const fields = getDetailedFieldInfo.bind(this.dboBuilder)(result.fields as any);
          packet = { type: "start", rows: batchRows, fields, ended, processId: processID };
        } else {
          packet = { type: "rows", rows: batchRows, ended };
        }
        socket.emit(channel, packet);
        if(ended){
          if(!result) throw "No result info";
          watchSchemaFallback.bind(this.dboBuilder)({ queryWithoutRLS: query.query, command: result.command });
        }
        emittedPackets++;
      }
      const client = this.getConnection(err => {
        socketQuery.onError(err);
        client.end();
      });
      try {
        await client.connect(); 
        poolClient = client;
        processID = (client as any).processID
        const queryStream = new QueryStream(query.query, [], { batchSize: 1e6, highWaterMark: 1e6, rowMode: "array" });
        stream = client.query(queryStream);
        this.socketQueries[socketId]![id]!.client = poolClient;
        this.socketQueries[socketId]![id]!.stream = stream;
        stream.on('data', async (data) => {
          batchRows.push(data);
          if(options?.streamLimit) {
            if(batchRows.length >= options.streamLimit){
              emit("ended", stream);
            }
          }
          if (batchRows.length >= batchSize) {
            emit("rows", stream);
            batchRows = [];
          }
        });
        stream.on('error', error => {
          socketQuery.onError(error);
        });
        
        stream.on('end', () => {
          emit("ended", stream);
          // release the client when the stream is finished AND connection is not persisted
          if(!options?.persistStreamConnection){
            delete this.socketQueries[socketId]?.[id];
            client.end();
          }
        });
      } catch(err){
        socketQuery.onError(err);
        await client.end();
      }
    }

    const stop = async (opts: { terminate?: boolean; } | undefined, cb: BasicCallback) => {
      const { stream, client: poolClient } = this.socketQueries[socketId]?.[id] ?? {};
      if(!stream || !poolClient) return;
      const client = this.getConnection(undefined);
      try {
        await client.connect(); 
        if (!client) return cb(null, "No client");
        const stopFunction = opts?.terminate? "pg_terminate_backend" : "pg_cancel_backend";
        const rows = await client.query(`SELECT ${stopFunction}(pid), pid, state, query FROM pg_stat_activity WHERE pid = $1 AND query = $2`, [processID, query.query]);
        socket.removeAllListeners(unsubChannel);
        socket.removeAllListeners(channel);
        cb({ processID, info: rows.rows[0] });
      } catch (error){
        cb(null, error);
      } finally {
        await client.end();
      }
    }

    socket.removeAllListeners(unsubChannel);
    socket.once(unsubChannel, stop);

    let started = false;
    socket.removeAllListeners(channel);
    socket.once(channel, async (_data, cb) => {
      started = true;
      try {
        await startStream();
        cb();
      } catch(err){
        cb(null, err ?? "Something went wrong");
      }
    });

    /** If not started in 5 seconds then assume this will never happen */
    setTimeout(() => {
      if(started) return;
      stop({}, () => { 
        // empty 
      });
    }, 5e3);

    return {
      channel,
      unsubChannel
    }
  }
}