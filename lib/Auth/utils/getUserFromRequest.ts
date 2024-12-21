import { AuthHandler, getClientRequestIPsInfo } from "../AuthHandler";
import { AuthClientRequest, AuthResultWithSID } from "../AuthTypes";

/**
 * For a given sid return the user data if available
 */
export async function getUserFromRequest(
  this: AuthHandler,
  maybeClientReq: AuthClientRequest | undefined
): Promise<AuthResultWithSID> {
  if (!maybeClientReq) return undefined;
  /**
   * Get cached session if available
   */
  const getSession = this.opts.cacheSession?.getSession;
  if (maybeClientReq.socket && getSession && maybeClientReq.socket.__prglCache) {
    const { session, user, clientUser } = maybeClientReq.socket.__prglCache;
    const isValid = this.isNonExpiredSocketSession(maybeClientReq.socket, session);
    if (isValid) {
      return {
        sid: session.sid,
        user,
        clientUser,
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
  const result = await this.throttledFunc(async () => {
    const { getUser } = this.opts;

    const sid = this.getSID(maybeClientReq);
    const clientInfoOrErr =
      !sid ? undefined : (
        await getUser(sid, this.dbo as any, this.db, getClientRequestIPsInfo(maybeClientReq))
      );
    if (typeof clientInfoOrErr === "string") throw clientInfoOrErr;
    const clientInfo = clientInfoOrErr;
    if (getSession && maybeClientReq.socket) {
      const session = await getSession(sid, this.dbo as any, this.db);
      if (session && session.expires && clientInfo?.user) {
        maybeClientReq.socket.__prglCache = {
          session,
          user: clientInfo.user,
          clientUser: clientInfo.clientUser,
        };
      }
    }

    if (clientInfo?.user && sid) {
      return { sid, ...clientInfo };
    }

    return { sid };
  }, 5);

  await this.prostgles.opts.onLog?.({
    type: "auth",
    command: "getClientInfo",
    duration: Date.now() - authStart,
    sid: result.sid,
    socketId: maybeClientReq.socket?.id,
  });
  return result;
}
