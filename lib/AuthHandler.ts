import { Express, NextFunction, Request, Response } from "express";
import { AnyObject, AuthGuardLocation, AuthGuardLocationResponse, CHANNELS, FieldFilter } from "prostgles-types";
import { LocalParams, PRGLIOSocket } from "./DboBuilder/DboBuilder";
import { DBOFullyTyped } from "./DBSchemaBuilder";
import { removeExpressRoute } from "./FileManager/FileManager";
import { DB, DBHandlerServer, Prostgles } from "./Prostgles";
type Awaitable<T> = T | Promise<T>;
type AuthSocketSchema = {
  user?: AnyObject;
  register?: boolean;
  login?: boolean;
  logout?: boolean;
  pathGuard?: boolean;
};

export type ExpressReq = Request;
export type ExpressRes = Response;

export type LoginClientInfo = {
  ip_address: string;
  ip_address_remote: string | undefined;
  x_real_ip: string | undefined;
  user_agent: string | undefined;
};

export type BasicSession = {

  /** Must be hard to bruteforce */
  sid: string;

  /** UNIX millisecond timestamp */
  expires: number;

  /** On expired */
  onExpiration: "redirect" | "show_error";
};
export type AuthClientRequest = { socket: PRGLIOSocket } | { httpReq: ExpressReq };
export type UserLike = {
  id: string;
  type: string;
  [key: string]: any;
}
export type SessionUser<ServerUser extends UserLike = UserLike, ClientUser extends AnyObject = AnyObject> = {
  /** 
   * This user will be available in all serverside prostgles options
   * id and type values will be available in the prostgles.user session variable in postgres
   * */
  user: ServerUser;
  /**
   * Controls which fields from user are available in postgres session variable
   */
  sessionFields?: FieldFilter<ServerUser>;
  /**
   * User data sent to the authenticated client
   */
  clientUser: ClientUser;
}

export type AuthResult<SU = SessionUser> = SU & { sid: string; } | {
  user?: undefined; 
  clientUser?: undefined; 
  sid?: string;
} | undefined;

export const HTTPCODES = { 
  AUTH_ERROR: 401,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
};

export const getLoginClientInfo = (req: AuthClientRequest): AuthClientRequest & LoginClientInfo => {
  if("httpReq" in req){
    const ip_address = req.httpReq.ip;
    if(!ip_address) throw new Error("ip_address missing from req.httpReq");
    const user_agent = req.httpReq.headers["user-agent"];
    return { 
      ...req, 
      ip_address,
      ip_address_remote: req.httpReq.connection.remoteAddress,
      x_real_ip: req.httpReq.headers['x-real-ip'] as any,
      user_agent,
    };
  } else {
    return {
      ...req,
      ip_address: req.socket.handshake.address,
      ip_address_remote: req.socket.request.connection.remoteAddress,
      x_real_ip: req.socket.handshake.headers?.["x-real-ip"],
      user_agent: req.socket.handshake.headers?.['user-agent'],
    }
  }
}

export type AuthRequestParams<S, SUser extends SessionUser> = { db: DB, dbo: DBOFullyTyped<S>; getUser: () => Promise<AuthResult<SUser>> }

