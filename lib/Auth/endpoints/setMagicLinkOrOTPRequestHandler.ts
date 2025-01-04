import e from "express";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import {
  AUTH_ROUTES_AND_PARAMS,
  AuthHandler,
  getClientRequestIPsInfo,
  HTTP_FAIL_CODES,
} from "../AuthHandler";
import { ExpressReq, LoginSignupConfig, MagicLinkOrOTPData, SessionUser } from "../AuthTypes";
import { throttledAuthCall } from "../utils/throttledReject";
import { LoginResponseHandler } from "./setLoginRequestHandler";

export function setMagicLinkOrOTPRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<LoginSignupConfig<void, SessionUser>>["onMagicLinkOrOTP"],
  app: e.Express
) {
  const handler = async (req: ExpressReq, res: LoginResponseHandler, data: MagicLinkOrOTPData) => {
    try {
      const response = await throttledAuthCall(async () => {
        return onMagicLink(
          data,
          this.dbo as DBOFullyTyped,
          this.db,
          getClientRequestIPsInfo({ httpReq: req })
        );
      });
      if (!response.session) {
        res.status(HTTP_FAIL_CODES.UNAUTHORIZED).json(response.response);
      } else {
        this.setCookieAndGoToReturnURLIFSet(response.session, { req, res });
      }
    } catch (_e) {
      res
        .status(HTTP_FAIL_CODES.UNAUTHORIZED)
        .json({ success: false, code: "something-went-wrong" });
    }
  };
  app.get(AUTH_ROUTES_AND_PARAMS.magicLinksExpressRoute, (req, res: LoginResponseHandler) => {
    const { id } = req.params;

    if (typeof id !== "string" || !id) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "invalid-magic-link", message: "Invalid magic link" });
    }
    return handler(req, res, { type: "magic-link", magicId: id });
  });
  app.post(AUTH_ROUTES_AND_PARAMS.magicLinksRoute, (req, res: LoginResponseHandler) => {
    const { code, email } = req.body;

    if (typeof code !== "string" || !code) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "invalid-otp-code", message: "Invalid code" });
    }
    if (typeof email !== "string" || !email) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: "Invalid email" });
    }
    return handler(req, res, { type: "otp", code, email });
  });
}
