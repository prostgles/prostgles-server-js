import { Auth } from './AuthTypes';
/** For some reason normal import is undefined */
const passport = require("passport") as typeof import("passport");
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { AuthSocketSchema, getKeys, isDefined, isEmpty } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, getLoginClientInfo } from "./AuthHandler";
import type e from "express";
import { RequestHandler } from "express";
import { removeExpressRouteByName } from "../FileManager/FileManager";
import { getErrorAsObject } from "../DboBuilder/dboBuilderUtils";


export const upsertNamedExpressMiddleware = (app: e.Express, handler: RequestHandler, name: string) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app, name);
  app.use(handler);
}

export function setAuthProviders (this: AuthHandler, { registrations, app }: Required<Auth>["expressConfig"]) {
  if(!registrations) return;
  const { email, onRegister, onProviderLoginFail, onProviderLoginStart, websiteUrl, ...providers } = registrations;
  if(email){
    app.post(AUTH_ROUTES_AND_PARAMS.emailSignup, async (req, res) => {
      const { username, password } = req.body;
      if(typeof username !== "string" || typeof password !== "string"){
        res.status(400).json({ msg: "Invalid username or password" });
        return;
      }
      await onRegister({ provider: "email", profile: { username, password }});
    })
  }

  if(!isEmpty(providers)){
    upsertNamedExpressMiddleware(app, passport.initialize(), "prostglesPassportMiddleware");
  }

  ([
    providers.google && {
      providerName: "google"  as const,
      config: providers.google,
      strategy: GoogleStrategy,
    }, 
    providers.github && {
      providerName: "github"  as const,
      config: providers.github,
      strategy: GitHubStrategy,
    },
    providers.facebook && {
      providerName: "facebook"  as const,
      config: providers.facebook,
      strategy: FacebookStrategy,
    },
    providers.microsoft && {
      providerName: "microsoft"  as const,
      config: providers.microsoft,
      strategy: MicrosoftStrategy,
    }
  ])
  .filter(isDefined)
  .forEach(({
    config: { authOpts, ...config },
    strategy,
    providerName,
  }) => {

    const callbackPath = `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}/callback`;
    passport.use(
      new (strategy as typeof GoogleStrategy)(
        {
          ...config as any,
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
          const dbo = this.dbo as any
          const startCheck = await onProviderLoginStart({ provider: providerName, req, res, clientInfo, db, dbo });
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
                await onProviderLoginFail({ provider: providerName, error, req, res, clientInfo, db, dbo });
                res.status(500).json({
                  error: "Failed to login with provider",
                });
              } else {
                this.loginThrottledAndSetCookie(req, res, { type: "provider", provider: providerName, ...authInfo })
                .then(() => {
                  res.redirect("/");
                })
                .catch((e: any) => {
                  res.status(500).json(getErrorAsObject(e));
                });
              }
            } 
          )(req, res);

        } catch (e) {
          res.status(500).json({ error: "Something went wrong" });
        }
      }
    );

  });
}

export function getProviders(this: AuthHandler): AuthSocketSchema["providers"] | undefined {
  const { registrations } = this.opts?.expressConfig ?? {}
  if(!registrations) return undefined;
  const { 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    email, websiteUrl, onRegister, onProviderLoginFail, onProviderLoginStart,
    ...providers 
  } = registrations;
  if(isEmpty(providers)) return undefined;
 
  const result: AuthSocketSchema["providers"] = {}
  getKeys(providers).forEach(providerName => {
    if(providers[providerName]?.clientID){
      result[providerName] = {
        url: `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
      }
    }
  });

  return result;
}