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
  poolClient: pg.PoolClient | undefined;
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
  pool: pg.Pool;
  adminPool: pg.Pool;
  constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;
    this.db = dboBuilder.db;
    const connectionInfo = typeof this.db.$cn === "string"? { connectionString: this.db.$cn } : this.db.$cn as any;
    const onPoolError = (err: Error, _client: pg.PoolClient) => {
      console.error(err.message);
    }
    this.pool = new pg.Pool({ ...connectionInfo, max: 50 }).on("error", (error) => {
      // if(error.message !== "Connection terminated") return;
      Object.entries(this.socketQueries).forEach(([socketId, queries]) => {
        Object.entries(queries).forEach(([id, query]) => {
          query.onError?.({ message: error.message });
          delete this.socketQueries[socketId]?.[id];
        });
      });
    });
    this.adminPool = new pg.Pool(connectionInfo).on("error", onPoolError);
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
      poolClient: undefined,
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
      (async () => {
        let emittedPackets = 0;
        let batchRows: any[] = [];
        let finished = false;
        const batchSize = 10000;
        let stream: QueryStreamType;
        let poolClient: pg.PoolClient;
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

        try {

          await this.pool.connect((err, client, done) => {
            if (err) throw err;
            if (!client) throw "No client";
            poolClient = client;
            processID = (client as any).processID
            const queryStream = new QueryStream(query.query, [], { batchSize, rowMode: "array" });
            stream = client.query(queryStream);
            this.socketQueries[socketId]![id]!.poolClient = poolClient;
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
              // release the client when the stream is finished
              if(!options?.persistStreamConnection){
                delete this.socketQueries[socketId]?.[id];
                done();
              }
            })
          });
        } catch(err){
          socketQuery.onError(err);
        }
      })();
    }

    const stop = (opts: { terminate?: boolean; } | undefined, cb: BasicCallback) => {
      // Must kill query if not ended
      const { stream, poolClient } = this.socketQueries[socketId]?.[id] ?? {};
      if(!stream || !poolClient) return;
      this.adminPool.connect(async (err, client, done) => {
        if (err) return cb(null, err);
        if (!client) return cb(null, "No client");
        const stopFunction = opts?.terminate? "pg_terminate_backend" : "pg_cancel_backend";
        client.query(`SELECT ${stopFunction}(pid) FROM pg_stat_activity WHERE pid = $1`, [processID], (err) => {
          if(err) {
            cb(null, err);
            console.error(err);
          }
          delete this.socketQueries[socketId]?.[id];
          poolClient.release();
          socket.removeAllListeners(unsubChannel);
          socket.removeAllListeners(channel);
          done();
        });
      });
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