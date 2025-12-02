import { Email, SMTPConfig } from "./AuthTypes";
import * as nodemailer from "nodemailer";
import * as aws from "@aws-sdk/client-ses";
import SESTransport from "nodemailer/lib/ses-transport";
import { checkDmarc } from "./utils/checkDmarc";

type SESTransporter = nodemailer.Transporter<SESTransport.SentMessageInfo, SESTransport.Options>;
type SMTPTransporter = nodemailer.Transporter<
  nodemailer.SentMessageInfo,
  nodemailer.TransportOptions
>;
type Transporter = SESTransporter | SMTPTransporter;

const transporterCache: Map<string, Transporter> = new Map();

/**
 * Allows sending emails using nodemailer default config or AWS SES
 * https://www.nodemailer.com/transports/ses/
 */
const sendEmail = (smptConfig: SMTPConfig, email: Email) => {
  const transporter = getOrSetTransporter(smptConfig);
  return send(transporter, email);
};

/**
 * Verifies DMARC and that the website has a valid DMARC records
 */
const emailSenderCache: Map<string, boolean> = new Map();
export const getEmailSender = async (smptConfig: SMTPConfig, websiteUrl: string) => {
  const result = {
    sendEmail: (email: Email) => sendEmail(smptConfig, email),
  };
  const configStr = JSON.stringify({ smptConfig, websiteUrl });
  if (emailSenderCache.has(configStr)) {
    return result;
  }
  if (!websiteUrl) {
    throw new Error("websiteUrl is required for email registrations");
  }
  await checkDmarc(websiteUrl);

  await verifySMTPConfig(smptConfig);

  /**
   * Setup nodemailer transporters
   */
  getOrSetTransporter(smptConfig);
  emailSenderCache.set(configStr, true);
  return result;
};

/**
 * Returns a transporter from cache or creates a new one
 */
export const getOrSetTransporter = (smptConfig: SMTPConfig) => {
  const configStr = JSON.stringify(smptConfig);
  const transporter = transporterCache.get(configStr) ?? getTransporter(smptConfig);
  if (!transporterCache.has(configStr)) {
    transporterCache.set(configStr, transporter);
  }
  return transporter;
};

const getTransporter = (smptConfig: SMTPConfig) => {
  let transporter: Transporter | undefined;
  if (smptConfig.type === "aws-ses") {
    const {
      region,
      accessKeyId,
      secretAccessKey,
      /**
       * max 1 messages/second
       */
      sendingRate = 1,
    } = smptConfig;
    const ses = new aws.SES({
      apiVersion: "2010-12-01",
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    transporter = nodemailer.createTransport({
      SES: { ses, aws },
      maxConnections: 1,
      sendingRate,
    });
  } else {
    const { user, pass, host, port, secure, tls } = smptConfig;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls,
    });
  }

  return transporter;
};

const send = (transporter: Transporter, email: Email) => {
  return new Promise((resolve, reject) => {
    const doSend = () => {
      transporter.sendMail(email, (err, info) => {
        if (err) {
          reject(err);
        } else {
          resolve(info);
        }
      });
    };
    /**
     * Local transporters used in testing ("smtp-server") don't have isIdle method
     */
    if (
      transporter.isIdle() ||
      !("isIdle" in transporter.transporter && transporter.transporter.isIdle)
    ) {
      doSend();
    } else {
      transporter.once("idle", doSend);
    }
  });
};

export const verifySMTPConfig = async (smptConfig: SMTPConfig) => {
  const transporter = getOrSetTransporter(smptConfig);
  return new Promise((resolve, reject) => {
    transporter.verify((err, success) => {
      if (err) {
        reject(err);
      } else {
        resolve(success);
      }
    });
  });
};
