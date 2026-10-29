import type e from "express";
import type { AuthHandler } from "../AuthHandler";
import { getClientRequestIPsInfo, HTTP_FAIL_CODES } from "../AuthHandler";
import type { LoginSignupConfig, MagicLinkOrOTPData, SessionUser } from "../AuthTypes";
import { throttledAuthCall } from "../utils/throttledReject";
import { createAuthRequestHandler } from "../utils/createAuthRequestHandler";

export function setMagicLinkOrOTPRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<LoginSignupConfig<void, SessionUser>>["onMagicLinkOrOTP"],
  app: e.Express,
) {
  const createMagicLinkOrOTPHandler = (dataSource: "body" | "params" | "query") =>
    createAuthRequestHandler(
      "magicLinkOrOTP",
      async ({ returnToken = false, ...request }, req, res) => {
        if (
          "id" in request ?
            typeof request.id !== "string" || !request.id
          : !request.email || !request.code
        ) {
          res
            .status(HTTP_FAIL_CODES.BAD_REQUEST)
            .json({ success: false, code: "something-went-wrong" });
          return;
        }
        const data: MagicLinkOrOTPData =
          "id" in request ?
            { ...request, type: "magic-link", returnToken }
          : { ...request, type: "otp", returnToken };
        const response = await throttledAuthCall(async () => {
          const { db, dbo } = this.dbHandles;
          return onMagicLink(data, dbo, db, getClientRequestIPsInfo({ httpReq: req }));
        });
        if (!response.session) {
          return response.response;
        }
        if (returnToken) {
          return { success: true, token: response.session.sid };
        }
        this.setCookieAndGoToReturnURLIfSet(response.session, { req, res });
      },
      {
        dataSource,
        /* Query strings can also contain returnURL. */
        allowExtraProperties: dataSource === "query",
        failureStatusCode: HTTP_FAIL_CODES.UNAUTHORIZED,
        onError: () => ({ success: false, code: "something-went-wrong" }),
      },
    );

  app.get(this.authRoutes.magicLinkWithId, createMagicLinkOrOTPHandler("params"));
  app.get(this.authRoutes.magicLinks, createMagicLinkOrOTPHandler("query"));
  app.post(this.authRoutes.magicLinks, createMagicLinkOrOTPHandler("body"));
}
