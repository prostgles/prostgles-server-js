import type e from "express";
import { RequestHandler } from "express";
import { AuthSocketSchema, getObjectEntries, isEmpty } from "prostgles-types";
import { removeExpressRouteByName } from "../FileManager/FileManager";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "./AuthHandler";
import { Auth } from "./AuthTypes";
import { setEmailProvider } from "./authProviders/setEmailProvider";
import { setOAuthProviders } from "./authProviders/setOAuthProviders";

export const upsertNamedExpressMiddleware = (
  app: e.Express,
  handler: RequestHandler,
  name: string
) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app, name);
  app.use(handler);
};

export async function setAuthProviders(
  this: AuthHandler,
  { registrations, app }: Required<Auth>["expressConfig"]
) {
  if (!registrations) return;

  await setEmailProvider.bind(this)(app);
  await setOAuthProviders.bind(this)(app, registrations);
}

export function getProviders(this: AuthHandler): AuthSocketSchema["providers"] | undefined {
  const { registrations } = this.opts.expressConfig ?? {};
  if (!registrations) return undefined;
  const { OAuthProviders } = registrations;
  if (!OAuthProviders || isEmpty(OAuthProviders)) return undefined;

  const result: AuthSocketSchema["providers"] = {};
  getObjectEntries(OAuthProviders).forEach(([providerName, config]) => {
    if (config?.clientID) {
      result[providerName] = {
        url: `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
      };
    }
  });

  return result;
}
