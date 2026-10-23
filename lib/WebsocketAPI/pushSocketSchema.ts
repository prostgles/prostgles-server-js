import { CHANNELS, getSerialisableError, type SQLRequest } from "prostgles-types";
import type { ClientSocketWithCachedData } from "../DboBuilder/DboBuilderTypes";
import type { Prostgles } from "../Prostgles";
import { runClientSqlRequest } from "../runClientRequest";
import { makeSocketError } from "./onSocketConnected";
export async function pushSocketSchema(this: Prostgles, socket: ClientSocketWithCachedData) {
  const { authHandler } = this;
  const isInvalidated = () =>
    this.destroyed ||
    this.authHandler !== authHandler ||
    !socket.connected ||
    socket.conn.readyState !== "open";
  if (isInvalidated()) return;
  try {
    const clientSchema = await this.getClientSchema({ socket }, undefined);
    if (isInvalidated()) return;
    socket.prostgles ??= new Map();
    socket.prostgles.set(this.appId, clientSchema);
    if (clientSchema.rawSQL) {
      socket.removeAllListeners(CHANNELS.SQL);
      socket.on(
        CHANNELS.SQL,
        (
          sqlRequestData: SQLRequest,
          cb = (..._callback: any) => {
            /* Empty */
          },
        ) => {
          runClientSqlRequest
            .bind(this)(sqlRequestData, { socket })
            .then((res) => {
              cb(null, res);
            })
            .catch((err) => {
              makeSocketError(cb, err);
            });
        },
      );
    }
    await this.dboBuilder.prostgles.opts.onLog?.({
      type: "debug",
      command: "pushSocketSchema",
      duration: -1,
      data: { socketId: socket.id, clientSchema },
    });
    if (isInvalidated()) return;
    socket.emit(CHANNELS.SCHEMA, clientSchema);
  } catch (err: any) {
    if (isInvalidated()) return;
    socket.emit(CHANNELS.SCHEMA, { err: getSerialisableError(err) });
  }
}
