import { DBOFullyTyped } from "../../DBSchemaBuilder";
import { AuthHandler, getClientRequestIPsInfo } from "../AuthHandler";
import { AuthClientRequest, AuthResultWithSID } from "../AuthTypes";
import { throttledReject } from "./throttledReject";

/**
 * For a given sid return the user data if available using the auth handler's getUser method.
 * Use socket session cache if configured in Auth
 */
export async function getSidAndUserFromRequest(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<AuthResultWithSID> {
  /**
   * Get cached session if available
   */
  const getSession = this.opts.cacheSession?.getSession;
  if (clientReq.socket && getSession && clientReq.socket.__prglCache) {
    const { session, ...userData } = clientReq.socket.__prglCache;
    const isValid = this.isNonExpiredSocketSession(clientReq.socket, session);
    if (isValid) {
      return {
        ...userData,
        sid: session.sid,
      };
    } else
      return {
        sid: session.sid,
      };
  }

  /**
   * Get sid from request and fetch user data
   */
  const authStart = Date.now();
  const result = await throttledReject(async () => {
    const { getUser } = this.opts;

    const sid = this.getSID(clientReq);
    const clientInfoOrErr =
      !sid ? undefined : (
        await getUser(sid, this.dbo as DBOFullyTyped, this.db, getClientRequestIPsInfo(clientReq))
      );
    if (typeof clientInfoOrErr === "string") throw clientInfoOrErr;
    const clientInfo = clientInfoOrErr;
    if (getSession && clientReq.socket) {
      const session = await getSession(sid, this.dbo as DBOFullyTyped, this.db);
      if (session && session.expires && clientInfo?.user) {
        clientReq.socket.__prglCache = {
          ...clientInfo,
          session,
        };
      }
    }

    if (clientInfo?.user && sid) {
      return { sid, ...clientInfo };
    }

    return { sid };
  }, 100);

  await this.prostgles.opts.onLog?.({
    type: "auth",
    command: "getClientInfo",
    duration: Date.now() - authStart,
    sid: result.sid,
    socketId: clientReq.socket?.id,
  });
  return result;
}
