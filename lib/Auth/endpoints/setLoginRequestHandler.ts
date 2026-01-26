import type e from "express";
import type { Response } from "express";
import type { AuthRequest, AuthResponse } from "prostgles-types";
import { getJSONBSchemaValidationError } from "prostgles-types";
import type { AuthHandler } from "../AuthHandler";
import { HTTP_FAIL_CODES } from "../AuthHandler";
import type { LoginParams } from "../AuthTypes";

export type LoginResponse =
  | AuthResponse.OAuthRegisterSuccess
  | AuthResponse.OAuthRegisterFailure
  | AuthResponse.PasswordLoginFailure
  | AuthResponse.MagicLinkAuthFailure
  | AuthResponse.MagicLinkAuthSuccess
  | AuthResponse.CodeVerificationFailure;
export type LoginResponseHandler = Response<LoginResponse>;

export function setLoginRequestHandler(this: AuthHandler, app: e.Express) {
  app.post(this.authRoutes.login, async (req, res: LoginResponseHandler) => {
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
  bodyData: any,
): [string, undefined] | [undefined, AuthRequest.LoginData] => {
  const loginDataValidation = getJSONBSchemaValidationError(
    {
      type: {
        username: "string",
        password: { type: "string", optional: true },
        remember_me: { type: "boolean", optional: true },
        totp_token: { type: "string", optional: true },
        totp_recovery_code: { type: "string", optional: true },
      },
    },
    bodyData,
  );

  if (loginDataValidation.error !== undefined) {
    return [loginDataValidation.error, undefined];
  }
  const loginData = loginDataValidation.data;

  return [undefined, loginData];
};
