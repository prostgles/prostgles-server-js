import type { Request, Response } from "express";
import { AuthResponse } from "prostgles-types";
import { HTTP_FAIL_CODES } from "../AuthHandler";
import { AuthRegistrationConfig } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";

export const getConfirmEmailRequestHandler = (
  emailAuthConfig: Extract<
    Required<AuthRegistrationConfig<void>>["email"],
    { signupType: "withPassword" }
  >
) => {
  return async (
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
      const { httpReq, ...clientInfo } = getClientRequestIPsInfo({ httpReq: req });
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
};
