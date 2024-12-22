import e from "express";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { LoginParams } from "../AuthTypes";

export function setLoginRequestHandler(this: AuthHandler, app: e.Express) {
  app.post(AUTH_ROUTES_AND_PARAMS.login, async (req, res) => {
    try {
      const loginParams: LoginParams = {
        type: "username",
        ...req.body,
      };

      await this.loginThrottledAndSetCookie(req, res, loginParams);
    } catch (error) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({ error });
    }
  });
}
