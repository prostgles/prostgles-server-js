import type e from "express";
import type { AuthHandler } from "../AuthHandler";
import { getMagicLinkUrl, type SignupWithEmail } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { createAuthRequestHandler } from "../utils/createAuthRequestHandler";
import { throttledAuthCall } from "../utils/throttledReject";

export function setRegisterRequestHandler(
  this: AuthHandler,
  { onRegister, minPasswordLength = 8, requirePassword, requireInvitation }: SignupWithEmail,
  app: e.Express,
) {
  const registerRequestHandler = createAuthRequestHandler(
    "register",
    async ({ username, password = "", invitationToken }, req) => {
      if (requireInvitation && !invitationToken) {
        return {
          success: false,
          code: "invalid-email-confirmation-code",
          message: "An invitation is required to register",
        };
      }
      if (!username) {
        return { success: false, code: "username-missing" };
      }
      if (!password && requirePassword) {
        return { success: false, code: "password-missing" };
      } else if (password && password.length < minPasswordLength) {
        return {
          success: false,
          code: "weak-password",
          message: `Password must be at least ${minPasswordLength} characters long`,
        };
      }
      const clientInfo = getClientRequestIPsInfo({ httpReq: req });
      return throttledAuthCall(
        async () =>
          onRegister({
            email: username,
            password,
            invitationToken,
            getConfirmationUrl: ({ code, websiteUrl }) =>
              getMagicLinkUrl({
                loginSignupConfig: this.config?.loginSignupConfig,
                websiteUrl,
                data: {
                  type: "otp",
                  code,
                  email: username,
                  returnToken: false,
                },
              }),
            clientInfo,
            req,
          }),
        this.config?.responseThrottle,
      );
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
