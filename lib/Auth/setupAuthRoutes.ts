import { RequestHandler } from "express";
import { AuthHandler, getClientRequestIPsInfo } from "./AuthHandler";
import { setCatchAllRequestHandler } from "./endpoints/setCatchAllRequestHandler";
import { setLoginRequestHandler } from "./endpoints/setLoginRequestHandler";
import { setLogoutRequestHandler } from "./endpoints/setLogoutRequestHandler";
import { setMagicLinkOrOTPRequestHandler } from "./endpoints/setMagicLinkOrOTPRequestHandler";
import { setOAuthRequestHandlers } from "./endpoints/setOAuthRequestHandlers";
import { setRegisterRequestHandler } from "./endpoints/setRegisterRequestHandler";
import { upsertNamedExpressMiddleware } from "./utils/upsertNamedExpressMiddleware";

export function setupAuthRoutes(this: AuthHandler) {
  const { loginSignupConfig, onUseOrSocketConnected } = this.opts;

  if (this.sidKeyName === "sid") {
    throw "sidKeyName cannot be 'sid' due to collision with socket.io";
  }

  if (!loginSignupConfig) {
    return;
  }
  const {
    app,
    publicRoutes = [],
    onMagicLinkOrOTP,
    loginWithOAuth,
    signupWithEmail,
  } = loginSignupConfig;
  if (publicRoutes.find((r) => typeof r !== "string" || !r)) {
    throw "Invalid or empty string provided within publicRoutes ";
  }

  if (signupWithEmail) {
    setRegisterRequestHandler(signupWithEmail, app);
  }

  if (loginWithOAuth) {
    setOAuthRequestHandlers.bind(this)(app, loginWithOAuth);
  }

  if (onUseOrSocketConnected) {
    const prostglesUseMiddleware: RequestHandler = async (req, res, next) => {
      const reqInfo = { httpReq: req, res };
      const errorInfoOrSession = await onUseOrSocketConnected(
        this.getSIDNoError(reqInfo),
        getClientRequestIPsInfo(reqInfo),
        reqInfo
      );

      if (errorInfoOrSession && "error" in errorInfoOrSession) {
        const { error, httpCode } = errorInfoOrSession;
        res.status(httpCode).json({ error });
        return;
      }

      if (errorInfoOrSession && "session" in errorInfoOrSession) {
        const { session } = errorInfoOrSession;
        return this.validateSessionAndSetCookie(session, { req, res });
      }
      next();
    };
    upsertNamedExpressMiddleware(app, prostglesUseMiddleware, "prostglesonUseOrSocketConnected");
  }

  if (onMagicLinkOrOTP) {
    setMagicLinkOrOTPRequestHandler.bind(this)(onMagicLinkOrOTP, app);
  }

  setLoginRequestHandler.bind(this)(app);

  /* Redirect if not logged in and requesting non public content */
  setCatchAllRequestHandler.bind(this)(app);

  setLogoutRequestHandler.bind(this)(app);
}
