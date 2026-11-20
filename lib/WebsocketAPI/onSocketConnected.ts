import type { AnyObject, SocketFunctionCall } from "prostgles-types";
import { CHANNELS, getSerialisableError, isObject, tryCatchV2 } from "prostgles-types";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthResultWithSID, SessionUser } from "../Auth/AuthTypes";
import type { ClientSocketWithCachedData } from "../DboBuilder/DboBuilderTypes";
import type { DBHandlerServer } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Prostgles, TABLE_METHODS } from "../Prostgles";
import { runClientMethod, runClientRequest } from "../runClientRequest";

export async function onSocketConnected(this: Prostgles, socket: ClientSocketWithCachedData) {
  const isDestroyed = () => this.destroyed;
  if (isDestroyed()) {
    console.log("Socket connected to destroyed instance");
    socket.disconnect();
    return;
  }
  if (!this.db || !this.dbo) throw new Error("db/dbo missing");

  const { dbo, db } = this;
  this.connectedSockets.push(socket);

  try {
    const connectionAuthChecks = new WeakMap<
      Prostgles["authHandler"],
      Promise<Prostgles["authHandler"] | undefined>
    >();
    const checkConnectionAuth = () => {
      const { authHandler } = this;
      const existingCheck = connectionAuthChecks.get(authHandler);
      if (existingCheck) return existingCheck;
      const check = (async () => {
        const errorInfo = await this.opts.auth?.onUseOrSocketConnected?.(
          authHandler.getValidatedSid({ socket }),
          getClientRequestIPsInfo({ socket }),
          { socket },
        );
        if (!errorInfo) return authHandler;
        socket.emit(CHANNELS.CONNECTION, {
          error: "error" in errorInfo ? errorInfo.error : "New session setup",
        });
        socket.disconnect();
      })();
      connectionAuthChecks.set(authHandler, check);
      return check;
    };

    const getUser = async (
      authHandler = this.authHandler,
    ): Promise<AuthResultWithSID<SessionUser>> => {
      if (this.authHandler !== authHandler) {
        if (!isDestroyed() && socket.connected && socket.conn.readyState === "open") {
          connectionAuth = await checkConnectionAuth();
          if (connectionAuth) return getUser(connectionAuth);
        }
        throw new Error("Socket closed during authentication");
      }
      const lookup = await tryCatchV2(() => authHandler.getSidAndUserFromRequest({ socket }));
      if (this.authHandler !== authHandler) return getUser(authHandler);
      if (lookup.hasError) throw lookup.error;
      const res = lookup.data;
      if (res === "new-session-redirect") {
        socket.emit(CHANNELS.AUTH_GUARD, {
          shouldReload: true,
          error: res,
        });
        throw "new-session-redirect";
      }
      return res;
    };

    socket.on("disconnect", () => {
      const sid = this.authHandler.getValidatedSid({ socket });
      void this.opts.onLog?.({
        type: "disconnect",
        sid,
        socketId: socket.id,
        connectedSocketIds: this.connectedSockets.map((s) => s.id),
      });
      this.dbEventsManager?.removeNotice(socket);
      this.dbEventsManager?.removeNotify(undefined, socket);
      this.connectedSockets = this.connectedSockets.filter((s) => s.id !== socket.id);
      this.dboBuilder.queryStreamer.onDisconnect(socket.id);
      this.dboBuilder.dboMap.forEach((tableHandler) => {
        tableHandler.activeQueries.forEach((activeQuery) => {
          if (activeQuery.socketId === socket.id) {
            activeQuery.abort();
          }
        });
      });

      void this.opts.onSocketDisconnect?.({
        socket,
        sid,
        dbo: dbo as DBHandlerServer,
        db,
        getUser,
      });
    });

    await this.opts.onLog?.({
      type: "connect",
      sid: this.authHandler.getValidatedSid({ socket }),
      socketId: socket.id,
      connectedSocketIds: this.connectedSockets.map((s) => s.id),
    });

    if (isDestroyed()) return;
    let connectionAuth = await checkConnectionAuth();
    if (!connectionAuth || isDestroyed()) return;
    if (this.opts.onSocketConnect) {
      try {
        await this.opts.onSocketConnect({
          socket,
          dbo: dbo as DBHandlerServer,
          db,
          getUser: () => getUser(connectionAuth),
        });
      } catch (error) {
        if (!socket.connected) return;
        const connectionError =
          error instanceof Error ? error.message
          : typeof error === "string" ? error
          : JSON.stringify(error);
        socket.emit(CHANNELS.CONNECTION, { connectionError });
        socket.disconnect();

        return;
      }
    }

    if (isDestroyed()) return;
    socket.removeAllListeners(CHANNELS.DEFAULT);
    socket.on(
      CHANNELS.DEFAULT,
      (
        args: SocketRequestParams,
        cb = (..._callback: any[]) => {
          /* Empty */
        },
      ) => {
        runClientRequest
          .bind(this)(args, { socket }, undefined)
          .then((res) => {
            cb(null, res);
          })
          .catch((err) => {
            cb(err);
          });
      },
    );

    socket.removeAllListeners(CHANNELS.METHOD);
    socket.on(
      CHANNELS.METHOD,
      (
        { name, input }: SocketFunctionCall,
        cb = (..._callback: any) => {
          /* Empty */
        },
      ) => {
        runClientMethod
          .bind(this)(
            {
              name,
              input,
            },
            {
              socket,
            },
          )
          .then((res) => {
            cb(null, res);
          })
          .catch((err) => {
            makeSocketError(cb, err);
          });
      },
    );

    this.socketsReadyForSchema.add(socket);
    await this.pushSocketSchema(socket);
  } catch (e) {
    console.trace("setSocketEvents: ", e);
  }
}

export function makeSocketError(cb: (err: AnyObject) => void, err: any) {
  const serializedError = getSerialisableError(err);
  cb(isObject(serializedError) ? serializedError : { error: serializedError });
}

type SocketRequestParams = {
  tableName: string;
  command: (typeof TABLE_METHODS)[number];
  param1: any;
  param2: any;
  param3: any;
};
