import type { AnyObject } from "prostgles-types";
import { CHANNELS, fromEntries, getEntries, getProperty, isDefined } from "prostgles-types";
import type { ClientSocketWithCachedData } from "../DboBuilder/DboBuilder";
import type { DBHandlerServer } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Prostgles } from "../Prostgles";
import type { AuthClientRequest, AuthConfig } from "./AuthTypes";
import { getClientAuth } from "./getClientAuth";
import { login } from "./login";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { SocketSessionCache } from "./SocketSessionCache";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getSidAndUserFromRequest } from "./utils/getSidAndUserFromRequest";
import { handleGetUserThrottled, type GetUserOrRedirected } from "./utils/handleGetUser";
import { matchesRoute } from "./utils/matchesRoute";
import { removeExpressRoute, removeExpressRoutesTest } from "./utils/removeExpressRoute";
import { removeExpressRouteByName } from "./utils/upsertNamedExpressMiddleware";
import {
  setCookieAndGoToReturnURLIfSet,
  validateSessionAndSetCookie,
} from "./utils/setCookieAndGoToReturnURLIfSet";

export { getClientRequestIPsInfo, removeExpressRoute, removeExpressRoutesTest };
export const HTTP_FAIL_CODES = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
} as const;

export const HTTP_SUCCESS_CODES = {
  OK: 200,
  CREATED: 201,
} as const;

const SID_KEY_NAME = "session_id" as const;
export const EXPRESS_CATCH_ALL_ROUTE = "*splat"; //v5 "*splat" //v4 "*"
export const AUTH_RETURN_URL_PARAM_NAME = "returnURL";
export const AUTH_CACHE_CONTROL_MIDDLEWARE_NAME = "prostglesAuthCacheControl";
export const AUTH_ROUTES = {
  login: "/login",
  loginWithProvider: "/oauth",
  emailRegistration: "/register",
  logout: "/logout",
  magicLinks: "/magic-link",
  magicLinkWithId: "/magic-link/:id",
} as const;
export const getAuthRoute = (
  conf: AuthConfig["loginSignupConfig"],
  route: keyof typeof AUTH_ROUTES,
) => {
  return `${getAuthRoutesBasePath(conf)}${AUTH_ROUTES[route]}`;
};
export const getAuthRoutesBasePath = (conf: AuthConfig["loginSignupConfig"]) => {
  const basePath = conf?.authRoutesBasePath ?? "/auth";
  if (!basePath.startsWith("/") || basePath.endsWith("/")) {
    throw new Error(
      "authRoutesBasePath must be a non-empty path starting with '/' and without a trailing '/'",
    );
  }
  return basePath;
};
export const getAllAuthRoutes = (conf: AuthConfig["loginSignupConfig"]) => {
  return fromEntries(getEntries(AUTH_ROUTES).map(([key]) => [key, getAuthRoute(conf, key)]));
};

export class AuthHandler {
  protected readonly prostgles: Prostgles;
  protected readonly config: AuthConfig | undefined;
  private readonly socketSessions = new SocketSessionCache();

  get dbHandles() {
    const { dbo, db } = this.prostgles;
    if (!db || !dbo) {
      throw new Error("dbo or db missing");
    }
    return { dbo: dbo as DBHandlerServer, db };
  }

