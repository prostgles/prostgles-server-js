import { AnyObject, CHANNELS } from "prostgles-types";
import type { Prostgles, TABLE_METHODS } from "./Prostgles";
import { PRGLIOSocket } from "./DboBuilder/DboBuilderTypes";
import { runClientMethod, runClientRequest } from "./runClientRequest";
import { getErrorAsObject } from "./DboBuilder/dboBuilderUtils";

export async function onSocketConnected(this: Prostgles, socket: PRGLIOSocket) {
  if (this.destroyed) {
    console.log("Socket connected to destroyed instance");
    socket.disconnect();
    return
  }
  this.connectedSockets.push(socket);

  try {
    await this.opts.onLog?.({
      type: "connect", 
      sid: this.authHandler?.getSID({ socket }),
      socketId: socket.id,
      connectedSocketIds: this.connectedSockets.map(s => s.id)
    });

    if (!this.db || !this.dbo) throw new Error("db/dbo missing");
    const { dbo, db } = this;

    if (this.opts.onSocketConnect) {
      try {
        const getUser = async () => { return await this.authHandler?.getClientInfo({ socket }); }
        await this.opts.onSocketConnect({ socket, dbo: dbo as any, db, getUser });
      } catch(error) {
        const connectionError = error instanceof Error? error.message : typeof error === "string"? error : JSON.stringify(error);
        socket.emit(CHANNELS.CONNECTION, { connectionError });
        socket.disconnect();
        return;
      }
    }

    socket.removeAllListeners(CHANNELS.DEFAULT)
    socket.on(CHANNELS.DEFAULT, async (args: SocketRequestParams, cb = (..._callback: any[]) => { /* Empty */}) => {
      runClientRequest.bind(this)({  ...args, type: "socket", socket })
        .then(res => {
          cb(null, res)
        }).catch(err => {
          cb(err);
        });
    });

    socket.on("disconnect", () => {

      this.dbEventsManager?.removeNotice(socket);
      this.dbEventsManager?.removeNotify(undefined, socket);
      this.connectedSockets = this.connectedSockets.filter(s => s.id !== socket.id);
      this.dboBuilder.queryStreamer.onDisconnect(socket.id);
      this.opts.onLog?.({ 
        type: "disconnect", 
        sid: this.authHandler?.getSID({ socket }),
        socketId: socket.id,
        connectedSocketIds: this.connectedSockets.map(s => s.id)
      });

      if (this.opts.onSocketDisconnect) {
        const getUser = async () => { return await this.authHandler?.getClientInfo({ socket }); }
        this.opts.onSocketDisconnect({ socket, dbo: dbo as any, db, getUser });
      }
    });

    socket.removeAllListeners(CHANNELS.METHOD)
    socket.on(CHANNELS.METHOD, async ({ method, params }: SocketMethodRequest, cb = (..._callback: any) => { /* Empty */ }) => {
      runClientMethod.bind(this)({
        type: "socket",
        socket,
        method,
        params
      }).then(res => {
        cb(null, res)
      }).catch(err => {
        makeSocketError(cb, err)
      });
    });

    this.pushSocketSchema(socket);
  } catch (e) {
    console.trace("setSocketEvents: ", e)
  }
}


export function makeSocketError(cb: (err: AnyObject) => void, err: any) {
  cb(getErrorAsObject(err));
}

type SocketRequestParams = {
  tableName: string;
  command: typeof TABLE_METHODS[number];
  param1: any;
  param2: any;
  param3: any;
}
type SocketMethodRequest = {
  method: string;
  params: any;
}