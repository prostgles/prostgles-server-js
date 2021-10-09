import { AnyObject } from "prostgles-types";
import { LocalParams } from "./DboBuilder";
import { DB, DbHandler, Prostgles } from "./Prostgles";

export type BasicSession = { sid: string, expires: number };
export type AuthClientRequest = { socket: any } | { httpReq: any }
export type Auth<DBO = DbHandler> = {
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
        app: any;

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
         * If provided, any client requests to these routes (or their subroutes) will be redirected to loginRoute and then redirected back to the initial route after logging in
         */
        userRoutes?: string[];

        /**
         * Will be called after a GET request is authorised
         */
        onGetRequestOK?: (req, res) => any;
    }

    /**
     * User data used on server
     */
    getUser: (sid: string, dbo: DBO, db: DB) => Promise<AnyObject | null | undefined>;

    /**
     * User data sent to client
     */
    getClientUser: (sid: string, dbo: DBO, db: DB) => Promise<AnyObject | null | undefined>;

    register?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession>;
    login?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession>;
    logout?: (sid: string, dbo: DBO, db: DB) => Promise<any>;
}

export type ClientInfo = {
    user?: AnyObject;
    clientUser?: AnyObject;
    sid?: string;
}

export default class AuthHandler {
    opts?: Auth;
    dbo: DbHandler;
    db: DB;
    sidKeyName: string;

    constructor(prostgles: Prostgles){
        this.opts = prostgles.opts.auth;
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
    }

    validateSid = (sid: string) => {
        if(!sid) return undefined;
        if(typeof sid !== "string") throw "sid missing or not a string";
        return sid;
    }

