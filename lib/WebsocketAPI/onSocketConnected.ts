import { AnyObject, CHANNELS } from "prostgles-types";
import type { Prostgles, TABLE_METHODS } from "../Prostgles";
import { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import { runClientMethod, runClientRequest } from "../runClientRequest";
import { getErrorAsObject } from "../DboBuilder/dboBuilderUtils";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthResultWithSID, SessionUser } from "../Auth/AuthTypes";

export async function onSocketConnected(this: Prostgles, socket: PRGLIOSocket) {
  if (!this.db || !this.dbo) throw new Error("db/dbo missing");
  if (this.destroyed) {
    console.log("Socket connected to destroyed instance");
    socket.disconnect();
    return;
  }

  const { dbo, db } = this;
  this.connectedSockets.push(socket);

  try {
    const getUser = async (): Promise<AuthResultWithSID<SessionUser>> => {
      if (!this.authHandler) return { sid: undefined, user: undefined };
      const res = await this.authHandler.getSidAndUserFromRequest({ socket });
      if (res === "new-session-redirect") {
        socket.emit(CHANNELS.AUTHGUARD, {
          shouldReload: true,
          error: res,
        });
        throw "new-session-redirect";
      }
      return res;
    };

    socket.on("disconnect", () => {
      this.dbEventsManager?.removeNotice(socket);
      this.dbEventsManager?.removeNotify(undefined, socket);
      this.connectedSockets = this.connectedSockets.filter((s) => s.id !== socket.id);
      this.dboBuilder.queryStreamer.onDisconnect(socket.id);
      void this.opts.onLog?.({
        type: "disconnect",
        sid: this.authHandler?.getValidatedSid({ socket }),
        socketId: socket.id,
        connectedSocketIds: this.connectedSockets.map((s) => s.id),
      });

      if (this.opts.onSocketDisconnect) {
        void this.opts.onSocketDisconnect({ socket, dbo: dbo as DBOFullyTyped, db, getUser });
      }
    });

    await this.opts.onLog?.({
      type: "connect",
      sid: this.authHandler?.getValidatedSid({ socket }),
      socketId: socket.id,
      connectedSocketIds: this.connectedSockets.map((s) => s.id),
    });

    const { onUseOrSocketConnected } = this.opts.auth ?? {};
    const { authHandler } = this;
    if (onUseOrSocketConnected) {
      if (!authHandler) {
        throw "authHandler missing";
      }
      const errorInfo = await onUseOrSocketConnected(
        authHandler.getValidatedSid({ socket }),
        getClientRequestIPsInfo({ socket }),
        { socket }
      );
      if (errorInfo) {
        socket.emit(CHANNELS.CONNECTION, {
          error: "error" in errorInfo ? errorInfo.error : "New session setup",
        });
        socket.disconnect();
        return;
      }
    }
    if (this.opts.onSocketConnect) {
      try {
        await this.opts.onSocketConnect({
          socket,
          dbo: dbo as DBOFullyTyped,
          db,
          getUser,
        });
      } catch (error) {
        const connectionError =
          error instanceof Error ? error.message
          : typeof error === "string" ? error
          : JSON.stringify(error);
        socket.emit(CHANNELS.CONNECTION, { connectionError });
        socket.disconnect();

        return;
      }
    }

    socket.removeAllListeners(CHANNELS.DEFAULT);
    socket.on(
      CHANNELS.DEFAULT,
      (
        args: SocketRequestParams,
        cb = (..._callback: any[]) => {
          /* Empty */
        }
      ) => {
        runClientRequest
          .bind(this)(args, { socket })
          .then((res) => {
            cb(null, res);
          })
          .catch((err) => {
            cb(err);
          });
      }
    );

    socket.removeAllListeners(CHANNELS.METHOD);
    socket.on(
      CHANNELS.METHOD,
      (
        { method, params }: SocketMethodRequest,
        cb = (..._callback: any) => {
          /* Empty */
        }
      ) => {
        runClientMethod
          .bind(this)(
            {
              method,
              params,
            },
            {
              socket,
            }
          )
          .then((res) => {
            cb(null, res);
          })
          .catch((err) => {
            makeSocketError(cb, err);
          });
      }
    );

    await this.pushSocketSchema(socket);
  } catch (e) {
    console.trace("setSocketEvents: ", e);
  }
}

export function makeSocketError(cb: (err: AnyObject) => void, err: any) {
  cb(getErrorAsObject(err));
}

type SocketRequestParams = {
  tableName: string;
  command: (typeof TABLE_METHODS)[number];
  param1: any;
  param2: any;
  param3: any;
};
type SocketMethodRequest = {
  method: string;
  params: any;
};
