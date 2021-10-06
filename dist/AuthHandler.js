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
class AuthHandler {
    constructor(prostgles) {
        this.loginThrottled = (params) => __awaiter(this, void 0, void 0, function* () {
            if (!this.opts.login)
                throw "Auth login config missing";
            const { responseThrottle = 500 } = this.opts;
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
                        app.get(logoutGetPath, function (req, res) {
                            var _a, _b;
                            return __awaiter(this, void 0, void 0, function* () {
                                const sid = (_a = req === null || req === void 0 ? void 0 : req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName];
                                if (sid) {
                                    try {
                                        this.opts.auth.logout((_b = req === null || req === void 0 ? void 0 : req.cookies) === null || _b === void 0 ? void 0 : _b[sidKeyName], this.dbo, this.db);
                                    }
                                    catch (err) {
                                        console.error(err);
                                    }
                                }
                                res.redirect("/");
                            });
                        });
                    }
                    if (app && Array.isArray(userRoutes)) {
                        /* Redirect if not logged in and requesting user content */
                        app.get('*', (req, res) => __awaiter(this, void 0, void 0, function* () {
                            const getUser = () => {
                                var _a;
                                const sid = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[sidKeyName];
                                if (!sid)
                                    return undefined;
                                return this.opts.getUser(sid, this.dbo, this.db);
                            };
                            try {
                                const returnURL = getReturnUrl(req);
                                /* Check auth. Redirect if unauthorized */
                                if (userRoutes.find(userRoute => {
                                    return userRoute === req.path || req.path.startsWith(userRoute) && ["/", "?", "#"].includes(req.path.slice(-1));
                                })) {
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
                return cookie[sidKeyName];
            }
        }
        else if (localParams.httpReq) {
            return (_h = (_g = localParams.httpReq) === null || _g === void 0 ? void 0 : _g.cookies) === null || _h === void 0 ? void 0 : _h[sidKeyName];
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
                    user: yield getUser(sid, this.dbo, this.db),
                    clientUser: yield getClientUser(sid, this.dbo, this.db)
                };
            }
            return {};
        });
    }
}
exports.default = AuthHandler;
//# sourceMappingURL=AuthHandler.js.map