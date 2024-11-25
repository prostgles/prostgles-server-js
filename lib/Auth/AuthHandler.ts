import { AnyObject, AuthGuardLocation, AuthGuardLocationResponse, CHANNELS, AuthSocketSchema } from "prostgles-types";
import { LocalParams, PRGLIOSocket } from "../DboBuilder/DboBuilder";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { removeExpressRoute } from "../FileManager/FileManager";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import { Auth, AuthClientRequest, AuthResult, BasicSession, ExpressReq, ExpressRes, LoginClientInfo } from "./AuthTypes"
import { getSafeReturnURL } from "./getSafeReturnURL";
import { setupAuthRoutes } from "./setupAuthRoutes";
import { getProviders } from "./setAuthProviders";

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

export const AUTH_ROUTES_AND_PARAMS = {
  login: "/login",
  loginWithProvider: "/auth",
  emailSignup: "/register",
  returnUrlParamName: "returnURL",
  sidKeyName: "session_id",
  logoutGetPath: "/logout",
  magicLinksRoute: "/magic-link",
  magicLinksExpressRoute: "/magic-link/:id",
  catchAll: "*",
} as const;

export class AuthHandler {
  protected prostgles: Prostgles;
  protected opts?: Auth;
  dbo: DBHandlerServer;
  db: DB;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.opts = prostgles.opts.auth as any;
    if(!prostgles.dbo || !prostgles.db) throw "dbo or db missing";
    this.dbo = prostgles.dbo;
    this.db = prostgles.db;
  }

  get sidKeyName() {
    return this.opts?.sidKeyName ?? AUTH_ROUTES_AND_PARAMS.sidKeyName;
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
    const { login, logoutGetPath, magicLinksRoute, loginWithProvider } = AUTH_ROUTES_AND_PARAMS;
    const pubRoutes = [
      ...this.opts?.expressConfig?.publicRoutes || [],
      login, logoutGetPath, magicLinksRoute, loginWithProvider,
    ].filter(publicRoute => publicRoute);

    return !pubRoutes.some(publicRoute => {
      return this.matchesRoute(publicRoute, pathname);
    });
  }

  setCookieAndGoToReturnURLIFSet = (cookie: { sid: string; expires: number; }, r: { req: ExpressReq; res: ExpressRes }) => {
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
      res.cookie(this.sidKeyName, cookieData, cookieOpts);
      const successURL = this.getReturnUrl(req) || "/";
      res.redirect(successURL);

    } else {
      throw ("no user or session")
    }
  }

  getUser = async (clientReq: { httpReq: ExpressReq; }): Promise<AuthResult> => {
    if(!this.opts?.getUser) {
      throw "this.opts.getUser missing";
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

  init = setupAuthRoutes.bind(this);

  getReturnUrl = (req: ExpressReq) => {
    const { returnUrlParamName } = AUTH_ROUTES_AND_PARAMS;
    if (returnUrlParamName && req?.query?.[returnUrlParamName]) {
      const returnURL = decodeURIComponent(req?.query?.[returnUrlParamName] as string);
      
      return getSafeReturnURL(returnURL, returnUrlParamName);
    }
    return null;
  }

  destroy = () => {
    const app = this.opts?.expressConfig?.app;
    const { login, logoutGetPath, magicLinksExpressRoute, catchAll, loginWithProvider } = AUTH_ROUTES_AND_PARAMS;
    removeExpressRoute(app, [login, logoutGetPath, magicLinksExpressRoute, catchAll, loginWithProvider]);
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

    if (!localParams) return undefined;
    const { sidKeyName } = this;
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
    } catch {
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

  getClientAuth = async (clientReq: Pick<LocalParams, "socket" | "httpReq">): Promise<{ auth: AuthSocketSchema; userData: AuthResult; }> => {

    let pathGuard = false;
    if (this.opts?.expressConfig?.publicRoutes && !this.opts.expressConfig?.disableSocketAuthGuard) {

      pathGuard = true;

      if("socket" in clientReq && clientReq.socket){
        const { socket } = clientReq;
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
    }

    
    /**
     * ARE THESE NEEDED?!
    */
    // const {
    //   register,
    //   logout
    // } = this.opts;
    // const login = this.loginThrottled
    // let handlers: {
    //   name: keyof Omit<AuthSocketSchema, "user">;
    //   ch: string;
    //   func: (...args: any) => any;
    // }[] = [
    //   { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => register?.(params, dbo, db), ch: CHANNELS.REGISTER, name: "register" as keyof Omit<AuthSocketSchema, "user"> },
    //   { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => login(params, client), ch: CHANNELS.LOGIN, name: "login" as keyof Omit<AuthSocketSchema, "user"> },
    //   { func: (params: any, dbo: any, db: DB, client: LoginClientInfo) => logout?.(this.getSID({ socket }), dbo, db), ch: CHANNELS.LOGOUT, name: "logout"  as keyof Omit<AuthSocketSchema, "user">}
    // ].filter(h => h.func);


    // handlers.map(({ func, ch, name }) => {
    //   auth[name] = true;

    //   socket.removeAllListeners(ch)
    //   socket.on(ch, async (params: any, cb = (..._callback: any) => { /** Empty */ }) => {

    //     try {
    //       if (!socket) throw "socket missing??!!";
    //       const id_address = (socket as any)?.conn?.remoteAddress;
    //       const user_agent = socket.handshake?.headers?.["user-agent"];
    //       const res = await func(params, this.dbo as any, this.db, { user_agent, id_address });
    //       if (name === "login" && res && res.sid) {
    //         /* TODO: Re-send schema to client */
    //       }

    //       cb(null, true);

    //     } catch (err) {
    //       console.error(name + " err", err);
    //       cb(err)
    //     }
    //   });
    // });

    const userData = await this.getClientInfo(clientReq);
    const auth: AuthSocketSchema = {
      providers: getProviders.bind(this)(),
      register: this.opts?.expressConfig?.registrations?.email && { type: this.opts?.expressConfig?.registrations?.email.signupType, url: AUTH_ROUTES_AND_PARAMS.emailSignup },
      user: userData?.clientUser,
      loginType: this.opts?.expressConfig?.registrations?.email?.signupType,
      pathGuard,
    };
    return { auth, userData };
  }
}