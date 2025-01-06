import { RequestHandler } from "express";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AuthHandler, HTTP_FAIL_CODES } from "./AuthHandler";
import { setCatchAllRequestHandler } from "./endpoints/setCatchAllRequestHandler";
import { setLoginRequestHandler } from "./endpoints/setLoginRequestHandler";
import { setMagicLinkOrOTPRequestHandler } from "./endpoints/setMagicLinkOrOTPRequestHandler";
import { setOAuthRequestHandlers } from "./endpoints/setOAuthRequestHandlers";
import { setRegisterRequestHandler } from "./endpoints/setRegisterRequestHandler";
import { upsertNamedExpressMiddleware } from "./utils/upsertNamedExpressMiddleware";
import { setLogoutRequestHandler } from "./endpoints/setLogoutRequestHandler";

export async function setupAuthRoutes(this: AuthHandler) {
  const { loginSignupConfig } = this.opts;

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
    use,
    loginWithOAuth,
    signupWithEmail: signupWithEmailAndPassword,
  } = loginSignupConfig;
  if (publicRoutes.find((r) => typeof r !== "string" || !r)) {
    throw "Invalid or empty string provided within publicRoutes ";
  }

  if (signupWithEmailAndPassword) {
    setRegisterRequestHandler(signupWithEmailAndPassword, app);
  }

  if (loginWithOAuth) {
    await setOAuthRequestHandlers.bind(this)(app, loginWithOAuth);
  }

  if (use) {
    const prostglesUseMiddleware: RequestHandler = (req, res, next) => {
      void use({
        req,
        res,
        next,
        getUser: async () => {
          const userOrErr = await this.getUserOrError({ httpReq: req, res });
          if (userOrErr.error) {
            res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(userOrErr.error);
            throw userOrErr.error;
          }
          return userOrErr;
        },
        dbo: this.dbo as DBOFullyTyped,
        db: this.db,
      });
    };
    upsertNamedExpressMiddleware(app, prostglesUseMiddleware, "prostglesUseMiddleware");
  }

  if (onMagicLinkOrOTP) {
    setMagicLinkOrOTPRequestHandler.bind(this)(onMagicLinkOrOTP, app);
  }

  setLoginRequestHandler.bind(this)(app);

  /* Redirect if not logged in and requesting non public content */
  setCatchAllRequestHandler.bind(this)(app);

  setLogoutRequestHandler.bind(this)(app);
}
