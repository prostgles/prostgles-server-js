import type { DBOFullyTyped } from "../../DBSchemaBuilder";
import { tout } from "../../PubSubManager/initPubSubManager";
import { getClientRequestIPsInfo, type AuthHandler } from "../AuthHandler";
import type { AuthClientRequest, AuthResultOrError, AuthResultWithSID } from "../AuthTypes";
import { throttledAuthCall } from "./throttledReject";
import { AuthResponse, isObject } from "prostgles-types";

export async function handleGetUserThrottled(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<AuthResultWithSID> {
  const getSessionForCaching = this.opts.cacheSession?.getSession;
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
      if (!("httpReq" in clientReq) || !clientReq.httpReq)
        throw "httpReq missing. new-session not implemented for sockets.";
      const { httpReq, res } = clientReq;
      this.setCookieAndGoToReturnURLIFSet(clientInfo.session, { req: httpReq, res });
      /** Wait for refresh */
      await tout(200);
      return {
        error: { success: false, code: "something-went-wrong" },
        sid: this.getValidatedSid(clientReq),
      } satisfies AuthResultWithSID;
    }

    const sid = this.getValidatedSid(clientReq);
    if (getSessionForCaching && clientReq.socket && sid) {
      const session = await getSessionForCaching(sid, this.dbo as DBOFullyTyped, this.db);
      if (session && session.expires && clientInfo?.user) {
        clientReq.socket.__prglCache = {
          userData: clientInfo,
          session,
        };
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
