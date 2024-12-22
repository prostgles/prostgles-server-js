import e from "express";
import { AuthHandler } from "../AuthHandler";
import { setConfirmEmailRequestHandler } from "../endpoints/setConfirmEmailRequestHandler";
import { setRegisterRequestHandler } from "../endpoints/setRegisterRequestHandler";
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

  setRegisterRequestHandler({ email, websiteUrl }, app);

  if (email.signupType === "withPassword") {
    setConfirmEmailRequestHandler(email, app);
  }
}