export type Auth<S = void, SUser extends SessionUser = SessionUser> = {
  /**
   * Name of the cookie or socket hadnshake query param that represents the session id. 
   * Defaults to "session_id"
   */
  sidKeyName?: string;

  /**
   * Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
   */
  responseThrottle?: number;

  expressConfig?: {
    /**
     * Express app instance. If provided Prostgles will attempt to set sidKeyName to user cookie
     */
    app: Express;

    /**
     * Used in allowing logging in through express. Defaults to /login
     */
    loginRoute?: string;

    /**
     * Used in allowing logging out through express. Defaults to /logout
     */
    logoutGetPath?: string;

    /**
     * Options used in setting the cookie after a successful login
     */
    cookieOptions?: AnyObject;

    /**
     * False by default. If false and userRoutes are provided then the socket will request window.location.reload if the current url is on a user route.
     */
    disableSocketAuthGuard?: boolean;

    /**
     * If provided, any client requests to NOT these routes (or their subroutes) will be redirected to loginRoute (if logged in) and then redirected back to the initial route after logging in
     * If logged in the user is allowed to access these routes
     */
    publicRoutes?: string[];

    /**
     * Will attach a app.use listener and will expose getUser
     * Used for blocking access
     */
    use?: (args: { req: ExpressReq; res: ExpressRes, next: NextFunction } & AuthRequestParams<S, SUser>) => void | Promise<void>;

    /**
     * Will be called after a GET request is authorised
     * This means that 
     */
    onGetRequestOK?: (
      req: ExpressReq, 
      res: ExpressRes, 
      params: AuthRequestParams<S, SUser>
    ) => any;

    /**
     * Name of get url parameter used in redirecting user after successful login. 
     * Defaults to "returnURL"
     */
    returnUrlParamName?: string;

    magicLinks?: {

      /**
       * Will default to /magic-link
       */
      route?: string;

      /**
       * Used in creating a session/logging in using a magic link
       */
      check: (magicId: string, dbo: DBOFullyTyped<S>, db: DB, client: LoginClientInfo) => Awaitable<BasicSession | undefined>;
    }

  }

  /**
   * undefined sid is allowed to enable public users
   */
  getUser: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB, client: AuthClientRequest & LoginClientInfo) => Awaitable<AuthResult<SUser>>;

  register?: (params: AnyObject, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession> | BasicSession;
  login?: (params: AnyObject, dbo: DBOFullyTyped<S>, db: DB, client: LoginClientInfo) => Awaitable<BasicSession> | BasicSession;
  logout?: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<any>;

  /**
   * If provided then session info will be saved on socket.__prglCache and reused from there
   */
  cacheSession?: {
    getSession: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession>
  }
}

export class AuthHandler {
  protected prostgles: Prostgles;
  protected opts?: Auth;
  dbo: DBHandlerServer;
  db: DB;
  sidKeyName?: string;

