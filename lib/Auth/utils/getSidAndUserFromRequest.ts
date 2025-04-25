import { isObject } from "prostgles-types";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import { AuthHandler, getClientRequestIPsInfo } from "../AuthHandler";
import { AuthClientRequest, AuthResultWithSID } from "../AuthTypes";
import { throttledAuthCall } from "./throttledReject";
import type { GetUserOrRedirected } from "./handleGetUser";

/**
 * For a given sid return the user data if available using the auth handler's getUser method.
 * Use socket session cache if configured in Auth
 * Used in Publish Parser and AuthHandler
 */
export async function getSidAndUserFromRequest(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<GetUserOrRedirected> {
  /**
   * Get cached session if available
   */
  const getSessionForCaching = this.opts.cacheSession?.getSession;
  if (clientReq.socket && getSessionForCaching && clientReq.socket.__prglCache) {
    const { session, userData } = clientReq.socket.__prglCache;
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
  // const result = await throttledAuthCall(async () => {
  //   const clientInfoOrErr = await this.opts.getUser(
  //     this.getValidatedSid(clientReq),
  //     this.dbo as DBOFullyTyped,
  //     this.db,
  //     getClientRequestIPsInfo(clientReq),
  //     clientReq
  //   );
  //   if (clientInfoOrErr && (typeof clientInfoOrErr === "string" || "success" in clientInfoOrErr))
  //     throw clientInfoOrErr;
  //   const clientInfo = clientInfoOrErr;

  //   if (clientInfo && "type" in clientInfo) {
  //     if (!("httpReq" in clientReq) || !clientReq.httpReq) throw "httpReq missing";
  //     const { httpReq, res } = clientReq;
  //     this.setCookieAndGoToReturnURLIFSet(clientInfo.session, { req: httpReq, res });
  //     return;
  //   }

  //   const sid = this.getValidatedSid(clientReq);
  //   if (getSessionForCaching && clientReq.socket && sid) {
  //     const session = await getSessionForCaching(sid, this.dbo as DBOFullyTyped, this.db);
  //     if (session && session.expires && clientInfo?.user) {
  //       clientReq.socket.__prglCache = {
  //         userData: clientInfo,
  //         session,
  //       };
  //     }
  //   }

  //   if (clientInfo?.user && sid) {
  //     return { sid, ...clientInfo };
  //   }

  //   return { sid, preferredLogin: !clientInfo?.user ? clientInfo?.preferredLogin : undefined };
  // }, 100);
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
