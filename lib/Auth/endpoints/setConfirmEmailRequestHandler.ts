import type { Request, Response } from "express";
import { AuthResponse } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, HTTP_FAIL_CODES } from "../AuthHandler";
import { AuthRegistrationConfig } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import e from "express";

export const setConfirmEmailRequestHandler = (
  emailAuthConfig: Extract<
    Required<AuthRegistrationConfig<void>>["email"],
    { signupType: "withPassword" }
  >,
  app: e.Express
) => {
  const requestHandler = async (
    req: Request,
    res: Response<
      | AuthResponse.PasswordRegisterSuccess
      | AuthResponse.PasswordRegisterFailure
      | AuthResponse.AuthSuccess
    >
  ) => {
    const { id } = req.params;
    try {
      if (!id || typeof id !== "string") {
        return res.send({ success: false, code: "something-went-wrong", message: "Invalid code" });
      }
      const { httpReq, ...clientInfo } = getClientRequestIPsInfo({ httpReq: req, res });
      await emailAuthConfig.onEmailConfirmation({
        confirmationCode: id,
        clientInfo,
        req: httpReq,
      });
      res.json({ success: true, message: "Email confirmed" });
    } catch (_e) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "server-error", message: "Failed to confirm email" });
    }
  };

  app.get(AUTH_ROUTES_AND_PARAMS.confirmEmailExpressRoute, requestHandler);
};