  routes: {
    login?: string;
    returnUrlParamName?: string;
    logoutGetPath?: string;
    magicLinks?: {
      route: string;
      expressRoute: string;
    }
    readonly catchAll: '*';
  } = {
    catchAll: "*"
  }

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.opts = prostgles.opts.auth as any;
    if (prostgles.opts.auth?.expressConfig) {
      const { magicLinks, returnUrlParamName, loginRoute, logoutGetPath } = prostgles.opts.auth.expressConfig;
      const magicLinksRoute = magicLinks?.route || "/magic-link"
      this.routes = {
        magicLinks: magicLinks? {
          expressRoute: `${magicLinksRoute}/:id`,
          route: magicLinksRoute
        } : undefined,
        returnUrlParamName: returnUrlParamName || "returnURL",
        login: loginRoute || "/login",
        logoutGetPath: logoutGetPath || "/logout",
        catchAll: "*"
      }
    }
    if(!prostgles.dbo || !prostgles.db) throw "dbo or db missing";
    this.dbo = prostgles.dbo;
    this.db = prostgles.db;
  }

  validateSid = (sid: string | undefined) => {
    if (!sid) return undefined;
    if (typeof sid !== "string") throw "sid missing or not a string";
    return sid;
  }

  matchesRoute = (route: string | undefined, clientFullRoute: string) => {
    return route && clientFullRoute && (
      route === clientFullRoute ||
      clientFullRoute.startsWith(route) && ["/", "?", "#"].includes(clientFullRoute[route.length] ?? "")
    )
  }

  isUserRoute = (pathname: string) => {
    const pubRoutes = [
      ...this.opts?.expressConfig?.publicRoutes || [],
    ];
    if (this.routes?.login) pubRoutes.push(this.routes.login);
    if (this.routes?.logoutGetPath) pubRoutes.push(this.routes.logoutGetPath);
    if (this.routes?.magicLinks?.route) pubRoutes.push(this.routes.magicLinks.route);

    return !pubRoutes.some(publicRoute => {
      return this.matchesRoute(publicRoute, pathname);
    });
  }

  private setCookieAndGoToReturnURLIFSet = (cookie: { sid: string; expires: number; }, r: { req: ExpressReq; res: ExpressRes }) => {
    const { sid, expires } = cookie;
    const { res, req } = r;
    if (sid) {
      const maxAgeOneDay = 60 * 60 * 24; // 24 hours;
      type CD = { maxAge: number } | { expires: Date }
      let cookieDuration: CD = {
        maxAge: maxAgeOneDay
      }
      if(expires && Number.isFinite(expires) && !isNaN(+ new Date(expires))){
        // const maxAge = (+new Date(expires)) - Date.now();
        cookieDuration = { expires: new Date(expires) };
        const days = (+cookieDuration.expires - Date.now())/(24 * 60 * 60e3);
        if(days >= 400){
          console.warn(`Cookie expiration is higher than the Chrome 400 day limit: ${days}days`)
        }
      }
      
      const cookieOpts = { 
        ...cookieDuration, 
        httpOnly: true, // The cookie only accessible by the web server
        //signed: true // Indicates if the cookie should be signed
        secure: true, 
        sameSite: "strict" as const, 
        ...(this.opts?.expressConfig?.cookieOptions || {}) 
      };
      const cookieData = sid;
      if(!this.sidKeyName || !this.routes?.returnUrlParamName) throw "sidKeyName or returnURL missing"
      res.cookie(this.sidKeyName, cookieData, cookieOpts);
      const successURL = this.getReturnUrl(req) || "/";
      res.redirect(successURL);

    } else {
      throw ("no user or session")
    }
  }

  getUser = async (clientReq: { httpReq: ExpressReq; }): Promise<AuthResult> => {
    if(!this.sidKeyName || !this.opts?.getUser) {
      throw "sidKeyName or this.opts.getUser missing";
    }
    const sid = clientReq.httpReq?.cookies?.[this.sidKeyName];
    if (!sid) return undefined;

    try {
      return this.throttledFunc(async () => {
        return this.opts!.getUser(this.validateSid(sid), this.dbo as any, this.db, getLoginClientInfo(clientReq));
      }, 50)
    } catch (err) {
      console.error(err);
    }
    return undefined;
  }

  async init() {
    if (!this.opts) return;

    this.opts.sidKeyName = this.opts.sidKeyName || "session_id";
    const { sidKeyName, login, getUser, expressConfig } = this.opts;
    this.sidKeyName = this.opts.sidKeyName;

    if (typeof sidKeyName !== "string" && !login) {
      throw "Invalid auth: Provide { sidKeyName: string } ";
    }
    /**
     * Why ??? Collision with socket.io ???
     */
    if (this.sidKeyName === "sid") throw "sidKeyName cannot be 'sid' please provide another name.";

    if (!getUser) throw "getUser missing from auth config";

    if (expressConfig) {
      const { app, publicRoutes = [], onGetRequestOK, magicLinks, use } = expressConfig;
      if (publicRoutes.find(r => typeof r !== "string" || !r)) {
        throw "Invalid or empty string provided within publicRoutes "
      }

      if(use){
        app.use((req, res, next) => {
          use({ 
            req, 
            res, 
            next, 
            getUser: () => this.getUser({ httpReq: req }) as any,
            dbo: this.dbo as DBOFullyTyped, 
            db: this.db,
          })
        })
      }

      if (magicLinks && this.routes.magicLinks) {
        const { check } = magicLinks;
        if (!check) throw "Check must be defined for magicLinks";

        app.get(this.routes.magicLinks?.expressRoute, async (req: ExpressReq, res: ExpressRes) => {
          const { id } = req.params ?? {};

          if (typeof id !== "string" || !id) {
            res.status(HTTPCODES.BAD_REQUEST).json({ msg: "Invalid magic-link id. Expecting a string" });
          } else {
            try {
              const session = await this.throttledFunc(async () => {
                return check(id, this.dbo as any, this.db, getLoginClientInfo({ httpReq: req }));
              });
              if (!session) {
                res.status(HTTPCODES.AUTH_ERROR).json({ msg: "Invalid magic-link" });
              } else {
                this.setCookieAndGoToReturnURLIFSet(session, { req, res });
              }

            } catch (e) {
              res.status(HTTPCODES.AUTH_ERROR).json({ msg: e });
            }
          }
        });
      }

      const loginRoute = this.routes?.login;
      if (loginRoute) {
        

        app.post(loginRoute, async (req: ExpressReq, res: ExpressRes) => {
          try {
            const start = Date.now();
            const { sid, expires } = await this.loginThrottled(req.body || {}, getLoginClientInfo({ httpReq: req })) || {};
            await this.prostgles.opts.onLog?.({
              type: "auth",
              command: "login",
              duration: Date.now() - start,
              sid,
              socketId: undefined,
            })
            if (sid) {

              this.setCookieAndGoToReturnURLIFSet({ sid, expires }, { req, res });

            } else {
              throw ("Internal error: no user or session")
            }
          } catch (err) {
            console.log(err)
            res.status(HTTPCODES.AUTH_ERROR).json({ err });
          }

        });

        if (this.routes.logoutGetPath && this.opts.logout) {
          app.get(this.routes.logoutGetPath, async (req: ExpressReq, res: ExpressRes) => {
            const sid = this.validateSid(req?.cookies?.[sidKeyName]);
            if (sid) {
              try {
                await this.throttledFunc(() => {
                  return this.opts!.logout!(req?.cookies?.[sidKeyName], this.dbo as any, this.db);
                })
              } catch (err) {
                console.error(err);
              }
            }
            res.redirect("/")
          });
        }

        if (Array.isArray(publicRoutes)) {

          /* Redirect if not logged in and requesting non public content */
          app.get(this.routes.catchAll, async (req: ExpressReq, res: ExpressRes, next) => {
            const clientReq: AuthClientRequest = { httpReq: req }
            const getUser = this.getUser;
            if(this.prostgles.restApi){
              if(Object.values(this.prostgles.restApi.routes).some(restRoute => this.matchesRoute(restRoute.split("/:")[0], req.path))){
                next();
                return;
              }
            }
            try {
              const returnURL = this.getReturnUrl(req);

              /**
               * Requesting a User route
               */
              if (this.isUserRoute(req.path)) {

                /* Check auth. Redirect to login if unauthorized */
                const u = await getUser(clientReq);
                if (!u) {
                  res.redirect(`${loginRoute}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                  return;
                }

                /* If authorized and going to returnUrl then redirect. Otherwise serve file */
              } else if (returnURL && (await getUser(clientReq))) {

                res.redirect(returnURL);
                return;

                /** If Logged in and requesting login then redirect to main page */
              } else if (this.matchesRoute(loginRoute, req.path) && (await getUser(clientReq))) {

                res.redirect("/");
                return;
              }

              onGetRequestOK?.(req, res, { getUser: () => getUser(clientReq), dbo: this.dbo as DBOFullyTyped, db: this.db })

            } catch (error) {
              console.error(error);
              const errorMessage = typeof error === "string" ? error : error instanceof Error ? error.message : "";
              res.status(HTTPCODES.AUTH_ERROR).json({ msg: "Something went wrong when processing your request" + (errorMessage? (": " + errorMessage) : "") });
            }

          });
        }
      }
    }
  }

  getReturnUrl = (req: ExpressReq) => {
    const { returnUrlParamName } = this.routes;
    if (returnUrlParamName && req?.query?.[returnUrlParamName]) {
      const returnURL = decodeURIComponent(req?.query?.[returnUrlParamName] as string);
      
      return getSafeReturnURL(returnURL, returnUrlParamName);
    }
    return null;
  }

  destroy = () => {
    const app = this.opts?.expressConfig?.app;
    const { login, logoutGetPath, magicLinks } = this.routes;
    removeExpressRoute(app, [login, logoutGetPath, magicLinks?.expressRoute]);
  }

  throttledFunc = <T>(func: () => Promise<T>, throttle = 500): Promise<T> => {

    return new Promise(async (resolve, reject) => {

      let result: any, error: any, finished = false;

      /**
       * Throttle reject response times to prevent timing attacks
       */
      const interval = setInterval(() => {
        if (finished) {
          clearInterval(interval);
          if (error) {
            reject(error);
          } else {
            resolve(result)
          }
        }
      }, throttle);


      try {
        result = await func();
        resolve(result);
        clearInterval(interval);
      } catch (err) {
        console.log(err)
        error = err;
      }

      finished = true;
    })
  }

  loginThrottled = async (params: AnyObject, client: LoginClientInfo): Promise<BasicSession> => {
    if (!this.opts?.login) throw "Auth login config missing";
    const { responseThrottle = 500 } = this.opts;

    return this.throttledFunc(async () => {
      const result = await this.opts?.login?.(params, this.dbo as DBOFullyTyped, this.db, client);
      const err = {
        msg: "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number } but got: " + JSON.stringify(result) 
      }
      
      if(!result) throw err;
      if(result && (typeof result.sid !== "string" || typeof result.expires !== "number") || !result && ![undefined, null].includes(result)) {
        throw err
      }
      if(result && result.expires < Date.now()){
        throw { msg: "auth.login() is returning an expired session. Can only login with a session.expires greater than Date.now()"}
      }

      return result;
    }, responseThrottle);

  }


  /**
   * Will return first sid value found in:
   *  Bearer header 
   *  http cookie 
   *  query params
   * Based on sid names in auth
   */
  getSID(localParams: LocalParams): string | undefined {
    if (!this.opts) return undefined;

    const { sidKeyName } = this.opts;

    if (!sidKeyName || !localParams) return undefined;

    if (localParams.socket) {
      const { handshake } = localParams.socket;
      const querySid = handshake?.auth?.[sidKeyName] || handshake?.query?.[sidKeyName];
      let rawSid = querySid;
      if (!rawSid) {
        const cookie_str = localParams.socket?.handshake?.headers?.cookie;
        const cookie = parseCookieStr(cookie_str);
        rawSid = cookie[sidKeyName];
      }
      return this.validateSid(rawSid);

    } else if (localParams.httpReq) {
      const [tokenType, base64Token] = localParams.httpReq.headers.authorization?.split(' ') ?? [];
      let bearerSid: string | undefined;
      if(tokenType && base64Token){
        if(tokenType.trim() !== "Bearer"){
          throw "Only Bearer Authorization header allowed";
        }
        bearerSid = Buffer.from(base64Token, 'base64').toString();
      }
      return this.validateSid(bearerSid ?? localParams.httpReq?.cookies?.[sidKeyName]);

    } else throw "socket OR httpReq missing from localParams";

    function parseCookieStr(cookie_str: string | undefined): any {
      if (!cookie_str || typeof cookie_str !== "string") {
        return {}
      }

      return cookie_str.replace(/\s/g, '')
        .split(";")
        .reduce<AnyObject>((prev, current) => {
          const [name, value] = current.split('=');
          prev[name!] = value;
          return prev;
        }, {});
    }
  }

  /**
   * Used for logging
   */
  getSIDNoError = (localParams: LocalParams | undefined): string | undefined => {
    if(!localParams) return undefined;
    try {
      return this.getSID(localParams);
    } catch (err) {
      return undefined;
    }
  }

  async getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<AuthResult> {
    if (!this.opts) return {};

    const getSession = this.opts.cacheSession?.getSession;
    const isSocket = "socket" in localParams;
    if(isSocket){
      if(getSession && localParams.socket?.__prglCache){
        const { session, user, clientUser } = localParams.socket.__prglCache;
        const isValid = this.isValidSocketSession(localParams.socket, session)
        if(isValid){
  
          return {
            sid: session.sid,
            user, 
            clientUser,
          }
        } else return {
          sid: session.sid
        };
      } 
    }

    const authStart = Date.now();
    const res = await this.throttledFunc(async () => {

      const { getUser } = this.opts ?? {};

      if (getUser && localParams && (localParams.httpReq || localParams.socket)) {
        const sid = this.getSID(localParams);
        const clientReq = localParams.httpReq? { httpReq: localParams.httpReq } : { socket: localParams.socket! };
        let user, clientUser;
        if(sid){
          const res = await getUser(sid, this.dbo as any, this.db, getLoginClientInfo(clientReq)) as any;
          user = res?.user;
          clientUser = res?.clientUser;
        }
        if(getSession && isSocket){
          const session = await getSession(sid, this.dbo as any, this.db)
          if(session?.expires && user && clientUser && localParams.socket){
            localParams.socket.__prglCache = { 
              session,
              user, 
              clientUser,
            }
          }
        }
        if(sid) {
          return { sid, user, clientUser }
        }
      }
  
      return {};
    }, 5);

    await this.prostgles.opts.onLog?.({ 
      type: "auth", 
      command: "getClientInfo", 
      duration: Date.now() - authStart,
      sid: res.sid,
      socketId: localParams.socket?.id,
    });
    return res;
  }

  isValidSocketSession = (socket: PRGLIOSocket, session: BasicSession): boolean => {
    const hasExpired = Boolean(session && session.expires <= Date.now())
    if(this.opts?.expressConfig?.publicRoutes && !this.opts.expressConfig?.disableSocketAuthGuard){
      const error = "Session has expired";
      if(hasExpired){
        if(session.onExpiration === "redirect")
        socket.emit(CHANNELS.AUTHGUARD, { 
          shouldReload: session.onExpiration === "redirect",
          error
        });
        throw error;
      }
    }
    return Boolean(session && !hasExpired);
  }

  makeSocketAuth = async (socket: PRGLIOSocket): Promise<{ auth: AuthSocketSchema; userData: AuthResult; } | Record<string, never>> => {
    if (!this.opts) return {};

    const auth: Partial<Record<keyof Omit<AuthSocketSchema, "user">, boolean | undefined>> & { user?: AnyObject | undefined } = {};

    if (this.opts.expressConfig?.publicRoutes && !this.opts.expressConfig?.disableSocketAuthGuard) {

      auth.pathGuard = true;

      socket.removeAllListeners(CHANNELS.AUTHGUARD)
      socket.on(CHANNELS.AUTHGUARD, async (params: AuthGuardLocation, cb = (_err: any, _res?: AuthGuardLocationResponse) => { /** EMPTY */ }) => {

        try {

          const { pathname, origin } = typeof params === "string" ? JSON.parse(params) : (params || {});
          if (pathname && typeof pathname !== "string") {
            console.warn("Invalid pathname provided for AuthGuardLocation: ", pathname);
          }
          
          /** These origins  */
          const IGNORED_API_ORIGINS = ["file://"]
          if (!IGNORED_API_ORIGINS.includes(origin) && pathname && typeof pathname === "string" && this.isUserRoute(pathname) && !(await this.getClientInfo({ socket }))?.user) {
            cb(null, { shouldReload: true });
          } else {
            cb(null, { shouldReload: false });
          }

        } catch (err) {
          console.error("AUTHGUARD err: ", err);
          cb(err)
        }
      });
    }

    const {
      register,
      logout
    } = this.opts;
    const login = this.loginThrottled

    let handlers: { 
      name: keyof Omit<AuthSocketSchema, "user">;
      ch: string;
      func: (...args: any) => any;
    }[] = [
      { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => register?.(params, dbo, db), ch: CHANNELS.REGISTER, name: "register" as keyof Omit<AuthSocketSchema, "user"> },
      { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => login(params, client), ch: CHANNELS.LOGIN, name: "login" as keyof Omit<AuthSocketSchema, "user"> },
      { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => logout?.(this.getSID({ socket }), dbo, db), ch: CHANNELS.LOGOUT, name: "logout"  as keyof Omit<AuthSocketSchema, "user">}
    ].filter(h => h.func);

    const userData = await this.getClientInfo({ socket });
    if (userData) {
      auth.user = userData.clientUser;
      handlers = handlers.filter(h => h.name === "logout");
    }

    handlers.map(({ func, ch, name }) => {
      auth[name] = true;

      socket.removeAllListeners(ch)
      socket.on(ch, async (params: any, cb = (..._callback: any) => { /** Empty */ }) => {

        try {
          if (!socket) throw "socket missing??!!";
          const id_address = (socket as any)?.conn?.remoteAddress;
          const user_agent = socket.handshake?.headers?.["user-agent"];
          const res = await func(params, this.dbo as any, this.db, { user_agent, id_address });
          if (name === "login" && res && res.sid) {
            /* TODO: Re-send schema to client */
          }

          cb(null, true);

        } catch (err) {
          console.error(name + " err", err);
          cb(err)
        }
      });
    });

    return { auth, userData };
  }
}

export const getSafeReturnURL = (returnURL: string, returnUrlParamName: string, quiet = false) => {
  /** Dissalow redirect to other domains */
  if(returnURL) {
    const allowedOrigin = "https://localhost";
    const { origin, pathname, search, searchParams } = new URL(returnURL, allowedOrigin);
    if(
      origin !== allowedOrigin ||
      returnURL !== `${pathname}${search}` ||
      searchParams.get(returnUrlParamName)
    ){
      if(!quiet){
        console.error(`Unsafe returnUrl: ${returnURL}. Redirecting to /`);
      }
      return "/";
    }

    return returnURL;
  }
}

const issue = ([
  ["https://localhost", "/"],
  ["//localhost.bad.com", "/"],
  ["//localhost.com", "/"],
  ["/localhost/com", "/localhost/com"],
  ["/localhost/com?here=there", "/localhost/com?here=there"],
  ["/localhost/com?returnUrl=there", "/"],
  ["//http://localhost.com", "/"],
  ["//abc.com", "/"],
  ["///abc.com", "/"],
] as const).find(([returnURL, expected]) => getSafeReturnURL(returnURL, "returnUrl", true) !== expected);

if(issue){
  throw new Error(`getSafeReturnURL failed for ${issue[0]}. Expected: ${issue[1]}`);
}