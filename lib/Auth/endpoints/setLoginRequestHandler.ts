import e, { Response } from "express";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { BasicSession, LoginParams } from "../AuthTypes";
import { AuthFailure, AuthRequest, AuthResponse, isDefined, isObject } from "prostgles-types";

export type LoginResponseHandler = Response<
  | {
      session: BasicSession;
      response?: AuthResponse.PasswordLoginSuccess | AuthResponse.MagicLinkAuthSuccess;
    }
  | AuthFailure
  | AuthResponse.PasswordLoginFailure
  | AuthResponse.MagicLinkAuthFailure
>;

export function setLoginRequestHandler(this: AuthHandler, app: e.Express) {
  const { registrations } = this.opts.expressConfig ?? {};
  app.post(AUTH_ROUTES_AND_PARAMS.login, async (req, res: LoginResponseHandler) => {
    const loginData = parseLoginData(req.body);
    if ("error" in loginData) {
      return res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: loginData.error });
    }
    try {
      const loginParams: LoginParams = {
        ...loginData,
        magicLinkUrlPath:
          registrations?.websiteUrl &&
          `${registrations.websiteUrl}/${AUTH_ROUTES_AND_PARAMS.magicLinksRoute}`,
        signupType: registrations?.email?.signupType,
        type: "username",
      };

      await this.loginThrottledAndSetCookie(req, res, loginParams);
    } catch (_error) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({ success: false, code: "server-error" });
    }
  });
}

export const parseLoginData = (bodyData: any): AuthRequest.LoginData | { error: string } => {
  const loginData: AuthRequest.LoginData = {
    username: "",
    remember_me: !!bodyData?.remember_me,
  };

  (["username", "password", "totp_token", "totp_recovery_code"] as const).forEach((prop) => {
    const valOrError = getStringOrUndefined(bodyData[prop], prop);
    if (isObject(valOrError)) {
      return valOrError;
    }
    if (prop === "username") {
      if (!isDefined(valOrError)) {
        return { error: "username error: Expected non-empty string" };
      }
      loginData[prop] = valOrError;
    } else {
      loginData[prop] = valOrError;
    }
  });

  return loginData;
};

const getStringOrUndefined = (
  val: any,
  propName: string
): string | undefined | { error: string } => {
  const isStringOrUndefined = typeof val === "string" || val === undefined;
  if (!isStringOrUndefined) return { error: `${propName} error: Expected string or undefined` };
  return val;
};
