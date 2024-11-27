import type e from "express";
import { RequestHandler } from "express";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { AuthSocketSchema, getObjectEntries, isEmpty } from "prostgles-types";
import { getErrorAsObject } from "../DboBuilder/dboBuilderUtils";
import { removeExpressRouteByName } from "../FileManager/FileManager";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, getLoginClientInfo } from "./AuthHandler";
import { Auth } from './AuthTypes';
import { setEmailProvider } from "./setEmailProvider";
/** For some reason normal import is undefined */
const passport = require("passport") as typeof import("passport");

export const upsertNamedExpressMiddleware = (app: e.Express, handler: RequestHandler, name: string) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app, name);
  app.use(handler);
}

export function setAuthProviders (this: AuthHandler, { registrations, app }: Required<Auth>["expressConfig"]) {
  if(!registrations) return;
  const { onRegister, onProviderLoginFail, onProviderLoginStart, websiteUrl, OAuthProviders } = registrations;

  setEmailProvider.bind(this)(app);

  if(!OAuthProviders || isEmpty(OAuthProviders)){
    return;
  }

  upsertNamedExpressMiddleware(app, passport.initialize(), "prostglesPassportMiddleware");

  getObjectEntries(OAuthProviders).forEach(([providerName, providerConfig]) => {

    if(!providerConfig?.clientID){
      return;
    }

    const { authOpts, ...config } = providerConfig;
    
    const strategy = providerName === "google" ? GoogleStrategy :
      providerName === "github" ? GitHubStrategy :
      providerName === "facebook" ? FacebookStrategy :
      providerName === "microsoft" ? MicrosoftStrategy : 
      undefined
    ;

    const callbackPath = `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}/callback`;
    passport.use(
      new (strategy as typeof GoogleStrategy)(
        {
          ...config,
          callbackURL: `${websiteUrl}${callbackPath}`,
        },
        async (accessToken, refreshToken, profile, done) => {
          // This callback is where you would normally store or retrieve user info from the database
          await onRegister({ provider: providerName as "google", accessToken, refreshToken, profile });
          return done(null, profile, { accessToken, refreshToken, profile });
        }
      )
    );

    app.get(`${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
      passport.authenticate(providerName, authOpts ?? {})
    );

    app.get(
      callbackPath,
      async (req, res) => {
        try {
          const clientInfo = getLoginClientInfo({ httpReq: req });
          const db = this.db;
          const dbo = this.dbo as any;
          const args = { provider: providerName, req, res, clientInfo, db, dbo };
          const startCheck = await onProviderLoginStart(args);
          if("error" in startCheck){
            res.status(500).json({ error: startCheck.error });
            return;
          }
          passport.authenticate(
            providerName, 
            {
              session: false, 
              failureRedirect: "/login",
              failWithError: true,
            },
            async (error: any, _profile: any, authInfo: any) => {
              if(error){
                await onProviderLoginFail({ ...args, error });
                res.status(500).json({
                  error: "Failed to login with provider",
                });
              } else {
                this.loginThrottledAndSetCookie(req, res, { type: "provider", provider: providerName, ...authInfo })
                .catch((e: any) => {
                  res.status(500).json(getErrorAsObject(e));
                });
              }
            } 
          )(req, res);

        } catch (_e) {
          res.status(500).json({ error: "Something went wrong" });
        }
      }
    );

  });
}

export function getProviders(this: AuthHandler): AuthSocketSchema["providers"] | undefined {
  const { registrations } = this.opts?.expressConfig ?? {}
  if(!registrations) return undefined;
  const {  OAuthProviders } = registrations;
  if(!OAuthProviders || isEmpty(OAuthProviders)) return undefined;
 
  const result: AuthSocketSchema["providers"] = {}
  getObjectEntries(OAuthProviders).forEach(([providerName, config]) => {
    if(config?.clientID){
      result[providerName] = {
        url: `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
      }
    }
  });

  return result;
}