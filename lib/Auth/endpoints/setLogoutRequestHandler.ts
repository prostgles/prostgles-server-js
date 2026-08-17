import type e from "express";
import type { Request, Response } from "express";
import type { AuthHandler } from "../AuthHandler";
import { throttledReject } from "../utils/throttledReject";
import type { AuthConfig } from "../AuthTypes";

export function setLogoutRequestHandler(this: AuthHandler, app: e.Express, config: AuthConfig) {
  const logoutRequestHandler = async (req: Request, res: Response) => {
    const sid = this.validateSid(req.cookies?.[this.sidKeyName]);
    if (sid) {
      try {
        await throttledReject(async () => {
          const { db, dbo } = this.dbHandles;
          return config.loginSignupConfig?.logout(req.cookies?.[this.sidKeyName], dbo, db);
        });
      } catch (err) {
        console.error(err);
      }
    }
    res.redirect("/");
  };
  app.post(this.authRoutes.logout, logoutRequestHandler);
}
