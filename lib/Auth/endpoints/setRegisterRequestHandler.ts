import e, { Request, Response } from "express";
import { AuthResponse } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, HTTP_FAIL_CODES } from "../AuthHandler";
import type { AuthRegistrationConfig } from "../AuthTypes";
import { sendEmail } from "../sendEmail";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";

type ReturnType =
  | AuthResponse.MagicLinkAuthFailure
  | AuthResponse.MagicLinkAuthSuccess
  | AuthResponse.PasswordRegisterFailure
  | AuthResponse.PasswordRegisterSuccess;

export const setRegisterRequestHandler = (
  {
    email: emailAuthConfig,
    websiteUrl,
  }: Required<Pick<AuthRegistrationConfig<void>, "email" | "websiteUrl">>,
  app: e.Express
) => {
  const registerRequestHandler = async (req: Request, res: Response<ReturnType>) => {
    const { username, password } = req.body;
    const sendResponse = (response: ReturnType) => {
      if (response.success) {
        res.json(response);
      } else {
        res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(response);
      }
    };
    if (!username || typeof username !== "string") {
      return sendResponse({ success: false, code: "username-missing" });
    }
    if (emailAuthConfig.signupType === "withPassword") {
      const { minPasswordLength = 8 } = emailAuthConfig;
      if (typeof password !== "string") {
        return sendResponse({ success: false, code: "password-missing" });
      } else if (password.length < minPasswordLength) {
        return sendResponse({
          success: false,
          code: "weak-password",
          message: `Password must be at least ${minPasswordLength} characters long`,
        });
      }
    }
    try {
      const { httpReq, ...clientInfo } = getClientRequestIPsInfo({ httpReq: req, res });
      const { smtp } = emailAuthConfig;
      const errCodeOrResult =
        emailAuthConfig.signupType === "withPassword" ?
          await emailAuthConfig.onRegister({
            email: username,
            password,
            confirmationUrlPath: `${websiteUrl}${AUTH_ROUTES_AND_PARAMS.confirmEmail}`,
            clientInfo,
            req: httpReq,
          })
        : await emailAuthConfig.onRegister({
            email: username,
            magicLinkUrlPath: `${websiteUrl}${AUTH_ROUTES_AND_PARAMS.magicLinksRoute}`,
            clientInfo,
            req: httpReq,
          });

      const registrationResult =
        typeof errCodeOrResult === "string" ?
          { email: undefined, response: { success: false as const, code: errCodeOrResult } }
        : errCodeOrResult;
      if (!registrationResult.email) {
        return sendResponse(registrationResult.response);
      }

      const emailMessage = { ...registrationResult.email, to: username };
      await sendEmail(smtp, emailMessage);
      return sendResponse({
        ...registrationResult.response,
        message:
          emailAuthConfig.signupType === "withPassword" ?
            `We've sent a confirmation email to ${emailMessage.to}. Please check your inbox (and your spam folder) for a message from us.`
          : "Email sent",
      });
    } catch {
      return sendResponse({
        success: false,
        code: "server-error",
        message: "Failed to send email",
      });
    }
  };

  app.post(AUTH_ROUTES_AND_PARAMS.emailRegistration, registerRequestHandler);
};
