import e, { type Response } from "express";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import {
  AUTH_ROUTES_AND_PARAMS,
  AuthHandler,
  getClientRequestIPsInfo,
  HTTP_FAIL_CODES,
  HTTP_SUCCESS_CODES,
} from "../AuthHandler";
import { ExpressReq, LoginSignupConfig, MagicLinkOrOTPData, SessionUser } from "../AuthTypes";
import { throttledAuthCall } from "../utils/throttledReject";
import { LoginResponse } from "./setLoginRequestHandler";
import { AuthResponse } from "prostgles-types";

type MagicLinkResponseHandler = Response<
  | LoginResponse
  | AuthResponse.PasswordRegisterEmailConfirmationSuccess
  | AuthResponse.PasswordRegisterEmailConfirmationFailure
>;

export function setMagicLinkOrOTPRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<LoginSignupConfig<void, SessionUser>>["onMagicLinkOrOTP"],
  app: e.Express
) {
  const handler = async (
    req: ExpressReq,
    res: MagicLinkResponseHandler,
    data: MagicLinkOrOTPData
  ) => {
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
        res
          .status(response.response?.success ? HTTP_SUCCESS_CODES.OK : HTTP_FAIL_CODES.UNAUTHORIZED)
          .json(response.response);
      } else {
        if (data.returnToken) {
          return res.json({ success: true, token: response.session.sid });
        }
        this.setCookieAndGoToReturnURLIFSet(response.session, { req, res });
      }
    } catch (_e) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong" });
    }
  };

  app.get(AUTH_ROUTES_AND_PARAMS.magicLinkWithId, (req, res: MagicLinkResponseHandler) => {
    const { id } = req.params;

    if (typeof id !== "string" || !id) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "invalid-magic-link", message: "Invalid magic link" });
    }
    return handler(req, res, { type: "magic-link", id, returnToken: false });
  });

  app.get(AUTH_ROUTES_AND_PARAMS.magicLinks, (req, res: MagicLinkResponseHandler) => {
    const data = parseMagicLinkOrOTPData(res, req.query);
    if (!data) return;
    return handler(req, res, data);
  });

  app.post(AUTH_ROUTES_AND_PARAMS.magicLinks, (req, res: MagicLinkResponseHandler) => {
    const data = parseMagicLinkOrOTPData(res, req.body);
    if (!data) return;
    return handler(req, res, data);
  });
}

const parseMagicLinkOrOTPData = (res: Response, data: any): MagicLinkOrOTPData | undefined => {
  const { id, code, email, returnToken = false } = data;

  if (typeof returnToken !== "boolean") {
    res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
      success: false,
      code: "something-went-wrong",
      message: "Invalid magic link request. Must provide returnToken must be of type boolean",
    });
    return;
  }
  const noCode = typeof code !== "string" || !code;
  const noEmail = typeof email !== "string" || !email;
  if (typeof id !== "string" || !id) {
    if (noCode && noEmail) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
        success: false,
        code: "something-went-wrong",
        message: "Invalid magic link. Must provide id or email and code",
      });
      return;
    }
    if (noCode) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
        success: false,
        code: "invalid-otp-code",
        message: "Invalid or empty code",
      });
      return;
    }
    if (noEmail) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
        success: false,
        code: "invalid-email",
        message: "Invalid or empty email",
      });
      return;
    }
    return { type: "otp", code, email, returnToken };
  }
  return { type: "magic-link", id, returnToken };
};
