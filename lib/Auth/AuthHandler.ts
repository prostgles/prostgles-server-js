import {
  AnyObject,
  AuthGuardLocation,
  AuthGuardLocationResponse,
  AuthSocketSchema,
  CHANNELS,
} from "prostgles-types";
import { LocalParams, PRGLIOSocket } from "../DboBuilder/DboBuilder";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { removeExpressRoute } from "../FileManager/FileManager";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import {
  Auth,
  AuthResult,
  BasicSession,
  ExpressReq,
  ExpressRes,
  LoginClientInfo,
  LoginParams,
  LoginResponse,
} from "./AuthTypes";
import { getProviders } from "./setAuthProviders";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getReturnUrl } from "./utils/getReturnUrl";

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
  loginWithProvider: "/auth",
  emailRegistration: "/register",
  returnUrlParamName: "returnURL",
  sidKeyName: "session_id",
  logoutGetPath: "/logout",
  magicLinksRoute: "/magic-link",
  magicLinksExpressRoute: "/magic-link/:id",
  confirmEmail: "/confirm-email",
  confirmEmailExpressRoute: "/confirm-email/:id",
  catchAll: "*",
} as const;

export class AuthHandler {
  protected prostgles: Prostgles;
  protected opts: Auth;
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
      ...(this.opts.expressConfig?.publicRoutes || []),
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
    r: { req: ExpressReq; res: ExpressRes }
  ) => {
    const { sid, expires } = cookie;
    const { res, req } = r;
    if (sid) {
      const maxAgeOneDay = 60 * 60 * 24; // 24 hours;
      type CD = { maxAge: number } | { expires: Date };
      let cookieDuration: CD = {
        maxAge: maxAgeOneDay,
      };
      if (expires && Number.isFinite(expires) && !isNaN(+new Date(expires))) {
        // const maxAge = (+new Date(expires)) - Date.now();
        cookieDuration = { expires: new Date(expires) };
        const days = (+cookieDuration.expires - Date.now()) / (24 * 60 * 60e3);
        if (days >= 400) {
          console.warn(`Cookie expiration is higher than the Chrome 400 day limit: ${days}days`);
        }
      }

      const cookieOpts = {
        ...cookieDuration,
        httpOnly: true, // The cookie only accessible by the web server
        //signed: true // Indicates if the cookie should be signed
        secure: true,
        sameSite: "strict" as const,
        ...(this.opts.expressConfig?.cookieOptions || {}),
      };
      const cookieData = sid;
      res.cookie(this.sidKeyName, cookieData, cookieOpts);
      const successURL = getReturnUrl(req) || "/";
      res.redirect(successURL);
    } else {
      throw "no user or session";
    }
  };

  getUser = async (clientReq: { httpReq: ExpressReq }): Promise<AuthResult> => {
    const sid = clientReq.httpReq.cookies?.[this.sidKeyName];
    if (!sid) return undefined;

    try {
      return this.throttledFunc(async () => {
        return this.opts!.getUser(
          this.validateSid(sid),
          this.dbo as any,
          this.db,
          getClientRequestIPsInfo(clientReq)
        );
      }, 50);
    } catch (err) {
      console.error(err);
    }
    return undefined;
  };

  init = setupAuthRoutes.bind(this);

  destroy = () => {
    const app = this.opts.expressConfig?.app;
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

  throttledFunc = <T>(func: () => Promise<T>, throttle = 500): Promise<T> => {
    return new Promise(async (resolve, reject) => {
      let result: T,
        error: any,
        finished = false;

      /**
       * Throttle reject response times to prevent timing attacks
       */
      const interval = setInterval(() => {
        if (finished) {
          clearInterval(interval);
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      }, throttle);

      try {
        result = await func();
        resolve(result);
        clearInterval(interval);
      } catch (err) {
        console.log(err);
        error = err;
      }

      finished = true;
    });
  };

  loginThrottledAndValidate = async (
    params: LoginParams,
    client: LoginClientInfo
  ): Promise<LoginResponse> => {
    if (!this.opts.login) throw "Auth login config missing";
    const { responseThrottle = 500 } = this.opts;
    return this.throttledFunc(async () => {
      const result = await this.opts.login?.(params, this.dbo as DBOFullyTyped, this.db, client);

      const withServerError = (msg: string): LoginResponse => ({
        response: {
          success: false,
          code: "something-went-wrong",
          message: msg,
        },
      });
      if (!result) {
        return withServerError(
          "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number }"
        );
      }
      if (result.session) {
        const { sid, expires } = result.session;
        if (!sid) {
          return withServerError("Invalid sid");
        }
        if (sid && (typeof sid !== "string" || typeof expires !== "number")) {
          return withServerError(
            "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number }"
          );
        }
        if (expires < Date.now()) {
          return withServerError(
            "auth.login() is returning an expired session. Can only login with a session.expires greater than Date.now()"
          );
        }
      }

      return result;
    }, responseThrottle);
  };

  loginThrottledAndSetCookie = async (
    req: ExpressReq,
    res: ExpressRes,
    loginParams: LoginParams
  ) => {
    const start = Date.now();
    const loginResponse = await this.loginThrottledAndValidate(
      loginParams,
      getClientRequestIPsInfo({ httpReq: req })
    );
    await this.prostgles.opts.onLog?.({
      type: "auth",
      command: "login",
      success: !!loginResponse.session,
      duration: Date.now() - start,
      sid: loginResponse.session?.sid,
      socketId: undefined,
    });
    if (!loginResponse.session) {
      return res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(loginResponse.response);
    }
    this.setCookieAndGoToReturnURLIFSet(loginResponse.session, { req, res });
  };

  /**
   * Will return first sid value found in:
   *  Bearer header
   *  http cookie
   *  query params
   * Based on sid names in auth
   */
  getSID(localParams: LocalParams | undefined): string | undefined {
    if (!localParams) return undefined;
    const { sidKeyName } = this;
    if (localParams.socket) {
      const { handshake } = localParams.socket;
      const querySid = handshake.auth?.[sidKeyName] || handshake.query?.[sidKeyName];
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = localParams.socket.handshake.headers?.cookie;
        const cookie = parseCookieStr(cookie_str);
        rawSid = cookie[sidKeyName];
      }
      return this.validateSid(rawSid);
    } else if (localParams.httpReq) {
      const [tokenType, base64Token] = localParams.httpReq.headers.authorization?.split(" ") ?? [];
      let bearerSid: string | undefined;
      if (tokenType && base64Token) {
        if (tokenType.trim() !== "Bearer") {
          throw "Only Bearer Authorization header allowed";
        }
        bearerSid = Buffer.from(base64Token, "base64").toString();
      }
      return this.validateSid(bearerSid ?? localParams.httpReq.cookies?.[sidKeyName]);
    } else throw "socket OR httpReq missing from localParams";

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
  getSIDNoError = (localParams: LocalParams | undefined): string | undefined => {
    if (!localParams) return undefined;
    try {
      return this.getSID(localParams);
    } catch {
      return undefined;
    }
  };

  /**
   * For a given sid return the user data if available
   */
  async getClientInfo(
    localParams: Pick<LocalParams, "socket" | "httpReq">
  ): Promise<AuthResult<any>> {
    /**
     * Get cached session if available
     */
    const getSession = this.opts.cacheSession?.getSession;
    const isSocket = "socket" in localParams;
    if (isSocket && getSession && localParams.socket?.__prglCache) {
      const { session, user, clientUser } = localParams.socket.__prglCache;
      const isValid = this.isValidSocketSession(localParams.socket, session);
      if (isValid) {
        return {
          sid: session.sid,
          user,
          clientUser,
        };
      } else
        return {
          sid: session.sid,
        };
    }

    /**
     * Get sid from request and fetch user data
     */
    const authStart = Date.now();
    const clientInfo = await this.throttledFunc(async () => {
      const { getUser } = this.opts;

      if (localParams.httpReq || localParams.socket) {
        const sid = this.getSID(localParams);
        const clientReq =
          localParams.httpReq ? { httpReq: localParams.httpReq } : { socket: localParams.socket! };
        let user, clientUser;
        if (sid) {
          const clientInfo = await getUser(
            sid,
            this.dbo as any,
            this.db,
            getClientRequestIPsInfo(clientReq)
          );
          user = clientInfo?.user;
          clientUser = clientInfo?.clientUser;
        }
        if (getSession && isSocket) {
          const session = await getSession(sid, this.dbo as any, this.db);
          if (session && session.expires && user && clientUser && localParams.socket) {
            localParams.socket.__prglCache = {
              session,
              user,
              clientUser,
            };
          }
        }
        if (sid) {
          return { sid, user, clientUser };
        }
      }

      return {};
    }, 5);

    await this.prostgles.opts.onLog?.({
      type: "auth",
      command: "getClientInfo",
      duration: Date.now() - authStart,
      sid: clientInfo.sid,
      socketId: localParams.socket?.id,
    });
    return clientInfo;
  }

  isValidSocketSession = (socket: PRGLIOSocket, session: BasicSession | undefined): boolean => {
    const hasExpired = Boolean(session && session.expires <= Date.now());
    if (this.opts.expressConfig?.publicRoutes && !this.opts.expressConfig.disableSocketAuthGuard) {
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

  getClientAuth = async (
    clientReq: Pick<LocalParams, "socket" | "httpReq">
  ): Promise<{ auth: AuthSocketSchema; userData: AuthResult }> => {
    let pathGuard = false;
    if (this.opts.expressConfig?.publicRoutes && !this.opts.expressConfig.disableSocketAuthGuard) {
      pathGuard = true;

      if ("socket" in clientReq && clientReq.socket) {
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
                !(await this.getClientInfo({ socket }))?.user
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

    const userData = await this.getClientInfo(clientReq);
    const { email } = this.opts.expressConfig?.registrations ?? {};
    const auth: AuthSocketSchema = {
      providers: getProviders.bind(this)(),
      register: email && {
        type: email.signupType,
        url: AUTH_ROUTES_AND_PARAMS.emailRegistration,
      },
      user: userData?.clientUser,
      loginType: email?.signupType ?? "withPassword",
      pathGuard,
    };
    return { auth, userData };
  };
}
