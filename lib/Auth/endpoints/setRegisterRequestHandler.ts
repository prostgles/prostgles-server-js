import e, { Request, Response } from "express";
import { AuthResponse } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, HTTP_FAIL_CODES } from "../AuthHandler";
import { getMagicLinkUrl, type SignupWithEmail } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { parseLoginData } from "./setLoginRequestHandler";

type ReturnType =
  | AuthResponse.MagicLinkAuthFailure
  | AuthResponse.MagicLinkAuthSuccess
  | AuthResponse.PasswordRegisterFailure
  | AuthResponse.PasswordRegisterSuccess;

type RegisterResponseHandler = Response<ReturnType>;

export const setRegisterRequestHandler = (
  { onRegister, minPasswordLength = 8, requirePassword }: SignupWithEmail,
  app: e.Express
) => {
  const registerRequestHandler = async (req: Request, res: RegisterResponseHandler) => {
    const [error, data] = parseLoginData(req.body);
    if (error || !data) {
      return res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "something-went-wrong", message: error });
    }
    const { username, password = "" } = data;
    const sendResponse = (response: ReturnType) => {
      if (response.success) {
        res.json(response);
      } else {
        res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(response);
      }
    };
    if (!username) {
      return sendResponse({ success: false, code: "username-missing" });
    }
    if (!password && requirePassword) {
      return sendResponse({ success: false, code: "password-missing" });
    } else if (password.length < minPasswordLength) {
      return sendResponse({
        success: false,
        code: "weak-password",
        message: `Password must be at least ${minPasswordLength} characters long`,
      });
    }
    try {
      const clientInfo = getClientRequestIPsInfo({ httpReq: req });
      const result = await onRegister({
        email: username,
        password,
        getConfirmationUrl: ({ code, websiteUrl }) =>
          getMagicLinkUrl(websiteUrl, { type: "otp", code, email: username, returnToken: false }),
        clientInfo,
        req,
      });
      return sendResponse(result);
    } catch (error) {
      console.error("Failed to send email", error);
      return sendResponse({
        success: false,
        code: "server-error",
        message: "Failed to send email",
      });
    }
  };

  app.post(AUTH_ROUTES_AND_PARAMS.emailRegistration, registerRequestHandler);
};
