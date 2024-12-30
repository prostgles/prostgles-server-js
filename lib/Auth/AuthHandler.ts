import { AnyObject, AuthResponse, CHANNELS } from "prostgles-types";
import { PRGLIOSocket } from "../DboBuilder/DboBuilder";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { removeExpressRoute } from "../FileManager/FileManager";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import {
  AuthConfig,
  AuthClientRequest,
  AuthResult,
  AuthResultWithSID,
  BasicSession,
  ExpressReq,
} from "./AuthTypes";
import { LoginResponseHandler } from "./endpoints/setLoginRequestHandler";
import { getClientAuth } from "./getClientAuth";
import { login } from "./login";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getReturnUrl } from "./utils/getReturnUrl";
import { getSidAndUserFromRequest } from "./utils/getSidAndUserFromRequest";
import { throttledReject } from "./utils/throttledReject";

export { getClientRequestIPsInfo };
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
  logoutGetPath: "/logout",
  magicLinksRoute: "/magic-link",
  magicLinksExpressRoute: "/magic-link/:id",
  confirmEmail: "/confirm-email",
  confirmEmailExpressRoute: "/confirm-email",
  catchAll: "*",
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

  matchesRoute = (route: string | undefined, clientFullRoute: string) => {
    return (
      route &&
      clientFullRoute &&
      (route === clientFullRoute ||
        (clientFullRoute.startsWith(route) &&
          ["/", "?", "#"].includes(clientFullRoute[route.length] ?? "")))
    );
  };

  isUserRoute = (pathname: string) => {
    const { login, logoutGetPath, magicLinksRoute, loginWithProvider } = AUTH_ROUTES_AND_PARAMS;
    const pubRoutes = [
      ...(this.opts.loginSignupConfig?.publicRoutes || []),
      login,
      logoutGetPath,
      magicLinksRoute,
      loginWithProvider,
    ].filter((publicRoute) => publicRoute);

    return !pubRoutes.some((publicRoute) => {
      return this.matchesRoute(publicRoute, pathname);
    });
  };

  setCookieAndGoToReturnURLIFSet = (
    cookie: { sid: string; expires: number },
    r: { req: ExpressReq; res: LoginResponseHandler }
  ) => {
    const { sid, expires } = cookie;
    const { res, req } = r;
    if (!sid) {
      throw "no sid";
    }

    const maxAgeOneDay = 60 * 60 * 24; // 24 hours;
    type CD = { maxAge: number } | { expires: Date };
    let cookieDuration: CD = {
      maxAge: maxAgeOneDay,
    };

    if (expires && Number.isFinite(expires) && !isNaN(+new Date(expires))) {
      cookieDuration = { expires: new Date(expires) };
      const days = (+cookieDuration.expires - Date.now()) / (24 * 60 * 60e3);
      if (days >= 400) {
        console.warn(`Cookie expiration is higher than the Chrome 400 day limit: ${days}days`);
      }
    }

    const cookieOpts = {
      ...cookieDuration,
      // The cookie only accessible by the web server
      httpOnly: true,
      //signed: true
      secure: true,
      sameSite: "strict" as const,
      ...(this.opts.loginSignupConfig?.cookieOptions ?? {}),
    };
    const cookieData = sid;
    res.cookie(this.sidKeyName, cookieData, cookieOpts);
    const successURL = getReturnUrl(req) || "/";
    res.redirect(successURL);
  };

  getUserAndHandleError = async (localParams: AuthClientRequest): Promise<AuthResultWithSID> => {
    const sid = this.getSID(localParams);
    if (!sid) return { sid };
    const handlerError = (
      codeOrError: AuthResponse.AuthFailure["code"] | AuthResponse.AuthFailure
    ) => {
      const error =
        typeof codeOrError === "string" ?
          { success: false, code: codeOrError, message: codeOrError }
        : codeOrError;
      if (localParams.httpReq) {
        localParams.res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(error);
        return { sid: undefined };
      }
      throw error.code;
    };
    try {
      const userOrErrorCode = await throttledReject(async () => {
        return this.opts.getUser(
          this.validateSid(sid),
          this.dbo as DBOFullyTyped,
          this.db,
          getClientRequestIPsInfo(localParams),
          localParams
        );
      }, 50);

      if (
        userOrErrorCode &&
        (typeof userOrErrorCode === "string" || "success" in userOrErrorCode)
      ) {
        return handlerError(userOrErrorCode);
      }
      if (sid && userOrErrorCode?.user) {
        return { sid, ...userOrErrorCode };
      }
      return {
        sid,
      };
    } catch (_err) {
      return handlerError("server-error");
    }
  };

  init = setupAuthRoutes.bind(this);

  destroy = () => {
    const app = this.opts.loginSignupConfig?.app;
    const {
      login,
      logoutGetPath,
      magicLinksExpressRoute,
      catchAll,
      loginWithProvider,
      emailRegistration: emailSignup,
      magicLinksRoute,
      confirmEmail,
      confirmEmailExpressRoute,
    } = AUTH_ROUTES_AND_PARAMS;
    removeExpressRoute(app, [
      login,
      logoutGetPath,
      magicLinksExpressRoute,
      catchAll,
      loginWithProvider,
      emailSignup,
      magicLinksRoute,
      confirmEmail,
      confirmEmailExpressRoute,
    ]);
  };

  login = login.bind(this);

  /**
   * Will return first sid value found in:
   *  - Bearer header
   *  - http cookie
   *  - query params
   * Based on sid names in auth
   */
  getSID(maybeClientReq: AuthClientRequest | undefined): string | undefined {
    if (!maybeClientReq) return undefined;
    const { sidKeyName } = this;
    if (maybeClientReq.socket) {
      const { handshake } = maybeClientReq.socket;
      const querySid = handshake.auth?.[sidKeyName] || handshake.query?.[sidKeyName];
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = maybeClientReq.socket.handshake.headers?.cookie;
        const cookie = parseCookieStr(cookie_str);
        rawSid = cookie[sidKeyName];
      }
      return this.validateSid(rawSid);
    } else {
      const [tokenType, base64Token] =
        maybeClientReq.httpReq.headers.authorization?.split(" ") ?? [];
      let bearerSid: string | undefined;
      if (tokenType && base64Token) {
        if (tokenType.trim() !== "Bearer") {
          throw "Only Bearer Authorization header allowed";
        }
        bearerSid = Buffer.from(base64Token, "base64").toString();
      }
      return this.validateSid(bearerSid ?? maybeClientReq.httpReq.cookies?.[sidKeyName]);
    }

    function parseCookieStr(cookie_str: string | undefined): any {
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
    }
  }

  /**
   * Used for logging
   */
  getSIDNoError = (clientReq: AuthClientRequest | undefined): string | undefined => {
    if (!clientReq) return undefined;
    try {
      return this.getSID(clientReq);
    } catch {
      return undefined;
    }
  };

  getUserFromRequest = async (clientReq: AuthClientRequest): Promise<AuthResult> => {
    const sidAndUser = await this.getSidAndUserFromRequest(clientReq);
    if (sidAndUser.sid && sidAndUser.user) {
      return sidAndUser;
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
