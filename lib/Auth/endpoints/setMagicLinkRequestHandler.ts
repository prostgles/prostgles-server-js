import e from "express";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import {
  AUTH_ROUTES_AND_PARAMS,
  AuthHandler,
  getClientRequestIPsInfo,
  HTTP_FAIL_CODES,
} from "../AuthHandler";
import { ExpressReq, LoginSignupConfig, SessionUser } from "../AuthTypes";
import { throttledAuthCall } from "../utils/throttledReject";
import { LoginResponseHandler } from "./setLoginRequestHandler";

export function setMagicLinkRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<LoginSignupConfig<void, SessionUser>>["onMagicLink"],
  app: e.Express
) {
  const handler = async (req: ExpressReq, res: LoginResponseHandler) => {
    const { id } = req.params;

    if (typeof id !== "string" || !id) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: "Invalid magic link" });
    } else {
      try {
        const response = await throttledAuthCall(async () => {
          return onMagicLink(
            id,
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
    }
  };
  app.get(AUTH_ROUTES_AND_PARAMS.magicLinksExpressRoute, handler);
}
