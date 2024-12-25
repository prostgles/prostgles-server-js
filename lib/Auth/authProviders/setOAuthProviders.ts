import * as passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { getObjectEntries, isEmpty } from "prostgles-types";
import { getErrorAsObject } from "../../DboBuilder/dboBuilderUtils";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "../AuthHandler";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { AuthRegistrationConfig } from "../AuthTypes";
import { upsertNamedExpressMiddleware } from "../setAuthProviders";
import e from "express";

export function setOAuthProviders(
  this: AuthHandler,
  app: e.Express,
  registrations: AuthRegistrationConfig<void>
) {
  const { onProviderLoginFail, onProviderLoginStart, websiteUrl, OAuthProviders } = registrations;
  if (!OAuthProviders || isEmpty(OAuthProviders)) {
    return;
  }

  upsertNamedExpressMiddleware(app, passport.initialize(), "prostglesPassportMiddleware");

  getObjectEntries(OAuthProviders).forEach(([providerName, providerConfig]) => {
    if (!providerConfig?.clientID) {
      return;
    }

    const { authOpts, ...config } = providerConfig;

    const strategy =
      providerName === "google" ? GoogleStrategy
      : providerName === "github" ? GitHubStrategy
      : providerName === "facebook" ? FacebookStrategy
      : MicrosoftStrategy;
    const callbackPath = `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}/callback`;
    passport.use(
      new (strategy as typeof GoogleStrategy)(
        {
          ...config,
          callbackURL: `${websiteUrl}${callbackPath}`,
        },
        async (accessToken, refreshToken, profile, done) => {
          // This callback is where you would normally store or retrieve user info from the database
          return done(null, profile, { accessToken, refreshToken, profile });
        }
      )
    );

    app.get(
      `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
      passport.authenticate(providerName, authOpts ?? {})
    );

    app.get(callbackPath, async (req, res) => {
      try {
        const clientInfo = getClientRequestIPsInfo({ httpReq: req, res });
        const db = this.db;
        const dbo = this.dbo as any;
        const args = { provider: providerName, req, res, clientInfo, db, dbo };
        const startCheck = await onProviderLoginStart?.(args);
        if (startCheck && "error" in startCheck) {
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
            if (error) {
              await onProviderLoginFail?.({ ...args, error });
              res.status(500).json({
                error: "Failed to login with provider",
              });
            } else {
              this.loginThrottledAndSetCookie(req, res, {
                ...authInfo,
                type: "provider",
                provider: providerName,
              }).catch((e: any) => {
                res.status(500).json(getErrorAsObject(e));
              });
            }
          }
        )(req, res);
      } catch (_e) {
        res.status(500).json({ error: "Something went wrong" });
      }
    });
  });
}
