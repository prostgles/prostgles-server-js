import {
  AuthGuardLocation,
  AuthGuardLocationResponse,
  AuthSocketSchema,
  CHANNELS,
  getObjectEntries,
  isEmpty,
  isObject,
} from "prostgles-types";
import {
  AuthClientRequest,
  LoginWithOAuthConfig,
  AuthResultWithSID,
  type AuthResult,
} from "./AuthTypes";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler } from "./AuthHandler";

export async function getClientAuth(
  this: AuthHandler,
  clientReq: AuthClientRequest
): Promise<{ auth: AuthSocketSchema; userData: AuthResultWithSID } | "new-session-redirect"> {
  let pathGuard = false;
  const {
    loginWithOAuth,
    signupWithEmail: signupWithEmailAndPassword,
    localLoginMode,
    login,
    publicRoutes,
    disableSocketAuthGuard,
  } = this.opts.loginSignupConfig ?? {};

  if (publicRoutes && !disableSocketAuthGuard) {
    pathGuard = true;

    /**
     * Due to SPA nature of some clients, we need to check if the connected client ends up on a protected route
     */
    if (clientReq.socket) {
      const getUserFromRequest = async (clientReq: AuthClientRequest): Promise<AuthResult> => {
        const sidAndUser = await this.getSidAndUserFromRequest(clientReq);
        if (isObject(sidAndUser) && sidAndUser.sid && sidAndUser.user) {
          return sidAndUser;
        }
      };
      const { socket } = clientReq;
      socket.removeAllListeners(CHANNELS.AUTHGUARD);
      socket.on(
        CHANNELS.AUTHGUARD,
        async (
          params: AuthGuardLocation,
          cb = (_err: any, _res?: AuthGuardLocationResponse) => {
            /** EMPTY */
          }
        ) => {
          try {
            const { pathname, origin } =
              typeof params === "string" ? (JSON.parse(params) as AuthGuardLocation) : params;
            if (pathname && typeof pathname !== "string") {
              console.warn("Invalid pathname provided for AuthGuardLocation: ", pathname);
            }

            /** These origins  */
            const IGNORED_API_ORIGINS = ["file://"];
            if (
              !IGNORED_API_ORIGINS.includes(origin) &&
              pathname &&
              typeof pathname === "string" &&
              this.isUserRoute(pathname) &&
              !(await getUserFromRequest({ socket }))
            ) {
              cb(null, { shouldReload: true });
            } else {
              cb(null, { shouldReload: false });
            }
          } catch (err) {
            console.error("AUTHGUARD err: ", err);
            cb(err);
          }
        }
      );
    }
  }

  const userData = await this.getSidAndUserFromRequest(clientReq);
  if (userData === "new-session-redirect") {
    return userData;
  }
  const auth: AuthSocketSchema = {
    providers: getOAuthProviders(loginWithOAuth),
    signupWithEmailAndPassword: signupWithEmailAndPassword && {
      minPasswordLength: signupWithEmailAndPassword.minPasswordLength ?? 8,
      url: AUTH_ROUTES_AND_PARAMS.emailRegistration,
    },
    preferredLogin: userData.preferredLogin,
    user: userData.clientUser,
    loginType: localLoginMode ?? (login ? "email+password" : undefined),
    pathGuard,
  };
  return { auth, userData };
}

const getOAuthProviders = (
  loginWithOAuth: LoginWithOAuthConfig<any> | undefined
): AuthSocketSchema["providers"] | undefined => {
  if (!loginWithOAuth) return undefined;
  const { OAuthProviders } = loginWithOAuth;
  if (isEmpty(OAuthProviders)) return undefined;

  const result: AuthSocketSchema["providers"] = {};
  getObjectEntries(OAuthProviders).forEach(([providerName, config]) => {
    if (config?.clientID) {
      result[providerName] = {
        url: `${AUTH_ROUTES_AND_PARAMS.loginWithProvider}/${providerName}`,
        ...(providerName === "customOAuth" && {
          displayName: OAuthProviders.customOAuth?.displayName,
          displayIconPath: OAuthProviders.customOAuth?.displayIconPath,
        }),
      };
    }
  });

  return result;
};