  // TODO: tidy
  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    const config = prostgles.opts.auth;
    this.config = config;
    if (config) {
      this.init(config);
    }
  }

  get sidKeyName() {
    return this.config?.sidKeyName ?? SID_KEY_NAME;
  }

  get authRoutes() {
    return getAllAuthRoutes(this.config?.loginSignupConfig);
  }

  init = setupAuthRoutes.bind(this);

  validateSid = (sid: string | undefined) => {
    if (!sid) return undefined;
    if (typeof sid !== "string") throw new Error("sid missing or not a string");
    return sid;
  };

  isUserRoute = (pathname: string) => {
    const {
      login,
      logout: logoutRoute,
      magicLinks: magicLinksRoute,
      loginWithProvider,
    } = getAllAuthRoutes(this.config?.loginSignupConfig);
    const pubRoutes = [
      ...(this.config?.loginSignupConfig?.publicRoutes || []),
      login,
      logoutRoute,
      magicLinksRoute,
      loginWithProvider,
    ].filter((publicRoute) => publicRoute);

    return !pubRoutes.some((publicRoute) => {
      return matchesRoute(publicRoute, pathname);
    });
  };

  setCookieAndGoToReturnURLIfSet = setCookieAndGoToReturnURLIfSet.bind(this);
  validateSessionAndSetCookie = validateSessionAndSetCookie.bind(this);
  handleGetUser = (clientReq: AuthClientRequest): Promise<GetUserOrRedirected> => {
    const lookup = () => handleGetUserThrottled.call(this, clientReq);
    if (!clientReq.socket || !this.config?.cacheSession) return lookup();
    const { socket } = clientReq;
    return this.socketSessions.get(socket, this.getValidatedSid(clientReq), lookup, (session) => {
      if (
        session.onExpiration === "redirect" &&
        this.config?.loginSignupConfig?.publicRoutes &&
        !this.config.loginSignupConfig.disableSocketAuthGuard
      ) {
        socket.emit(CHANNELS.AUTH_GUARD, {
          shouldReload: true,
          error: "Session has expired",
        });
      }
      socket.conn.close();
    });
  };

  clearSocketSession = (socket: ClientSocketWithCachedData) => this.socketSessions.delete(socket);

  /**
   * Used by:
   *  - setCatchAllRequestHandler
   *  - loginSignupConfig.use
   */
  getUserOrError = async (clientReq: AuthClientRequest): Promise<GetUserOrRedirected> => {
    try {
      return this.handleGetUser(clientReq);
    } catch (_err) {
      return {
        sid: this.getValidatedSid(clientReq),
        error: { success: false, code: "server-error" },
      };
    }
  };

  destroy = () => {
    this.socketSessions.destroy();
    const app = this.config?.loginSignupConfig?.app;
    if (app) {
      removeExpressRouteByName(app, AUTH_CACHE_CONTROL_MIDDLEWARE_NAME);
    }
    const {
      login,
      logout,
      magicLinkWithId: magicLinksIdParam,
      loginWithProvider,
      emailRegistration,
      magicLinks,
    } = getAllAuthRoutes(this.config?.loginSignupConfig);

    removeExpressRoute(app, [
      login,
      logout,
      magicLinksIdParam,
      EXPRESS_CATCH_ALL_ROUTE,
      loginWithProvider,
      emailRegistration,
      magicLinks,
    ]);
  };

  login = login.bind(this);

  /**
   * Will return first sid value found in:
   *  - Bearer header
   *  - http cookie
   *  - query params
   * Based on sidKeyName from auth
   */
  getValidatedSid(maybeClientReq: AuthClientRequest | undefined): string | undefined {
    if (!maybeClientReq || (!maybeClientReq.socket && !maybeClientReq.httpReq)) return undefined;
    const { sidKeyName } = this;
    if (maybeClientReq.socket) {
      const { handshake } = maybeClientReq.socket;
      const querySid = (handshake.auth[sidKeyName] ||
        handshake.query[sidKeyName] ||
        handshake.auth.token ||
        handshake.query.token) as string | undefined;
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = maybeClientReq.socket.handshake.headers.cookie;
        const cookie = parseCookieStr(cookie_str);
        rawSid = cookie[sidKeyName];
      }
      return this.validateSid(rawSid);
    }

    const authorizationHeader = maybeClientReq.httpReq.headers.authorization;
    const authToken = (["Bearer", "Basic"] as const)
      .map((type) =>
        authorizationHeader?.startsWith(type) ?
          { type, token: authorizationHeader.slice(type.length + 1) }
        : undefined,
      )
      .find(isDefined);

    if (authorizationHeader && !authToken) {
      throw "Invalid Authorization header format";
    }
    if (authToken && authToken.type !== "Bearer") {
      throw "Only Bearer Authorization header allowed";
    }

    const bearerSid = authToken && Buffer.from(authToken.token, "base64").toString();

    return this.validateSid(
      bearerSid ??
        (getProperty(maybeClientReq.httpReq.cookies ?? {}, sidKeyName) as string | undefined),
    );
  }

  /**
   * Used for logging
   */
  getSIDNoError = (clientReq: AuthClientRequest | undefined): string | undefined => {
    if (!clientReq) return undefined;
    try {
      return this.getValidatedSid(clientReq);
    } catch {
      return undefined;
    }
  };

  getSidAndUserFromRequest = getSidAndUserFromRequest.bind(this);

  getClientAuth = getClientAuth.bind(this);
}

const parseCookieStr = (cookie_str: string | undefined): Record<string, string> => {
  if (!cookie_str || typeof cookie_str !== "string") {
    return {};
  }

  return cookie_str
    .replace(/\s/g, "")
    .split(";")
    .reduce<AnyObject>((prev, current) => {
      const [name, value] = current.split("=");
      prev[name!] = value;
      return prev;
    }, {});
};