    async init(){
        if(!this.opts) return;
                  
        this.opts.sidKeyName = this.opts.sidKeyName || "session_id";
        const { sidKeyName, login, getUser, getClientUser, expressConfig } = this.opts;  
        this.sidKeyName = this.opts.sidKeyName;

        if(typeof sidKeyName !== "string" && !login){
            throw "Invalid auth: Provide { sidKeyName: string } ";
        }
        /**
         * Why ??? Collision with socket.io ???
         */
        if(this.sidKeyName === "sid") throw "sidKeyName cannot be 'sid' please provide another name.";

        if(!getUser || !getClientUser) throw "getUser OR getClientUser missing from auth config";

        if(expressConfig){
            const { app, logoutGetPath = "/logout", loginRoute = "/login", cookieOptions = {}, userRoutes = [], onGetRequestOK } = expressConfig;
            if(app && loginRoute){

                /**
                 * AUTH
                 */
                function getReturnUrl(req){
                    if(req?.query?.returnURL){
                        return decodeURIComponent(req?.query?.returnURL);
                    }
                    return null;
                }
                app.post(loginRoute, async (req, res) => {
                    const successURL = getReturnUrl(req) || "/";
                    let cookieOpts, cookieData;
                    let isOK;

                    try {
                        const { sid, expires } = await this.loginThrottled(req.body || {}) || {};
                        
                        if(sid){
            
                            let options = {
                                maxAge: expires || 1000 * 60 * 60 * 24, // would expire after 24 hours
                                httpOnly: true, // The cookie only accessible by the web server
                                //signed: true // Indicates if the cookie should be signed
                            }
                            cookieOpts = { ...options, secure: true, sameSite: "strict", ...cookieOptions }
                            cookieData = sid;
                            res.cookie(sidKeyName, cookieData, cookieOpts); 
                            res.redirect(successURL);
                            // res.cookie('sid', sid, { ...options, sameSite:  });
                            
                            // res.redirect(successURL);
                            isOK = true;
                        } else {
                            throw ("no user or session")
                        }
                    } catch (err){
                        console.log(err)
                        res.status(404).json({ err: "Invalid username or password" });
                    }
            
            
                });
                
                if(app && logoutGetPath){
                    app.get(logoutGetPath, async (req, res) => {
                        const sid = this.validateSid(req?.cookies?.[sidKeyName]);
                        if(sid){
                            try {
                                await this.throttledFunc(() => {

                                    return this.opts.logout(req?.cookies?.[sidKeyName], this.dbo as any, this.db);
                                })
                            } catch(err){
                                console.error(err);
                            }
                        }
                        res.redirect("/")
                    });
                }

                if(app && Array.isArray(userRoutes)){

                    /* Redirect if not logged in and requesting user content */
                    app.get('*', async (req, res) => {
                        const getUser = () => {
                            const sid = req?.cookies?.[sidKeyName];
                            if(!sid) return undefined;
                            
                            return this.opts.getUser(this.validateSid(sid), this.dbo, this.db);
                        }
                        
                        try {
                            const returnURL = getReturnUrl(req)
                    
                            
                            
                            /* Check auth. Redirect if unauthorized */
                            if(userRoutes.find(userRoute => {
                                return userRoute === req.path || req.path.startsWith(userRoute) && ["/", "?", "#"].includes(req.path.slice(-1));
                            })){
                                const u = await getUser();
                                if(!u){
                                    res.redirect(`${loginRoute}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                                    return; 
                                }

                            /* If authorized and going to returnUrl then redirect. Otherwise serve file */
                            } else if(returnURL && (await getUser())){
                        
                                res.redirect(returnURL);
                                return;
                            }
                            
                            if(onGetRequestOK){
                                onGetRequestOK(req, res)
                            }
                            // res.sendFile(path.join(__dirname + '/../../client/build/index.html'));
                    
                        } catch(error) {
                            console.error(error);
                            res.status(404).json({ msg: "Something went wrong", error });
                        }
        
                    });
                }
            }
        }
    }

    throttledFunc = <T>(func: () => Promise<T>, throttle = 500): Promise<T> => {
      
        return new Promise(async (resolve, reject) => {

            let result: any, error: any;
    
            /**
             * Throttle response times to prevent timing attacks
             */
            let interval = setInterval(() => {
                if(error || result){
                    if(error){
                        reject(error);
                    } else if(result){
                        resolve(result)
                    }
                    clearInterval(interval);
                }
            }, throttle);
    
    
            try {
                result = await func();
                
            } catch (err){
                console.log(err)
                error = err;
            }

        })
    }

    loginThrottled = async (params: AnyObject): Promise<BasicSession> => {
        if(!this.opts.login) throw "Auth login config missing";
        const { responseThrottle = 500 } = this.opts;

        return this.throttledFunc(async () => {
            let result = await this.opts.login(params, this.dbo as any, this.db);
            
            if(!result.sid){
                throw { msg: "Something went wrong making a session" }
            }
            return result;
        }, responseThrottle);

        return new Promise(async (resolve, reject) => {

            let result: BasicSession, error: any;
    
            /**
             * Throttle response times to prevent timing attacks
             */
            let interval = setInterval(() => {
                if(error || result){
                    if(error){
                        reject(error);
                    } else if(result){
                        resolve(result)
                    }
                    clearInterval(interval);
                }
            }, responseThrottle);
    
    
            try {
                result = await this.opts.login(params, this.dbo as any, this.db);
                
                if(!result.sid){
                    error = { msg: "Something went wrong making a session" }
                }
            } catch (err){
                console.log(err)
                error = err;
            }

        })
    }


    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams 
     * @returns string
     */
     getSID(localParams: LocalParams): string {
        if(!this.opts) return null;

        const { sidKeyName } = this.opts;

        if(!sidKeyName || !localParams) return null;

        if(localParams.socket){
            const querySid = localParams.socket?.handshake?.query?.[sidKeyName];
            if(!querySid){
                const cookie_str = localParams.socket?.handshake?.headers?.cookie;
                const cookie = parseCookieStr(cookie_str);
                return this.validateSid(cookie[sidKeyName]);
            }

        } else if(localParams.httpReq){
            return this.validateSid(localParams.httpReq?.cookies?.[sidKeyName]);

        } else throw "socket OR httpReq missing from localParams";

        function parseCookieStr(cookie_str: string): any {
            if(!cookie_str || typeof cookie_str !== "string") return {}
            return cookie_str.replace(/\s/g, '').split(";").reduce((prev, current) => {
                const [name, value] = current.split('=');
                prev[name] = value;
                return prev
            }, {});
        }
    }

    async getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<ClientInfo>{
        if(!this.opts) return {};

        const { getUser, getClientUser } = this.opts;

        if(getUser && localParams && (localParams.httpReq || localParams.socket)){
            const sid = this.getSID(localParams);
            return {
                sid,
                user: !sid? undefined : await getUser(sid, this.dbo as any, this.db),
                clientUser: !sid? undefined : await getClientUser(sid, this.dbo as any, this.db)
            }
        }

        return {};
    }
}