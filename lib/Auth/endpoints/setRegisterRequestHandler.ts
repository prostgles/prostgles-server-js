import type e from "express";
import type { AuthHandler } from "../AuthHandler";
import { getMagicLinkUrl, type SignupWithEmail } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { createAuthRequestHandler } from "../utils/createAuthRequestHandler";

export function setRegisterRequestHandler(
  this: AuthHandler,
  { onRegister, minPasswordLength = 8, requirePassword }: SignupWithEmail,
  app: e.Express,
) {
  const registerRequestHandler = createAuthRequestHandler(
    "register",
    async ({ username, password = "" }, req) => {
      if (!username) {
        return { success: false, code: "username-missing" };
      }
      if (!password && requirePassword) {
        return { success: false, code: "password-missing" };
      } else if (password.length < minPasswordLength) {
        return {
          success: false,
          code: "weak-password",
          message: `Password must be at least ${minPasswordLength} characters long`,
        };
      }
      const clientInfo = getClientRequestIPsInfo({ httpReq: req });
      return onRegister({
        email: username,
        password,
        getConfirmationUrl: ({ code, websiteUrl }) =>
          getMagicLinkUrl({
            loginSignupConfig: this.config?.loginSignupConfig,
            websiteUrl,
            data: { type: "otp", code, email: username, returnToken: false },
          }),
        clientInfo,
        req,
      });
    },
    {
      /* Existing clients also send login form fields when registering. */
      allowExtraProperties: true,
      onError: (error) => {
        console.error("Failed to send email", error);
        return { success: false, code: "server-error", message: "Failed to send email" };
      },
    },
  );

  app.post(this.authRoutes.emailRegistration, registerRequestHandler);
}
