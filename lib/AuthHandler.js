"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_types_1 = require("prostgles-types");
const FileManager_1 = require("./FileManager");
class AuthHandler {
    constructor(prostgles) {
        this.routes = {
            catchAll: "*"
        };
        this.validateSid = (sid) => {
            if (!sid)
                return undefined;
            if (typeof sid !== "string")
                throw "sid missing or not a string";
            return sid;
        };
        this.matchesRoute = (route, clientFullRoute) => {
            return route && clientFullRoute && (route === clientFullRoute ||
                clientFullRoute.startsWith(route) && ["/", "?", "#"].includes(clientFullRoute[route.length]));
        };
        this.isUserRoute = (pathname) => {
            const pubRoutes = [
                ...this.opts?.expressConfig?.publicRoutes || [],
            ];
            if (this.routes?.login)
                pubRoutes.push(this.routes.login);
            if (this.routes?.logoutGetPath)
                pubRoutes.push(this.routes.logoutGetPath);
            if (this.routes?.magicLinks?.route)
                pubRoutes.push(this.routes.magicLinks.route);
            return !pubRoutes.some(publicRoute => {
                return this.matchesRoute(publicRoute, pathname); // publicRoute === pathname || pathname.startsWith(publicRoute) && ["/", "?", "#"].includes(pathname.slice(-1));
            });
        };
        this.setCookieAndGoToReturnURLIFSet = (cookie, r) => {
            const { sid, expires } = cookie;
            const { res, req } = r;
            if (sid) {
                let maxAge = 1000 * 60 * 60 * 24; // 24 hours
                if (expires && Number.isFinite(expires) && !isNaN(+new Date(expires))) {
                    maxAge = (+new Date(expires) - Date.now());
                }
                let options = {
                    maxAge,
                    httpOnly: true, // The cookie only accessible by the web server
                    //signed: true // Indicates if the cookie should be signed
                };
                const cookieOpts = { ...options, secure: true, sameSite: "strict", ...(this.opts?.expressConfig?.cookieOptions || {}) };
                const cookieData = sid;
                if (!this.sidKeyName || !this.routes?.returnURL)
                    throw "sidKeyName or returnURL missing";
                res.cookie(this.sidKeyName, cookieData, cookieOpts);
                const successURL = getReturnUrl(req, this.routes.returnURL) || "/";
                res.redirect(successURL);
            }
            else {
                throw ("no user or session");
            }
        };
        this.getUser = async (clientReq) => {
            if (!this.sidKeyName || !this.opts?.getUser)
                throw "sidKeyName or this.opts.getUser missing";
            const sid = clientReq.httpReq?.cookies?.[this.sidKeyName];
            if (!sid)
                return undefined;
            try {
                return this.throttledFunc(async () => {
                    return this.opts.getUser(this.validateSid(sid), this.dbo, this.db, clientReq);
                }, 50);
            }
            catch (err) {
                console.error(err);
            }
            return undefined;
        };
        this.destroy = () => {
            const app = this.opts?.expressConfig?.app;
            const { login, logoutGetPath, magicLinks } = this.routes;
            (0, FileManager_1.removeExpressRoute)(app, [login, logoutGetPath, magicLinks?.expressRoute]);
        };
        this.throttledFunc = (func, throttle = 500) => {
            return new Promise(async (resolve, reject) => {
                let interval, result, error, finished = false;
                /**
                 * Throttle response times to prevent timing attacks
                 */
                interval = setInterval(() => {
                    if (finished) {
                        clearInterval(interval);
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve(result);
                        }
                    }
                }, throttle);
                try {
                    result = await func();
                }
                catch (err) {
                    console.log(err);
                    error = err;
                }
                finished = true;
            });
        };
        this.loginThrottled = async (params, ip_address) => {
            if (!this.opts?.login)
                throw "Auth login config missing";
            const { responseThrottle = 500 } = this.opts;
            return this.throttledFunc(async () => {
                let result = await this.opts?.login?.(params, this.dbo, this.db, ip_address);
                const err = {
                    msg: "Bad login result type. \nExpecting: undefined | null | { sid: string; expires: number } but got: " + JSON.stringify(result)
                };
                if (!result)
                    throw err;
                if (result && (typeof result.sid !== "string" || typeof result.expires !== "number") || !result && ![undefined, null].includes(result)) {
                    throw err;
                }
                if (result && result.expires < Date.now()) {
                    throw { msg: "auth.login() is returning an expired session. Can only login with a session.expires greater than Date.now()" };
                }
                return result;
            }, responseThrottle);
        };
        this.isValidSocketSession = (socket, session) => {
            const hasExpired = Boolean(session && session.expires <= Date.now());
            if (this.opts?.expressConfig?.publicRoutes && !this.opts.expressConfig?.disableSocketAuthGuard) {
                const error = "Session has expired";
                if (hasExpired) {
                    if (session.onExpiration === "redirect")
                        socket.emit(prostgles_types_1.CHANNELS.AUTHGUARD, {
                            shouldReload: session.onExpiration === "redirect",
                            error
                        });
                    throw error;
                }
            }
            return Boolean(session && !hasExpired);
        };
        this.makeSocketAuth = async (socket) => {
            if (!this.opts)
                return {};
            let auth = {};
            if (this.opts.expressConfig?.publicRoutes && !this.opts.expressConfig?.disableSocketAuthGuard) {
                auth.pathGuard = true;
                socket.removeAllListeners(prostgles_types_1.CHANNELS.AUTHGUARD);
                socket.on(prostgles_types_1.CHANNELS.AUTHGUARD, async (params, cb = (err, res) => { }) => {
                    try {
                        const { pathname } = typeof params === "string" ? JSON.parse(params) : (params || {});
                        if (pathname && typeof pathname !== "string")
                            console.warn("Invalid pathname provided for AuthGuardLocation: ", pathname);
                        if (pathname && typeof pathname === "string" && this.isUserRoute(pathname) && !(await this.getClientInfo({ socket }))?.user) {
                            cb(null, { shouldReload: true });
                        }
                        else {
                            cb(null, { shouldReload: false });
                        }
                    }
                    catch (err) {
                        console.error("AUTHGUARD err: ", err);
                        cb(err);
                    }
                });
            }
            const { register, logout } = this.opts;
            const login = this.loginThrottled;
            let handlers = [
                { func: (params, dbo, db, ip_address) => register?.(params, dbo, db), ch: prostgles_types_1.CHANNELS.REGISTER, name: "register" },
                { func: (params, dbo, db, ip_address) => login(params, ip_address), ch: prostgles_types_1.CHANNELS.LOGIN, name: "login" },
                { func: (params, dbo, db, ip_address) => logout?.(this.getSID({ socket }), dbo, db), ch: prostgles_types_1.CHANNELS.LOGOUT, name: "logout" }
            ].filter(h => h.func);
            const userData = await this.getClientInfo({ socket });
            if (userData) {
                auth.user = userData.clientUser;
                handlers = handlers.filter(h => h.name === "logout");
            }
            handlers.map(({ func, ch, name }) => {
                auth[name] = true;
                socket.removeAllListeners(ch);
                socket.on(ch, async (params, cb = (...callback) => { }) => {
                    try {
                        if (!socket)
                            throw "socket missing??!!";
                        const remoteAddress = socket?.conn?.remoteAddress;
                        const res = await func(params, this.dbo, this.db, remoteAddress);
                        if (name === "login" && res && res.sid) {
                            /* TODO: Re-send schema to client */
                        }
                        cb(null, true);
                    }
                    catch (err) {
                        console.error(name + " err", err);
                        cb(err);
                    }
                });
            });
            return { auth, userData };
        };
        this.opts = prostgles.opts.auth;
        if (prostgles.opts.auth?.expressConfig) {
            const { magicLinks, returnURL, loginRoute, logoutGetPath } = prostgles.opts.auth.expressConfig;
            const magicLinksRoute = magicLinks?.route || "/magic-link";
            this.routes = {
                magicLinks: magicLinks ? {
                    expressRoute: `${magicLinksRoute}/:id`,
                    route: magicLinksRoute
                } : undefined,
                returnURL: returnURL || "returnURL",
                login: loginRoute || "/login",
                logoutGetPath: logoutGetPath || "/logout",
                catchAll: "*"
            };
        }
        if (!prostgles.dbo || !prostgles.db)
            throw "dbo or db missing";
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
    }
    async init() {
        if (!this.opts)
            return;
        this.opts.sidKeyName = this.opts.sidKeyName || "session_id";
        const { sidKeyName, login, getUser, expressConfig } = this.opts;
        this.sidKeyName = this.opts.sidKeyName;
        if (typeof sidKeyName !== "string" && !login) {
            throw "Invalid auth: Provide { sidKeyName: string } ";
        }
        /**
         * Why ??? Collision with socket.io ???
         */
        if (this.sidKeyName === "sid")
            throw "sidKeyName cannot be 'sid' please provide another name.";
        if (!getUser)
            throw "getUser missing from auth config";
        if (expressConfig) {
            const { app, publicRoutes = [], onGetRequestOK, magicLinks, use } = expressConfig;
            if (publicRoutes.find(r => typeof r !== "string" || !r)) {
                throw "Invalid or empty string provided within publicRoutes ";
            }
            if (use) {
                app.use((req, res, next) => {
                    use({
                        req,
                        res,
                        next,
                        getUser: () => this.getUser({ httpReq: req }),
                        dbo: this.dbo,
                        db: this.db,
                    });
                });
            }
            if (magicLinks && this.routes.magicLinks) {
                const { check } = magicLinks;
                if (!check)
                    throw "Check must be defined for magicLinks";
                app.get(this.routes.magicLinks?.expressRoute, async (req, res) => {
                    const { id } = req.params ?? {};
                    if (typeof id !== "string" || !id) {
                        res.status(404).json({ msg: "Invalid magic-link id. Expecting a string" });
                    }
                    else {
                        try {
                            const session = await this.throttledFunc(async () => {
                                const ip_address = req.ip;
                                return check(id, this.dbo, this.db, ip_address);
                            });
                            if (!session) {
                                res.status(404).json({ msg: "Invalid magic-link" });
                            }
                            else {
                                this.setCookieAndGoToReturnURLIFSet(session, { req, res });
                            }
                        }
                        catch (e) {
                            res.status(404).json({ msg: e });
                        }
                    }
                });
            }
            const loginRoute = this.routes?.login;
            if (loginRoute) {
                app.post(loginRoute, async (req, res) => {
                    try {
                        const ip_address = req.ip;
                        const { sid, expires } = await this.loginThrottled(req.body || {}, ip_address) || {};
                        if (sid) {
                            this.setCookieAndGoToReturnURLIFSet({ sid, expires }, { req, res });
                        }
                        else {
                            throw ("Internal error: no user or session");
                        }
                    }
                    catch (err) {
                        console.log(err);
                        res.status(404).json({ err });
                    }
                });
                if (this.routes.logoutGetPath && this.opts.logout) {
                    app.get(this.routes.logoutGetPath, async (req, res) => {
                        const sid = this.validateSid(req?.cookies?.[sidKeyName]);
                        if (sid) {
                            try {
                                await this.throttledFunc(() => {
                                    return this.opts.logout(req?.cookies?.[sidKeyName], this.dbo, this.db);
                                });
                            }
                            catch (err) {
                                console.error(err);
                            }
                        }
                        res.redirect("/");
                    });
                }
                if (Array.isArray(publicRoutes)) {
                    /* Redirect if not logged in and requesting non public content */
                    app.get(this.routes.catchAll, async (req, res) => {
                        const clientReq = { httpReq: req };
                        const getUser = this.getUser;
                        try {
                            const returnURL = getReturnUrl(req, this.routes.returnURL);
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
                            }
                            else if (returnURL && (await getUser(clientReq))) {
                                res.redirect(returnURL);
                                return;
                                /** If Logged in and requesting login then redirect to main page */
                            }
                            else if (this.matchesRoute(loginRoute, req.path) && (await getUser(clientReq))) {
                                res.redirect("/");
                                return;
                            }
                            onGetRequestOK?.(req, res, { getUser: () => getUser(clientReq), dbo: this.dbo, db: this.db });
                        }
                        catch (error) {
                            console.error(error);
                            res.status(404).json({ msg: "Something went wrong when processing your request" });
                        }
                    });
                }
            }
        }
    }
    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams
     * @returns string
     */
    getSID(localParams) {
        if (!this.opts)
            return undefined;
        const { sidKeyName } = this.opts;
        if (!sidKeyName || !localParams)
            return undefined;
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
        }
        else if (localParams.httpReq) {
            return this.validateSid(localParams.httpReq?.cookies?.[sidKeyName]);
        }
        else
            throw "socket OR httpReq missing from localParams";
        function parseCookieStr(cookie_str) {
            if (!cookie_str || typeof cookie_str !== "string")
                return {};
            return cookie_str.replace(/\s/g, '').split(";").reduce((prev, current) => {
                const [name, value] = current.split('=');
                prev[name] = value;
                return prev;
            }, {});
        }
    }
    async getClientInfo(localParams) {
        if (!this.opts)
            return {};
        const getSession = this.opts.cacheSession?.getSession;
        const isSocket = "socket" in localParams;
        if (isSocket) {
            if (getSession && localParams.socket?.__prglCache) {
                const { session, user, clientUser } = localParams.socket.__prglCache;
                const isValid = this.isValidSocketSession(localParams.socket, session);
                if (isValid) {
                    return {
                        sid: session.sid,
                        user,
                        clientUser,
                    };
                }
                else
                    return {
                        sid: session.sid
                    };
            }
        }
        const res = await this.throttledFunc(async () => {
            const { getUser } = this.opts ?? {};
            if (getUser && localParams && (localParams.httpReq || localParams.socket)) {
                const sid = this.getSID(localParams);
                const clientReq = localParams.httpReq ? { httpReq: localParams.httpReq } : { socket: localParams.socket };
                let user, clientUser;
                if (sid) {
                    const res = await getUser(sid, this.dbo, this.db, clientReq);
                    user = res?.user;
                    clientUser = res?.clientUser;
                }
                if (getSession && isSocket) {
                    const session = await getSession(sid, this.dbo, this.db);
                    if (session?.expires && user && clientUser && localParams.socket) {
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
        return res;
    }
}
exports.default = AuthHandler;
/**
 * AUTH
 */
function getReturnUrl(req, name) {
    if (req?.query?.returnURL && name) {
        return decodeURIComponent(req?.query?.[name]);
    }
    return null;
}
