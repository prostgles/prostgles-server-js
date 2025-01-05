import e, { Response } from "express";
import { AuthRequest, AuthResponse, isDefined, isObject } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { LoginParams } from "../AuthTypes";

export type LoginResponse =
  | AuthResponse.OAuthRegisterSuccess
  | AuthResponse.OAuthRegisterFailure
  | AuthResponse.PasswordLoginSuccess
  | AuthResponse.PasswordLoginFailure
  | AuthResponse.MagicLinkAuthFailure
  | AuthResponse.MagicLinkAuthSuccess
  | AuthResponse.CodeVerificationFailure;
export type LoginResponseHandler = Response<LoginResponse>;

export function setLoginRequestHandler(this: AuthHandler, app: e.Express) {
  app.post(AUTH_ROUTES_AND_PARAMS.login, async (req, res: LoginResponseHandler) => {
    const [error, loginData] = parseLoginData(req.body);
    if (error || !loginData) {
      return res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: error });
    }
    try {
      const loginParams: LoginParams = {
        ...loginData,
        type: "username",
      };

      await this.login(req, res, loginParams);
    } catch (_error) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({ success: false, code: "server-error" });
    }
  });
}

export const parseLoginData = (
  bodyData: any
): [string, undefined] | [undefined, AuthRequest.LoginData] => {
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
        return ["username error: Expected non-empty string"];
      }
      loginData[prop] = valOrError;
    } else {
      loginData[prop] = valOrError;
    }
  });

  return [undefined, loginData];
};

const getStringOrUndefined = (
  val: any,
  propName: string
): string | undefined | { error: string } => {
  const isStringOrUndefined = typeof val === "string" || val === undefined;
  if (!isStringOrUndefined) return { error: `${propName} error: Expected string or undefined` };
  return val;
};
