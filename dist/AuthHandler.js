"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_types_1 = require("prostgles-types");
class AuthHandler {
    constructor(prostgles) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.validateSid = (sid) => {
            if (!sid)
                return undefined;
            if (typeof sid !== "string")
                throw "sid missing or not a string";
            return sid;
        };
        this.matchesRoute = (route, clientFullRoute) => {
            return route && clientFullRoute && (route === clientFullRoute ||
                clientFullRoute.startsWith(route) && ["/", "?", "#"].includes(clientFullRoute.slice(-1)));
        };
        this.isUserRoute = (pathname) => {
            var _a, _b;
            const pubRoutes = [
                ...((_b = (_a = this.opts) === null || _a === void 0 ? void 0 : _a.expressConfig) === null || _b === void 0 ? void 0 : _b.publicRoutes) || [],
            ];
            if (this.loginRoute)
                pubRoutes.push(this.loginRoute);
            if (this.logoutGetPath)
                pubRoutes.push(this.logoutGetPath);
            return Boolean(!pubRoutes.find(publicRoute => {
                return this.matchesRoute(publicRoute, pathname); // publicRoute === pathname || pathname.startsWith(publicRoute) && ["/", "?", "#"].includes(pathname.slice(-1));
            }));
        };
        this.setCookieAndGoToReturnURLIFSet = (cookie, r) => {
            var _a, _b;
            const { sid, expires } = cookie;
            const { res, req } = r;
            if (sid) {
                let options = {
                    maxAge: expires || 1000 * 60 * 60 * 24,
                    httpOnly: true,
                };
                const cookieOpts = Object.assign(Object.assign(Object.assign({}, options), { secure: true, sameSite: "strict" }), (((_b = (_a = this.opts) === null || _a === void 0 ? void 0 : _a.expressConfig) === null || _b === void 0 ? void 0 : _b.cookieOptions) || {}));
                const cookieData = sid;
                res.cookie(this.sidKeyName, cookieData, cookieOpts);
                const successURL = getReturnUrl(req, this.returnURL) || "/";
                res.redirect(successURL);
            }
            else {
                throw ("no user or session");
            }
        };
        this.getUser = async (clientReq) => {
            var _a, _b;
            const sid = "httpReq" in clientReq ? (_b = (_a = clientReq.httpReq) === null || _a === void 0 ? void 0 : _a.cookies) === null || _b === void 0 ? void 0 : _b[this.sidKeyName] : clientReq.socket;
            if (!sid)
                return undefined;
            try {
                return this.throttledFunc(() => {
                    return this.opts.getUser(this.validateSid(sid), this.dbo, this.db, clientReq);
                }, 50);
            }
            catch (err) {
                console.error(err);
            }
            return undefined;
        };
        this.throttledFunc = (func, throttle = 500) => {
            return new Promise(async (resolve, reject) => {
                let interval, result, error, finished = false;
                /**
                 * Throttle response times to prevent timing attacks
                 */
                interval = setInterval(() => {
                    clearInterval(interval);
                    if (finished) {
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
        this.loginThrottled = async (params) => {
            if (!this.opts.login)
                throw "Auth login config missing";
            const { responseThrottle = 500 } = this.opts;
            return this.throttledFunc(async () => {
                let result = await this.opts.login(params, this.dbo, this.db);
                if (!result.sid) {
                    throw { msg: "Something went wrong making a session" };
                }
                return result;
            }, responseThrottle);
        };
        this.isValidSocketSession = (socket, session) => {
            var _a, _b;
            const hasExpired = Boolean(session && session.expires <= Date.now());
            if (((_a = this.opts.expressConfig) === null || _a === void 0 ? void 0 : _a.publicRoutes) && !((_b = this.opts.expressConfig) === null || _b === void 0 ? void 0 : _b.disableSocketAuthGuard)) {
                if (hasExpired) {
                    socket.emit(prostgles_types_1.CHANNELS.AUTHGUARD, { shouldReload: true });
                    throw "";
                }
            }
            return Boolean(session && !hasExpired);
        };
        this.makeSocketAuth = async (socket) => {
            var _a, _b;
            if (!this.opts)
                return {};
            let auth = {};
            if (((_a = this.opts.expressConfig) === null || _a === void 0 ? void 0 : _a.publicRoutes) && !((_b = this.opts.expressConfig) === null || _b === void 0 ? void 0 : _b.disableSocketAuthGuard)) {
                auth.pathGuard = true;
                socket.removeAllListeners(prostgles_types_1.CHANNELS.AUTHGUARD);
                socket.on(prostgles_types_1.CHANNELS.AUTHGUARD, async (params, cb = (err, res) => { }) => {
                    var _a;
                    try {
                        const { pathname } = typeof params === "string" ? JSON.parse(params) : (params || {});
                        if (pathname && typeof pathname !== "string")
                            console.warn("Invalid pathname provided for AuthGuardLocation: ", pathname);
                        if (pathname && typeof pathname === "string" && this.isUserRoute(pathname) && !((_a = (await this.getClientInfo({ socket }))) === null || _a === void 0 ? void 0 : _a.user)) {
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
                { func: (params, dbo, db) => register(params, dbo, db), ch: prostgles_types_1.CHANNELS.REGISTER, name: "register" },
                { func: (params, dbo, db) => login(params), ch: prostgles_types_1.CHANNELS.LOGIN, name: "login" },
                { func: (params, dbo, db) => logout(this.getSID({ socket }), dbo, db), ch: prostgles_types_1.CHANNELS.LOGOUT, name: "logout" }
            ].filter(h => h.func);
            const usrData = await this.getClientInfo({ socket });
            if (usrData) {
                auth.user = usrData.clientUser;
                handlers = handlers.filter(h => h.name === "logout");
            }
            handlers.map(({ func, ch, name }) => {
                auth[name] = true;
                socket.removeAllListeners(ch);
                socket.on(ch, async (params, cb = (...callback) => { }) => {
                    try {
                        if (!socket)
                            throw "socket missing??!!";
                        const res = await func(params, this.dbo, this.db);
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
            return auth;
        };
        this.opts = prostgles.opts.auth;
        if ((_a = prostgles.opts.auth) === null || _a === void 0 ? void 0 : _a.expressConfig) {
            this.returnURL = ((_c = (_b = prostgles.opts.auth) === null || _b === void 0 ? void 0 : _b.expressConfig) === null || _c === void 0 ? void 0 : _c.returnURL) || "returnURL";
            this.loginRoute = ((_e = (_d = prostgles.opts.auth) === null || _d === void 0 ? void 0 : _d.expressConfig) === null || _e === void 0 ? void 0 : _e.loginRoute) || "/login";
            this.logoutGetPath = ((_g = (_f = prostgles.opts.auth) === null || _f === void 0 ? void 0 : _f.expressConfig) === null || _g === void 0 ? void 0 : _g.logoutGetPath) || "/logout";
        }
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
    }
    async init() {
        if (!this.opts)
            return;
        this.opts.sidKeyName = this.opts.sidKeyName || "session_id";
        const { sidKeyName, login, getUser, getClientUser, expressConfig } = this.opts;
        this.sidKeyName = this.opts.sidKeyName;
        if (typeof sidKeyName !== "string" && !login) {
            throw "Invalid auth: Provide { sidKeyName: string } ";
        }
        /**
         * Why ??? Collision with socket.io ???
         */
        if (this.sidKeyName === "sid")
            throw "sidKeyName cannot be 'sid' please provide another name.";
        if (!getUser || !getClientUser)
            throw "getUser OR getClientUser missing from auth config";
        if (expressConfig) {
            const { app, publicRoutes = [], onGetRequestOK, magicLinks } = expressConfig;
            if (publicRoutes.find(r => typeof r !== "string" || !r)) {
                throw "Invalid or empty string provided within publicRoutes ";
            }
            if (app && magicLinks) {
                const { route = "/magic-link", check } = magicLinks;
                if (!check)
                    throw "Check must be defined for magicLinks";
                app.get(`${route}/:id`, async (req, res) => {
                    const { id } = req.params;
                    if (typeof id !== "string" || !id) {
                        res.status(404).json({ msg: "Invalid magic-link id. Expecting a string" });
                    }
                    else {
                        try {
                            const session = await this.throttledFunc(async () => {
                                return check(id, this.dbo, this.db);
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
            if (app && this.loginRoute) {
                app.post(this.loginRoute, async (req, res) => {
                    try {
                        const { sid, expires } = await this.loginThrottled(req.body || {}) || {};
                        if (sid) {
                            this.setCookieAndGoToReturnURLIFSet({ sid, expires }, { req, res });
                        }
                        else {
                            throw ("no user or session");
                        }
                    }
                    catch (err) {
                        console.log(err);
                        res.status(404).json({ err: "Invalid username or password" });
                    }
                });
                if (app && this.logoutGetPath) {
                    app.get(this.logoutGetPath, async (req, res) => {
                        var _a;
                        const sid = this.validateSid((_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName]);
                        if (sid) {
                            try {
                                await this.throttledFunc(() => {
                                    var _a;
                                    return this.opts.logout((_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName], this.dbo, this.db);
                                });
                            }
                            catch (err) {
                                console.error(err);
                            }
                        }
                        res.redirect("/");
                    });
                }
                if (app && Array.isArray(publicRoutes)) {
                    /* Redirect if not logged in and requesting non public content */
                    app.get('*', async (req, res) => {
                        const clientReq = { httpReq: req };
                        const getUser = this.getUser;
                        try {
                            const returnURL = getReturnUrl(req, this.returnURL);
                            /**
                             * Requesting a User route
                             */
                            if (this.isUserRoute(req.path)) {
                                /* Check auth. Redirect if unauthorized */
                                const u = await getUser(clientReq);
                                if (!u) {
                                    res.redirect(`${this.loginRoute}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                                    return;
                                }
                                /* If authorized and going to returnUrl then redirect. Otherwise serve file */
                            }
                            else if (returnURL && (await getUser(clientReq))) {
                                res.redirect(returnURL);
                                return;
                                /** If Logged in and requesting login then redirect */
                            }
                            else if (this.matchesRoute(this.loginRoute, req.path) && (await getUser(clientReq))) {
                                res.redirect("/");
                                return;
                            }
                            if (onGetRequestOK) {
                                onGetRequestOK(req, res);
                            }
                        }
                        catch (error) {
                            console.error(error);
                            res.status(404).json({ msg: "Something went wrong", error });
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
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (!this.opts)
            return null;
        const { sidKeyName } = this.opts;
        if (!sidKeyName || !localParams)
            return null;
        if (localParams.socket) {
            const querySid = (_c = (_b = (_a = localParams.socket) === null || _a === void 0 ? void 0 : _a.handshake) === null || _b === void 0 ? void 0 : _b.query) === null || _c === void 0 ? void 0 : _c[sidKeyName];
            let rawSid = querySid;
            if (!rawSid) {
                const cookie_str = (_f = (_e = (_d = localParams.socket) === null || _d === void 0 ? void 0 : _d.handshake) === null || _e === void 0 ? void 0 : _e.headers) === null || _f === void 0 ? void 0 : _f.cookie;
                const cookie = parseCookieStr(cookie_str);
                rawSid = cookie[sidKeyName];
            }
            return this.validateSid(rawSid);
        }
        else if (localParams.httpReq) {
            return this.validateSid((_h = (_g = localParams.httpReq) === null || _g === void 0 ? void 0 : _g.cookies) === null || _h === void 0 ? void 0 : _h[sidKeyName]);
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
        var _a;
        if (!this.opts)
            return {};
        const getSession = (_a = this.opts.cacheSession) === null || _a === void 0 ? void 0 : _a.getSession;
        const isSocket = "socket" in localParams;
        if (getSession && isSocket && localParams.socket.__prglCache) {
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
                return {};
        }
        return this.throttledFunc(async () => {
            const { getUser, getClientUser } = this.opts;
            if (getUser && localParams && (localParams.httpReq || localParams.socket)) {
                const sid = this.getSID(localParams);
                const clientReq = localParams.httpReq ? { httpReq: localParams.httpReq } : { socket: localParams.socket };
                let user, clientUser;
                if (sid) {
                    user = await getUser(sid, this.dbo, this.db, clientReq),
                        clientUser = await getClientUser(sid, this.dbo, this.db);
                }
                if (getSession && isSocket) {
                    const session = await getSession(sid);
                    if ((session === null || session === void 0 ? void 0 : session.expires) && user && clientUser) {
                        localParams.socket.__prglCache = {
                            session,
                            user,
                            clientUser,
                        };
                    }
                }
                return { sid, user, clientUser };
            }
            return {};
        }, 5);
    }
}
exports.default = AuthHandler;
/**
 * AUTH
 */
function getReturnUrl(req, name) {
    var _a, _b;
    if ((_a = req === null || req === void 0 ? void 0 : req.query) === null || _a === void 0 ? void 0 : _a.returnURL) {
        return decodeURIComponent((_b = req === null || req === void 0 ? void 0 : req.query) === null || _b === void 0 ? void 0 : _b[name]);
    }
    return null;
}
//# sourceMappingURL=AuthHandler.js.map