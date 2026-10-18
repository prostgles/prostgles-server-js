import type { AuthResponse } from "prostgles-types";
import { isObject } from "prostgles-types";
import { getClientRequestIPsInfo, type AuthHandler } from "../AuthHandler";
import type { AuthClientRequest, AuthResultOrError, AuthResultWithSID } from "../AuthTypes";
import type { LoginResponseHandler } from "../endpoints/setLoginRequestHandler";
import { throttledAuthCall } from "./throttledReject";
import { getServerSideUserId } from "./serverSideRequest";

export type GetUserOrRedirected = AuthResultWithSID | "new-session-redirect";

/**
 * For a given request return the user data if available using the auth handler's getUser method.
 * Used in Publish Parser and AuthHandler
 */
export async function handleGetUserThrottled(
  this: AuthHandler,
  clientReq: AuthClientRequest,
): Promise<GetUserOrRedirected> {
  const config = this.config;
  if (!clientReq.httpReq && !clientReq.socket) {
    const userId = getServerSideUserId(this.prostgles, clientReq);
    if (!userId) throw new Error("Invalid server-side user request");
    if (!config?.findUser) throw new Error("auth.findUser is required for userId requests");
    const user = await config.findUser({ id: userId }, this.dbHandles.dbo);
    if (!user || user.id !== userId) throw new Error("User not found for userId request");
    return {
      sid: undefined,
      user,
      clientUser: { id: user.id, type: user.type },
    } satisfies GetUserOrRedirected;
  }
  if (!config) {
    return {
      sid: undefined,
    };
  }

  const result = await throttledAuthCall(async () => {
    const { db, dbo } = this.dbHandles;
    const clientInfoOrErr = await config.getUser(
      this.getValidatedSid(clientReq),
      dbo,
      db,
      getClientRequestIPsInfo(clientReq),
      clientReq,
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

    const sid = this.getValidatedSid(clientReq);
    if (clientInfo?.user && sid) {
      return { sid, ...clientInfo };
    }

    return { sid, preferredLogin: !clientInfo?.user ? clientInfo?.preferredLogin : undefined };
  }, 100);
  return result;
}

export const isAuthError = (
  dataOrError: AuthResultOrError,
): dataOrError is AuthResponse.AuthFailure["code"] | AuthResponse.AuthFailure => {
  return Boolean(typeof dataOrError === "string" || (dataOrError && "success" in dataOrError));
};
