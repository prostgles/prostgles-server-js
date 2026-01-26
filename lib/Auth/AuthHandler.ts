import type { AnyObject } from "prostgles-types";
import { CHANNELS, getProperty, isDefined } from "prostgles-types";
import type { PRGLIOSocket } from "../DboBuilder/DboBuilder";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Prostgles } from "../Prostgles";
import type { AuthClientRequest, AuthConfig, BasicSession } from "./AuthTypes";
import { getClientAuth } from "./getClientAuth";
import { login } from "./login";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getSidAndUserFromRequest } from "./utils/getSidAndUserFromRequest";
import { handleGetUserThrottled, type GetUserOrRedirected } from "./utils/handleGetUser";
import { matchesRoute } from "./utils/matchesRoute";
import { removeExpressRoute, removeExpressRoutesTest } from "./utils/removeExpressRoute";
import {
  setCookieAndGoToReturnURLIFSet,
  validateSessionAndSetCookie,
} from "./utils/setCookieAndGoToReturnURLIFSet";

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
export const AUTH_ROUTES = {
  login: "/login",
  loginWithProvider: "/oauth",
  emailRegistration: "/register",
  logout: "/logout",
  magicLinks: "/magic-link",
  magicLinkWithId: "/magic-link/:id",
} as const;
export const GET_AUTH_ROUTE = (
  conf: AuthConfig["loginSignupConfig"],
  route: keyof typeof AUTH_ROUTES,
) => {
  const basePath = conf?.authRoutesBasePath || "";
  return `${basePath}${AUTH_ROUTES[route]}`;
};
export const GET_ALL_AUTH_ROUTES = (conf: AuthConfig["loginSignupConfig"]) => {
  return Object.fromEntries(
    Object.entries(AUTH_ROUTES).map(([key]) => [
      key,
      GET_AUTH_ROUTE(conf, key as keyof typeof AUTH_ROUTES),
    ]),
  ) as {
    [K in keyof typeof AUTH_ROUTES]: string;
  };
};

export class AuthHandler {
  protected readonly prostgles: Prostgles;
  protected readonly opts: Omit<AuthConfig, "getUser"> & {
    getUser?: undefined | AuthConfig["getUser"];
  };

  get dbHandles() {
    const { dbo, db } = this.prostgles;
    if (!db || !dbo) {
      throw new Error("dbo or db missing");
    }
    return { dbo: dbo as DBOFullyTyped, db };
  }

  // TODO: tidy
  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.opts = prostgles.opts.auth ?? {};
    if (prostgles.opts.auth) {
      this.init();
    }
  }

  get sidKeyName() {
    return this.opts.sidKeyName ?? SID_KEY_NAME;
  }

  get authRoutes() {
    return GET_ALL_AUTH_ROUTES(this.opts.loginSignupConfig);
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
    } = GET_ALL_AUTH_ROUTES(this.opts.loginSignupConfig);
    const pubRoutes = [
      ...(this.opts.loginSignupConfig?.publicRoutes || []),
      login,
      logoutRoute,
      magicLinksRoute,
      loginWithProvider,
    ].filter((publicRoute) => publicRoute);

    return !pubRoutes.some((publicRoute) => {
      return matchesRoute(publicRoute, pathname);
    });
  };

  setCookieAndGoToReturnURLIFSet = setCookieAndGoToReturnURLIFSet.bind(this);
  validateSessionAndSetCookie = validateSessionAndSetCookie.bind(this);
  handleGetUser = handleGetUserThrottled.bind(this);

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
    const app = this.opts.loginSignupConfig?.app;
    const {
      login,
      logout,
      magicLinkWithId: magicLinksIdParam,
      loginWithProvider,
      emailRegistration,
      magicLinks,
    } = GET_ALL_AUTH_ROUTES(this.opts.loginSignupConfig);

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
    if (!maybeClientReq) return undefined;
    const { sidKeyName } = this;
    if (maybeClientReq.socket) {
      const { handshake } = maybeClientReq.socket;
      const querySid = (handshake.auth?.[sidKeyName] ||
        handshake.query?.[sidKeyName] ||
        handshake.auth?.token ||
        handshake.query?.token) as string | undefined;
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = maybeClientReq.socket.handshake.headers?.cookie;
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
      bearerSid ?? (getProperty(maybeClientReq.httpReq.cookies, sidKeyName) as string | undefined),
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

  isNonExpiredSocketSession = (
    socket: PRGLIOSocket,
    session: BasicSession | undefined,
  ): boolean => {
    const hasExpired = Boolean(session && session.expires <= Date.now());
    if (
      this.opts.loginSignupConfig?.publicRoutes &&
      !this.opts.loginSignupConfig.disableSocketAuthGuard
    ) {
      const error = "Session has expired";
      if (hasExpired) {
        if (session?.onExpiration === "redirect")
          socket.emit(CHANNELS.AUTHGUARD, {
            shouldReload: true,
            error,
          });
        throw error;
      }
    }
    return Boolean(session && !hasExpired);
  };

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
