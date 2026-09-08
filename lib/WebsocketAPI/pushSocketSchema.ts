import { CHANNELS, getSerialisableError, type SQLRequest } from "prostgles-types";
import type { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import type { Prostgles } from "../Prostgles";
import { runClientSqlRequest } from "../runClientRequest";
import { makeSocketError } from "./onSocketConnected";
export async function pushSocketSchema(this: Prostgles, socket: PRGLIOSocket) {
  const isDestroyed = () => this.destroyed;
  if (isDestroyed()) return;
  try {
    const clientSchema = await this.getClientSchema({ socket }, undefined);
    if (isDestroyed()) return;
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
    if (isDestroyed()) return;
    socket.emit(CHANNELS.SCHEMA, clientSchema);
  } catch (err: any) {
    if (isDestroyed()) return;
    socket.emit(CHANNELS.SCHEMA, { err: getSerialisableError(err) });
  }
}
