import type { Request, Response } from "express";
import type e from "express";
import type { DBOFullyTyped } from "../../DBSchemaBuilder/DBSchemaBuilder";
import type { AuthHandler } from "../AuthHandler";
import { AUTH_ROUTES_AND_PARAMS } from "../AuthHandler";
import { throttledReject } from "../utils/throttledReject";

export function setLogoutRequestHandler(this: AuthHandler, app: e.Express) {
  const logoutRequestHandler = async (req: Request, res: Response) => {
    const sid = this.validateSid(req.cookies?.[this.sidKeyName]);
    if (sid) {
      try {
        await throttledReject(async () => {
          return this.opts.loginSignupConfig?.logout(
            req.cookies?.[this.sidKeyName],
            this.dbo as DBOFullyTyped,
            this.db
          );
        });
      } catch (err) {
        console.error(err);
      }
    }
    res.redirect("/");
  };
  app.post(AUTH_ROUTES_AND_PARAMS.logout, logoutRequestHandler);
}
