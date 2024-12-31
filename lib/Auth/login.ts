import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AuthHandler, getClientRequestIPsInfo, HTTP_FAIL_CODES } from "./AuthHandler";
import { ExpressReq, LoginParams } from "./AuthTypes";
import { LoginResponseHandler } from "./endpoints/setLoginRequestHandler";
import { throttledAuthCall } from "./utils/throttledReject";

export async function login(
  this: AuthHandler,
  req: ExpressReq,
  res: LoginResponseHandler,
  loginParams: LoginParams
) {
  const start = Date.now();
  const { responseThrottle = 500 } = this.opts;

  const errCodeOrSession = await throttledAuthCall(async () => {
    const { login } = this.opts.loginSignupConfig ?? {};
    if (!login) {
      console.error("Auth login config missing");
      return "server-error";
    }
    const result = await login(
      loginParams,
      this.dbo as DBOFullyTyped,
      this.db,
      getClientRequestIPsInfo({ httpReq: req })
    );

    if (typeof result === "string" || !result.session) {
      return result;
    }

    const { sid, expires } = result.session;
    if (!sid) {
      console.error("Invalid sid");
      return "server-error";
    }
    if (sid && (typeof sid !== "string" || typeof expires !== "number")) {
      console.error(
        "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number }"
      );
      return "server-error";
    }
    if (expires < Date.now()) {
      console.error(
        "auth.login() is returning an expired session. Can only login with a session.expires greater than Date.now()"
      );
      return "server-error";
    }

    return result;
  }, responseThrottle);

  const loginResponse =
    typeof errCodeOrSession === "string" ?
      {
        session: undefined,
        response: { success: false, code: errCodeOrSession } as const,
      }
    : errCodeOrSession;

  await this.prostgles.opts.onLog?.({
    type: "auth",
    command: "login",
    success: !!loginResponse.session,
    duration: Date.now() - start,
    sid: loginResponse.session?.sid,
    socketId: undefined,
  });

  if (!loginResponse.session) {
    if (!loginResponse.response.success) {
      return res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(loginResponse.response);
    }
    return res.json(loginResponse.response);
  }
  this.setCookieAndGoToReturnURLIFSet(loginResponse.session, { req, res });
}

// async function loginThrottledAndValidate(
//   this: AuthHandler,
//   params: LoginParams,
//   client: LoginClientInfo
// ): Promise<Exclude<LoginResponse, { loginWithMagicLink: true }>> {
//   const { responseThrottle = 500 } = this.opts;
//   return throttledFunc(async () => {
//     const { login } = this.opts.expressConfig ?? {};
//     if (!login) {
//       console.error("Auth login config missing");
//       return "server-error";
//     }
//     const result = await login(params, this.dbo as DBOFullyTyped, this.db, client);

//     if (typeof result === "string") return result;

//     // if ("loginWithMagicLink" in result) {
//     //   if (params.type !== "username") {
//     //     console.error("loginWithMagicLink is only supported for username login");
//     //     return "something-went-wrong";
//     //   }
//     //   const emailRegistrations = this.opts.expressConfig?.registrations?.email;
//     //   if (!emailRegistrations || emailRegistrations.signupType !== "withMagicLink") {
//     //     console.error("loginWithMagicLink is not supported");
//     //     return "server-error";
//     //   }

//     //   const res = await emailRegistrations.onRegister({
//     //     email: params.username,
//     //     clientInfo: client,
//     //     magicLinkUrlPath: `${emailRegistrations.websiteUrl}${AUTH_ROUTES_AND_PARAMS.magicLinksRoute}`,
//     //     req,
//     //   });

//     //   if (typeof res === "string") {
//     //     return { response: { success: false, code: res } as const };
//     //   }
//     // }

//     const { sid, expires } = result.session;
//     if (!sid) {
//       console.error("Invalid sid");
//       return "server-error";
//     }
//     if (sid && (typeof sid !== "string" || typeof expires !== "number")) {
//       console.error(
//         "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number }"
//       );
//       return "server-error";
//     }
//     if (expires < Date.now()) {
//       console.error(
//         "auth.login() is returning an expired session. Can only login with a session.expires greater than Date.now()"
//       );
//       return "server-error";
//     }

//     return result;
//   }, responseThrottle);
// }
