import e, { Request, Response } from "express";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "../AuthHandler";
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
