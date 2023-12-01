import { DB } from "../initProstgles";
// import { Pool } from "pg";
import { QueryIterablePool } from 'pg-iterator';
import { PRGLIOSocket } from "./DboBuilderTypes";
import { CHANNELS, SocketSQLStreamServer } from "prostgles-types";

type ClientStreamedRequest = {
  socket: PRGLIOSocket;
  query: string;
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
  socketQueries: Record<string, Record<string, StreamedQuery>> = {};

  constructor(db: DB) {
    this.db = db;
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

    // const pool = new Pool(this.db.$cn as any);

    this.socketQueries[socketId] ??= {}
    this.socketQueries[socketId]![id] ??= {
      ...query,
      iterablePool: undefined,
    };
    
    let batchRows: any[] = [];
    const batchSize = 1000;
    const startStream = async () => {
      const socketQuery = this.socketQueries[socketId]?.[id];
      if(!socketQuery){
        throw "socket query not found";
      }
      const iterablePool = new QueryIterablePool(this.db.$pool as any);
      const iterable = iterablePool.query(query.query);
      socketQuery.iterablePool = iterablePool;
      (async () => {
        for await (const u of iterable) {
          batchRows.push(u);
          if (batchRows.length >= batchSize) {
            socket.emit(channel, batchRows);
            batchRows = [];
          }
        }
        socket.emit(channel, batchRows);
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