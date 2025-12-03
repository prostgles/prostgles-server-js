import { isObject } from "prostgles-types";
import type { AuthHandler } from "../AuthHandler";
import type { AuthClientRequest } from "../AuthTypes";
import type { GetUserOrRedirected } from "./handleGetUser";

export async function getSidAndUserFromRequest(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<GetUserOrRedirected> {
  const authStart = Date.now();
  const result = await this.handleGetUser(clientReq);
  if (isObject(result) && result.error) {
    throw result.error;
  }
  await this.prostgles.opts.onLog?.({
    type: "auth",
    command: "getClientInfo",
    duration: Date.now() - authStart,
    sid: isObject(result) ? result.sid : undefined,
    socketId: clientReq.socket?.id,
  });
  return result;
}
