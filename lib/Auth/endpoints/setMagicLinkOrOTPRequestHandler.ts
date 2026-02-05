import type e from "express";
import { type Response } from "express";
import type { AuthResponse } from "prostgles-types";
import type { AuthHandler } from "../AuthHandler";
import { getClientRequestIPsInfo, HTTP_FAIL_CODES, HTTP_SUCCESS_CODES } from "../AuthHandler";
import type { ExpressReq, LoginSignupConfig, MagicLinkOrOTPData, SessionUser } from "../AuthTypes";
import { throttledAuthCall } from "../utils/throttledReject";
import type { LoginResponse } from "./setLoginRequestHandler";

type MagicLinkResponseHandler = Response<
  | LoginResponse
  | AuthResponse.PasswordRegisterEmailConfirmationSuccess
  | AuthResponse.PasswordRegisterEmailConfirmationFailure
>;

export function setMagicLinkOrOTPRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<LoginSignupConfig<void, SessionUser>>["onMagicLinkOrOTP"],
  app: e.Express,
) {
  const handler = async (
    req: ExpressReq,
    res: MagicLinkResponseHandler,
    data: MagicLinkOrOTPData,
  ) => {
    try {
      const response = await throttledAuthCall(async () => {
        const { db, dbo } = this.dbHandles;
        return onMagicLink(data, dbo, db, getClientRequestIPsInfo({ httpReq: req }));
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

  app.get(this.authRoutes.magicLinkWithId, (req, res: MagicLinkResponseHandler) => {
    const { id } = req.params;

    if (typeof id !== "string" || !id) {
      return res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "invalid-magic-link", message: "Invalid magic link" });
    }
    return handler(req, res, { type: "magic-link", id, returnToken: false });
  });

  app.get(this.authRoutes.magicLinks, (req, res: MagicLinkResponseHandler) => {
    const data = parseMagicLinkOrOTPData(res, req.query);
    if (!data) return;
    return handler(req, res, data);
  });

  app.post(this.authRoutes.magicLinks, (req, res: MagicLinkResponseHandler) => {
    const data = parseMagicLinkOrOTPData(res, req.body);
    if (!data) return;
    return handler(req, res, data);
  });
}

const parseMagicLinkOrOTPData = (res: Response, data: any): MagicLinkOrOTPData | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
