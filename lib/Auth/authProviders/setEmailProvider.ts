import e from "express";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "../AuthHandler";
import { getConfirmEmailRequestHandler } from "../endpoints/getConfirmEmailRequestHandler";
import { getRegisterRequestHandler } from "../endpoints/getRegisterRequestHandler";
import { getOrSetTransporter } from "../sendEmail";
import { checkDmarc } from "../utils/checkDmarc";

export async function setEmailProvider(this: AuthHandler, app: e.Express) {
  const { email, websiteUrl } = this.opts.expressConfig?.registrations ?? {};
  if (!email) return;
  if (!websiteUrl) {
    throw new Error("websiteUrl is required for email/magic-link registrations");
  }
  await checkDmarc(websiteUrl);

  /**
   * Setup nodemailer transporters
   */
  getOrSetTransporter(email.smtp);

  app.post(
    AUTH_ROUTES_AND_PARAMS.emailRegistration,
    getRegisterRequestHandler({ email, websiteUrl })
  );

  if (email.signupType === "withPassword") {
    app.get(AUTH_ROUTES_AND_PARAMS.confirmEmailExpressRoute, getConfirmEmailRequestHandler(email));
  }
}
