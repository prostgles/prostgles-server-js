"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_types_1 = require("prostgles-types");
class AuthHandler {
    constructor(prostgles) {
        this.validateSid = (sid) => {
            if (!sid)
                return undefined;
            if (typeof sid !== "string")
                throw "sid missing or not a string";
            return sid;
        };
        this.isUserRoute = (pathname) => {
            var _a, _b, _c;
            return Boolean((_c = (_b = (_a = this.opts) === null || _a === void 0 ? void 0 : _a.expressConfig) === null || _b === void 0 ? void 0 : _b.userRoutes) === null || _c === void 0 ? void 0 : _c.find(userRoute => {
                return userRoute === pathname || pathname.startsWith(userRoute) && ["/", "?", "#"].includes(pathname.slice(-1));
            }));
        };
        this.throttledFunc = (func, throttle = 500) => {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let result, error;
                /**
                 * Throttle response times to prevent timing attacks
                 */
                let interval = setInterval(() => {
                    if (error || result) {
                        if (error) {
                            reject(error);
                        }
                        else if (result) {
                            resolve(result);
                        }
                        clearInterval(interval);
                    }
                }, throttle);
                try {
                    result = yield func();
                }
                catch (err) {
                    console.log(err);
                    error = err;
                }
            }));
        };
        this.loginThrottled = (params) => __awaiter(this, void 0, void 0, function* () {
            if (!this.opts.login)
                throw "Auth login config missing";
            const { responseThrottle = 500 } = this.opts;
            return this.throttledFunc(() => __awaiter(this, void 0, void 0, function* () {
                let result = yield this.opts.login(params, this.dbo, this.db);
                if (!result.sid) {
                    throw { msg: "Something went wrong making a session" };
                }
                return result;
            }), responseThrottle);
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                let result, error;
                /**
                 * Throttle response times to prevent timing attacks
                 */
                let interval = setInterval(() => {
                    if (error || result) {
                        if (error) {
                            reject(error);
                        }
                        else if (result) {
                            resolve(result);
                        }
                        clearInterval(interval);
                    }
                }, responseThrottle);
                try {
                    result = yield this.opts.login(params, this.dbo, this.db);
                    if (!result.sid) {
                        error = { msg: "Something went wrong making a session" };
                    }
                }
                catch (err) {
                    console.log(err);
                    error = err;
                }
            }));
        });
        this.makeSocketAuth = (socket) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (!this.opts)
                return {};
            let auth = {};
            if (((_b = (_a = this.opts.expressConfig) === null || _a === void 0 ? void 0 : _a.userRoutes) === null || _b === void 0 ? void 0 : _b.length) && !((_c = this.opts.expressConfig) === null || _c === void 0 ? void 0 : _c.disableSocketAuthGuard)) {
                auth.pathGuard = true;
                socket.removeAllListeners(prostgles_types_1.CHANNELS.AUTHGUARD);
                socket.on(prostgles_types_1.CHANNELS.AUTHGUARD, (params, cb = (err, res) => { }) => __awaiter(this, void 0, void 0, function* () {
                    var _d;
                    try {
                        const { pathname } = params || {};
                        if (pathname && typeof pathname === "string" && this.isUserRoute(pathname) && !((_d = (yield this.getClientInfo({ socket }))) === null || _d === void 0 ? void 0 : _d.user)) {
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
                }));
            }
            const { register, logout } = this.opts;
            const login = this.loginThrottled;
            let handlers = [
                { func: (params, dbo, db) => register(params, dbo, db), ch: prostgles_types_1.CHANNELS.REGISTER, name: "register" },
                { func: (params, dbo, db) => login(params), ch: prostgles_types_1.CHANNELS.LOGIN, name: "login" },
                { func: (params, dbo, db) => logout(this.getSID({ socket }), dbo, db), ch: prostgles_types_1.CHANNELS.LOGOUT, name: "logout" }
            ].filter(h => h.func);
            const usrData = yield this.getClientInfo({ socket });
            if (usrData) {
                auth.user = usrData.clientUser;
                handlers = handlers.filter(h => h.name === "logout");
            }
            handlers.map(({ func, ch, name }) => {
                auth[name] = true;
                socket.removeAllListeners(ch);
                socket.on(ch, (params, cb = (...callback) => { }) => __awaiter(this, void 0, void 0, function* () {
                    try {
                        if (!socket)
                            throw "socket missing??!!";
                        const res = yield func(params, this.dbo, this.db);
                        if (name === "login" && res && res.sid) {
                            /* TODO: Re-send schema to client */
                        }
                        cb(null, true);
                    }
                    catch (err) {
                        console.error(name + " err", err);
                        cb(err);
                    }
                }));
            });
            return auth;
        });
        this.opts = prostgles.opts.auth;
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
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
                const { app, logoutGetPath = "/logout", loginRoute = "/login", cookieOptions = {}, userRoutes = [], onGetRequestOK } = expressConfig;
                if (app && loginRoute) {
                    /**
                     * AUTH
                     */
                    function getReturnUrl(req) {
                        var _a, _b;
                        if ((_a = req === null || req === void 0 ? void 0 : req.query) === null || _a === void 0 ? void 0 : _a.returnURL) {
                            return decodeURIComponent((_b = req === null || req === void 0 ? void 0 : req.query) === null || _b === void 0 ? void 0 : _b.returnURL);
                        }
                        return null;
                    }
                    app.post(loginRoute, (req, res) => __awaiter(this, void 0, void 0, function* () {
                        const successURL = getReturnUrl(req) || "/";
                        let cookieOpts, cookieData;
                        let isOK;
                        try {
                            const { sid, expires } = (yield this.loginThrottled(req.body || {})) || {};
                            if (sid) {
                                let options = {
                                    maxAge: expires || 1000 * 60 * 60 * 24,
                                    httpOnly: true,
                                };
                                cookieOpts = Object.assign(Object.assign(Object.assign({}, options), { secure: true, sameSite: "strict" }), cookieOptions);
                                cookieData = sid;
                                res.cookie(sidKeyName, cookieData, cookieOpts);
                                res.redirect(successURL);
                                // res.cookie('sid', sid, { ...options, sameSite:  });
                                // res.redirect(successURL);
                                isOK = true;
                            }
                            else {
                                throw ("no user or session");
                            }
                        }
                        catch (err) {
                            console.log(err);
                            res.status(404).json({ err: "Invalid username or password" });
                        }
                    }));
                    if (app && logoutGetPath) {
                        app.get(logoutGetPath, (req, res) => __awaiter(this, void 0, void 0, function* () {
                            var _a;
                            const sid = this.validateSid((_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName]);
                            if (sid) {
                                try {
                                    yield this.throttledFunc(() => {
                                        var _a;
                                        return this.opts.logout((_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName], this.dbo, this.db);
                                    });
                                }
                                catch (err) {
                                    console.error(err);
                                }
                            }
                            res.redirect("/");
                        }));
                    }
                    if (app && Array.isArray(userRoutes)) {
                        /* Redirect if not logged in and requesting user content */
                        app.get('*', (req, res) => __awaiter(this, void 0, void 0, function* () {
                            const getUser = () => {
                                var _a;
                                const sid = (_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName];
                                if (!sid)
                                    return undefined;
                                return this.opts.getUser(this.validateSid(sid), this.dbo, this.db);
                            };
                            try {
                                const returnURL = getReturnUrl(req);
                                /* Check auth. Redirect if unauthorized */
                                if (this.isUserRoute(req.path)) {
                                    const u = yield getUser();
                                    if (!u) {
                                        res.redirect(`${loginRoute}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                                        return;
                                    }
                                    /* If authorized and going to returnUrl then redirect. Otherwise serve file */
                                }
                                else if (returnURL && (yield getUser())) {
                                    res.redirect(returnURL);
                                    return;
                                }
                                if (onGetRequestOK) {
                                    onGetRequestOK(req, res);
                                }
                                // res.sendFile(path.join(__dirname + '/../../client/build/index.html'));
                            }
                            catch (error) {
                                console.error(error);
                                res.status(404).json({ msg: "Something went wrong", error });
                            }
                        }));
                    }
                }
            }
        });
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
            if (!querySid) {
                const cookie_str = (_f = (_e = (_d = localParams.socket) === null || _d === void 0 ? void 0 : _d.handshake) === null || _e === void 0 ? void 0 : _e.headers) === null || _f === void 0 ? void 0 : _f.cookie;
                const cookie = parseCookieStr(cookie_str);
                return this.validateSid(cookie[sidKeyName]);
            }
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
    getClientInfo(localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.opts)
                return {};
            const { getUser, getClientUser } = this.opts;
            if (getUser && localParams && (localParams.httpReq || localParams.socket)) {
                const sid = this.getSID(localParams);
                return {
                    sid,
                    user: !sid ? undefined : yield getUser(sid, this.dbo, this.db),
                    clientUser: !sid ? undefined : yield getClientUser(sid, this.dbo, this.db)
                };
            }
            return {};
        });
    }
}
exports.default = AuthHandler;
//# sourceMappingURL=AuthHandler.js.map