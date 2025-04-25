import { AuthResponse } from "prostgles-types";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import type { AuthHandler } from "../AuthHandler";
import { AuthClientRequest, AuthResultWithSID } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { isAuthError, type GetUserOrRedirected } from "./handleGetUser";
import { throttledAuthCall } from "./throttledReject";

/**
 * Used by:
 *  - setCatchAllRequestHandler
 *  - loginSignupConfig.use
 */
export async function getUserOrError(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<GetUserOrRedirected> {
  // const sid = this.getValidatedSid(clientReq);
  // if (!sid) return { sid };

  try {
    // const userOrErrorCode = await throttledAuthCall(async () => {
    //   return this.opts.getUser(
    //     this.validateSid(sid),
    //     this.dbo as DBOFullyTyped,
    //     this.db,
    //     getClientRequestIPsInfo(clientReq),
    //     clientReq
    //   );
    // }, 50);

    // if (isAuthError(userOrErrorCode)) {
    //   const error: AuthResponse.AuthFailure | undefined =
    //     typeof userOrErrorCode === "string" ?
    //       { success: false, code: userOrErrorCode }
    //     : userOrErrorCode;

    //   return {
    //     sid,
    //     error,
    //   };
    // }
    // if (sid && userOrErrorCode?.user) {
    //   return { sid, ...userOrErrorCode };
    // }
    // return {
    //   sid,
    // };
    return this.handleGetUser(clientReq);
  } catch (_err) {
    return {
      sid: this.getValidatedSid(clientReq),
      error: { success: false, code: "server-error" },
    };
  }
}
