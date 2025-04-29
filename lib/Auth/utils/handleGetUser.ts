import { AuthResponse, isObject } from "prostgles-types";
import type { DBOFullyTyped } from "../../DBSchemaBuilder";
import { getClientRequestIPsInfo, type AuthHandler } from "../AuthHandler";
import type { AuthClientRequest, AuthResultOrError, AuthResultWithSID } from "../AuthTypes";
import { throttledAuthCall } from "./throttledReject";
import type { LoginResponseHandler } from "../endpoints/setLoginRequestHandler";

export type GetUserOrRedirected = AuthResultWithSID | "new-session-redirect";

/**
 * For a given request return the user data if available using the auth handler's getUser method.
 * Use cache data if configured in Auth
 * Used in Publish Parser and AuthHandler
 */
export async function handleGetUserThrottled(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<GetUserOrRedirected> {
  const getSessionForCaching = this.opts.cacheSession?.getSession;

  /** Get cached session if available */
  const __prglCache =
    !this.opts.cacheSession ? undefined : (clientReq.httpReq ?? clientReq.socket).__prglCache;
  if (clientReq.socket && __prglCache) {
    const { userData, session } = __prglCache;
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

  const result = await throttledAuthCall(async () => {
    const clientInfoOrErr = await this.opts.getUser(
      this.getValidatedSid(clientReq),
      this.dbo as DBOFullyTyped,
      this.db,
      getClientRequestIPsInfo(clientReq),
      clientReq
    );
    if (isAuthError(clientInfoOrErr)) {
      return {
        error:
          isObject(clientInfoOrErr) ? clientInfoOrErr : { success: false, code: clientInfoOrErr },
        sid: this.getValidatedSid(clientReq),
      } satisfies AuthResultWithSID;
    }
    const clientInfo = clientInfoOrErr;

    if (clientInfo && "type" in clientInfo) {
      if (!("httpReq" in clientReq) || !clientReq.httpReq) {
        throw "httpReq missing. new-session not implemented for sockets.";
      }
      const { httpReq, res } = clientReq;
      this.validateSessionAndSetCookie(clientInfo.session, {
        req: httpReq,
        res: res as LoginResponseHandler,
      });
      return "new-session-redirect" as const;
    }

    /** Set cached session data */
    const sid = this.getValidatedSid(clientReq);
    if (getSessionForCaching && sid) {
      const session = await getSessionForCaching(sid, this.dbo as DBOFullyTyped, this.db);
      if (session && session.expires && clientInfo?.user) {
        const __prglCache = {
          userData: clientInfo,
          session,
        };
        if (clientReq.socket) {
          clientReq.socket.__prglCache = __prglCache;
        } else {
          clientReq.httpReq.__prglCache = __prglCache;
        }
      }
    }

    if (clientInfo?.user && sid) {
      return { sid, ...clientInfo };
    }

    return { sid, preferredLogin: !clientInfo?.user ? clientInfo?.preferredLogin : undefined };
  }, 100);
  return result;
}

export const isAuthError = (
  dataOrError: AuthResultOrError
): dataOrError is AuthResponse.AuthFailure["code"] | AuthResponse.AuthFailure => {
  return Boolean(typeof dataOrError === "string" || (dataOrError && "success" in dataOrError));
};
