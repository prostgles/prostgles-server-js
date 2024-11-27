import { Email, SMTPConfig } from "./AuthTypes";
import nodemailer from "nodemailer";
import aws from "@aws-sdk/client-ses";
import SESTransport from "nodemailer/lib/ses-transport";

type SESTransporter =  nodemailer.Transporter<SESTransport.SentMessageInfo, SESTransport.Options>;
type SMTPTransporter = nodemailer.Transporter<nodemailer.SentMessageInfo, nodemailer.TransportOptions>;
type Transporter = SESTransporter | SMTPTransporter;

const transporterCache: Map<string, Transporter> = new Map();

/**
 * Allows sending emails using nodemailer default config or AWS SES
 * https://www.nodemailer.com/transports/ses/
 */
export const sendEmail = (smptConfig: SMTPConfig, email: Email) => {
  const transporter = getOrSetTransporter(smptConfig);
  return send(transporter, email);
}

export const getOrSetTransporter = (smptConfig: SMTPConfig) => {
  const configStr = JSON.stringify(smptConfig);
  const transporter = transporterCache.get(configStr) ?? getTransporter(smptConfig);
  if(!transporterCache.has(configStr)){
    transporterCache.set(configStr, transporter);
  }
  return transporter;
}

const getTransporter = (smptConfig: SMTPConfig) => {
  let transporter: Transporter | undefined;
  if(smptConfig.type === "aws-ses"){
    const { 
      region, 
      accessKeyId, 
      secretAccessKey,
      /**
       * max 1 messages/second
       */
      sendingRate = 1 
    } = smptConfig;
    const ses = new aws.SES({
      apiVersion: "2010-12-01",
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });

    transporter = nodemailer.createTransport({
      SES: { ses, aws },
      maxConnections: 1,
      sendingRate 
    });

  } else {
    const { user, pass, host, port, secure } = smptConfig;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  }

  return transporter;
}

const send = (transporter: Transporter, email: Email) => {
  return new Promise((resolve, reject) => {
    transporter.once('idle', () => {
      if (transporter.isIdle()) {
        transporter.sendMail(
          email,
          (err, info) => {
            if(err){
              reject(err);
            } else {
              resolve(info);
            }
          }
        );
      }
    });
  });
};