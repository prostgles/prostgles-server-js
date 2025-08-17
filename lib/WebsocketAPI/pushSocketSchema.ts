import { CHANNELS, getSerialisableError, type SQLRequest } from "prostgles-types";
import type { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import { Prostgles } from "../Prostgles";
import { runClientSqlRequest } from "../runClientRequest";
import { makeSocketError } from "./onSocketConnected";
export async function pushSocketSchema(this: Prostgles, socket: PRGLIOSocket) {
  try {
    const clientSchema = await this.getClientSchema({ socket }, undefined);
    socket.prostgles = clientSchema;
    if (clientSchema.rawSQL) {
      socket.removeAllListeners(CHANNELS.SQL);
      socket.on(
        CHANNELS.SQL,
        (
          sqlRequestData: SQLRequest,
          cb = (..._callback: any) => {
            /* Empty */
          }
        ) => {
          runClientSqlRequest
            .bind(this)(sqlRequestData, { socket })
            .then((res) => {
              cb(null, res);
            })
            .catch((err) => {
              makeSocketError(cb, err);
            });
        }
      );
    }
    await this.dboBuilder.prostgles.opts.onLog?.({
      type: "debug",
      command: "pushSocketSchema",
      duration: -1,
      data: { socketId: socket.id, clientSchema },
    });
    socket.emit(CHANNELS.SCHEMA, clientSchema);
  } catch (err: any) {
    socket.emit(CHANNELS.SCHEMA, { err: getSerialisableError(err) });
  }
}
