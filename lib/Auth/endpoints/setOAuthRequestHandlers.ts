import type e from "express";
import * as passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import { getObjectEntries, isEmpty } from "prostgles-types";
import { getErrorAsObject } from "../../DboBuilder/dboBuilderUtils";
import type { DBOFullyTyped } from "../../DBSchemaBuilder/DBSchemaBuilder";
import type { AuthHandler } from "../AuthHandler";
import { HTTP_FAIL_CODES } from "../AuthHandler";
import type { AuthProviderUserData, LoginWithOAuthConfig } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { upsertNamedExpressMiddleware } from "../utils/upsertNamedExpressMiddleware";
import type { LoginResponseHandler } from "./setLoginRequestHandler";
import OAuth2Strategy from "passport-oauth2";
export function setOAuthRequestHandlers(
  this: AuthHandler,
  app: e.Express,
  loginWithOAuthConfig: LoginWithOAuthConfig<void>
) {
  const { onProviderLoginFail, onProviderLoginStart, websiteUrl, OAuthProviders } =
    loginWithOAuthConfig;
  if (isEmpty(OAuthProviders)) {
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
      : providerName === "customOAuth" ? OAuth2Strategy
      : MicrosoftStrategy;
    const callbackPath = `${this.authRoutes.loginWithProvider}/${providerName}/callback`;
    passport.use(
      new (strategy as typeof GoogleStrategy)(
        {
          ...config,
          callbackURL: `${websiteUrl}${callbackPath}`,
        },
        (accessToken, refreshToken, profile, done) => {
          // This callback is where you would normally store or retrieve user info from the database
          return done(null, profile, { accessToken, refreshToken, profile });
        }
      )
    );

    const authPath = `${this.authRoutes.loginWithProvider}/${providerName}`;
    app.get(authPath, passport.authenticate(providerName, authOpts ?? {}));

    app.get(callbackPath, async (req, res: LoginResponseHandler) => {
      try {
        const clientInfo = getClientRequestIPsInfo({ httpReq: req });
        const db = this.db;
        const dbo = this.dbo as DBOFullyTyped;
        const args = { provider: providerName, req, res, clientInfo, db, dbo };
        const startCheck = await onProviderLoginStart?.(args);
        if (onProviderLoginStart && !startCheck?.success) {
          res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(startCheck);
          return;
        }
        passport.authenticate(
          providerName,
          {
            session: false,
            failureRedirect: "/login",
            failWithError: true,
          },
          async (error: any, _profile: any, authInfo: AuthProviderUserData) => {
            if (error) {
              await onProviderLoginFail?.({ ...args, error });
              res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
                success: false,
                code: "provider-issue",
                message: "Failed to login with provider",
              });
            } else {
              this.login(req, res, {
                ...authInfo,
                type: "OAuth",
                provider: providerName as "customOAuth",
              }).catch((e: any) => {
                res.status(HTTP_FAIL_CODES.INTERNAL_SERVER_ERROR).json(
                  //@ts-ignore
                  getErrorAsObject(e)
                );
              });
            }
          }
        )(req, res);
      } catch (_e) {
        res
          .status(HTTP_FAIL_CODES.INTERNAL_SERVER_ERROR)
          .json({ code: "server-error", success: false });
      }
    });
  });
}
