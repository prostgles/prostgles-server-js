import e from "express";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "./AuthHandler";
import { Email, SMTPConfig } from "./AuthTypes";
import { sendEmail } from "./sendEmail";
import { promises } from "node:dns";

export async function setEmailProvider(this: AuthHandler, app: e.Express) {
  
  const { email, websiteUrl } = this.opts?.expressConfig?.registrations ?? {};
  if(!email) return;
  if(websiteUrl){
    await checkDmarc(websiteUrl);
  }

  app.post(AUTH_ROUTES_AND_PARAMS.emailSignup, async (req, res) => {
    const { username, password } = req.body;
    let validationError = "";
    if(typeof username !== "string"){
      validationError = "Invalid username";
    }
    if(email.signupType === "withPassword"){
      const { minPasswordLength = 8 } = email;
      if(typeof password !== "string"){
        validationError = "Invalid password";
      } else if(password.length < minPasswordLength){
        validationError = `Password must be at least ${minPasswordLength} characters long`;
      }
    }
    if(validationError){
      res.status(400).json({ error: validationError });
      return;
    }
    try {
      let emailMessage: undefined | { message: Email; smtp: SMTPConfig };
      if(email.signupType === "withPassword"){
        if(email.emailConfirmation){
          const { onSend, smtp } = email.emailConfirmation;
          const message = await onSend({ email: username, confirmationUrlPath: `${websiteUrl}${AUTH_ROUTES_AND_PARAMS.confirmEmail}` });
          emailMessage = { message: { ...message, to: username }, smtp };
        }
      } else {
        const { emailMagicLink } = email;
        const message = await emailMagicLink.onSend({ email: username, magicLinkPath: `${websiteUrl}${AUTH_ROUTES_AND_PARAMS.magicLinksRoute}` });
        emailMessage = { message: { ...message, to: username }, smtp: emailMagicLink.smtp };
      }

      if(emailMessage){
        await sendEmail(emailMessage.smtp, emailMessage.message);
        res.json({ msg: "Email sent" });
      }
    } catch {
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  if(email.signupType === "withPassword" && email.emailConfirmation){
    app.get(AUTH_ROUTES_AND_PARAMS.confirmEmailExpressRoute, async (req, res) => {
      const { id } = req.params ?? {};
      try {
        await email.emailConfirmation?.onConfirmed({ confirmationCode: id });
        res.json({ msg: "Email confirmed" });
      } catch (_e) {
        res.status(500).json({ error: "Failed to confirm email" });
      }
    });
  }
}

const checkDmarc = async (websiteUrl: string) => {
  const { host } = new URL(websiteUrl);
  const ignoredHosts = ["localhost", "127.0.0.1"]
  if(!host || ignoredHosts.includes(host)){
    return;
  }
  const dmarc = await promises.resolveTxt(`_dmarc.${host}`);
  const dmarkTxt = dmarc[0]?.[0];
  if(
    !dmarkTxt?.includes("v=DMARC1") ||
    (!dmarkTxt?.includes("p=reject") && !dmarkTxt?.includes("p=quarantine"))
  ){
    throw new Error("DMARC not set to reject/quarantine");
  } else {
    console.log("DMARC set to reject")
  }
}