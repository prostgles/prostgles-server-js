import e from "express";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import {
  AUTH_ROUTES_AND_PARAMS,
  AuthHandler,
  getClientRequestIPsInfo,
  HTTP_FAIL_CODES,
} from "../AuthHandler";
import { ExpressConfig, ExpressReq, SessionUser } from "../AuthTypes";
import { LoginResponseHandler } from "./setLoginRequestHandler";

export function setMagicLinkRequestHandler(
  this: AuthHandler,
  onMagicLink: Required<ExpressConfig<void, SessionUser>>["onMagicLink"],
  app: e.Express
) {
  const result = async (req: ExpressReq, res: LoginResponseHandler) => {
    const { id } = req.params;

    if (typeof id !== "string" || !id) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: "Invalid magic link" });
    } else {
      try {
        const response = await this.throttledFunc(async () => {
          return onMagicLink(
            id,
            this.dbo as DBOFullyTyped,
            this.db,
            getClientRequestIPsInfo({ httpReq: req, res })
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
  app.get(AUTH_ROUTES_AND_PARAMS.magicLinksExpressRoute, result);
  return result;
}
