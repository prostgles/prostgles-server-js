import type { AnyObject } from "prostgles-types";
import { CHANNELS } from "prostgles-types";
import type { PRGLIOSocket } from "../DboBuilder/DboBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { AuthClientRequest, AuthConfig, BasicSession } from "./AuthTypes";
import { getClientAuth } from "./getClientAuth";
import { login } from "./login";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getSidAndUserFromRequest } from "./utils/getSidAndUserFromRequest";
import { handleGetUserThrottled, type GetUserOrRedirected } from "./utils/handleGetUser";
import { removeExpressRoute, removeExpressRoutesTest } from "./utils/removeExpressRoute";
import {
  setCookieAndGoToReturnURLIFSet,
  validateSessionAndSetCookie,
} from "./utils/setCookieAndGoToReturnURLIFSet";
import { matchesRoute } from "./utils/matchesRoute";

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

export const AUTH_ROUTES_AND_PARAMS = {
  login: "/login",
  loginWithProvider: "/oauth",
  emailRegistration: "/register",
  returnUrlParamName: "returnURL",
  sidKeyName: "session_id",
  logout: "/logout",
  magicLinks: "/magic-link",
  magicLinkWithId: "/magic-link/:id",
  catchAll: "*splat", //v5 "*splat" //v4 "*"
} as const;

export class AuthHandler {
  protected readonly prostgles: Prostgles;
  protected readonly opts: AuthConfig;
  dbo: DBHandlerServer;
  db: DB;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    if (!prostgles.opts.auth) throw new Error("prostgles.opts.auth missing");
    this.opts = prostgles.opts.auth;
    if (!prostgles.dbo || !prostgles.db) throw new Error("dbo or db missing");
    this.dbo = prostgles.dbo;
    this.db = prostgles.db;
  }

  get sidKeyName() {
    return this.opts.sidKeyName ?? AUTH_ROUTES_AND_PARAMS.sidKeyName;
  }

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
    } = AUTH_ROUTES_AND_PARAMS;
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

  init = setupAuthRoutes.bind(this);

  destroy = () => {
    const app = this.opts.loginSignupConfig?.app;
    const {
      login,
      logout,
      magicLinkWithId: magicLinksIdParam,
      catchAll,
      loginWithProvider,
      emailRegistration,
      magicLinks,
    } = AUTH_ROUTES_AND_PARAMS;

    removeExpressRoute(app, [
      login,
      logout,
      magicLinksIdParam,
      catchAll,
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
      const querySid = (handshake.auth?.[sidKeyName] || handshake.query?.[sidKeyName]) as
        | string
        | undefined;
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = maybeClientReq.socket.handshake.headers?.cookie;
        const cookie = parseCookieStr(cookie_str);
        rawSid = cookie[sidKeyName];
      }
      return this.validateSid(rawSid);
    }

    const [tokenType, base64Token] = maybeClientReq.httpReq.headers.authorization?.split(" ") ?? [];
    let bearerSid: string | undefined;
    if (tokenType && base64Token) {
      if (tokenType.trim() !== "Bearer") {
        throw "Only Bearer Authorization header allowed";
      }
      bearerSid = Buffer.from(base64Token, "base64").toString();
    }
    return this.validateSid(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      bearerSid ?? (maybeClientReq.httpReq.cookies?.[sidKeyName] as string | undefined)
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
    session: BasicSession | undefined
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
