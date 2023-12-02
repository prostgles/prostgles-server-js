import { DB } from "../initProstgles";
// import { Pool } from "pg";
import { QueryIterablePool } from 'pg-iterator';
import { CHANNELS, SQLOptions, SocketSQLStreamPacket, SocketSQLStreamServer } from "prostgles-types";
import { PRGLIOSocket } from "./DboBuilderTypes";
import { getSerializedClientErrorFromPGError } from "./dboBuilderUtils";
import { getDetailedFieldInfo } from "./runSQL";
import { DboBuilder } from "./DboBuilder";

type ClientStreamedRequest = {
  socket: PRGLIOSocket;
  query: string;
  options: SQLOptions | undefined;
  persistConnection?: boolean;

}
type StreamedQuery = ClientStreamedRequest & {
  iterablePool: QueryIterablePool<unknown> | undefined;
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

  create = async (query: ClientStreamedRequest): Promise<SocketSQLStreamServer> => {
    const { socket, persistConnection } = query;
    const socketId = socket.id;
    const id = getSetShortSocketId(socketId);
    const channel = `${CHANNELS.SQL_STREAM}__${socketId}_${id}`;
    const unsubChannel = `${channel}.unsubscribe`;
    if(this.socketQueries[id] && !persistConnection){
      throw `Must stop existing query ${id} first`;
    }

    this.socketQueries[socketId] ??= {}
    this.socketQueries[socketId]![id] ??= {
      ...query,
      iterablePool: undefined,
    };
    const { options } = query
    const startStream = async () => {
      const socketQuery = this.socketQueries[socketId]?.[id];
      if(!socketQuery){
        throw "socket query not found";
      }
      // this.db.connect().then(client => { client.query({ rowMode: "array", text: "" })  }).catch(err => { console.log(err) });
      const iterablePool = new QueryIterablePool(this.db.$pool as any, { rowMode: "array" });
      const iterable = iterablePool.query(query.query);
      socketQuery.iterablePool = iterablePool;
      // const connectionId = await iterablePool.query(`SELECT pg_backend_pid()`);
      (async () => {
        let emittedPackets = 0;
        let batchRows: any[] = [];
        let finished = false;
        const batchSize = 1000;

        const emit = (type: "rows" | "error" | "ended", rawError?: any) => {
          let packet: SocketSQLStreamPacket | undefined;
          const ended = type === "ended";
          if(finished) return;
          finished = finished || ended;
          if(type === "error"){
            const error = getSerializedClientErrorFromPGError(rawError);
            packet = { type: "error", error };
          } else if (!emittedPackets) {
            const fields = getDetailedFieldInfo.bind(this.dboBuilder)(iterablePool.fields as any);
            packet = { type: "start", rows: batchRows, fields, ended };
          } else {
            packet = { type: "rows", rows: batchRows, ended };
          }
          socket.emit(channel, packet);
          if(ended){
            iterablePool.release();
          }
          emittedPackets++;
        }

        try {
          for await (const u of iterable) {
            batchRows.push(u);
            if(options?.streamLimit) {
              if(batchRows.length >= options.streamLimit){
                emit("ended");
                break;
              }
            }
            if (batchRows.length >= batchSize) {
              emit("rows");
              batchRows = [];
            }
          }
          emit("ended");


        } catch(err){
          emit("error", err);
        }
      })();
    }

    const stop = () => {
      this.socketQueries[socketId]![id]?.iterablePool?.release();
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
      stop();
      socket.removeAllListeners(unsubChannel);
      socket.removeAllListeners(channel);
    }, 5e3);

    return {
      channel,
      unsubChannel
    }
  }
}