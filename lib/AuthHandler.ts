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
    expressConfig?: {
        /**
         * Express app instance. If provided Prostgles will attempt to set sidKeyName to user cookie
         */
        app: any;

        /**
         * Used in allowing logging in through express. Defaults to /login
         */
        loginPostPath?: string;

        /**
         * Used in allowing logging out through express. Defaults to /logout
         */
        logoutGetPath?: string;

        /**
         * Options used in setting the cookie after a successful login
         */
        cookieOptions?: AnyObject;

        /**
         * Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
         */
        responseThrottle?: number;

        /**
         * If provided, any client requests to these routes (or their subroutes) will be redirected to loginPostPath and then redirected back to the initial route after logging in
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
    opts: Auth;
    dbo: DbHandler;
    db: DB;
    sidKeyName: string;

    constructor(prostgles: Prostgles){
        this.opts = prostgles.opts.auth;
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
    }

    async init(){

                  
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
            const { app, logoutGetPath = "/logout", loginPostPath = "/login", cookieOptions = {}, responseThrottle = 500, userRoutes, onGetRequestOK } = expressConfig;
            if(app && loginPostPath){

                /**
                 * AUTH
                 */
                function getReturnUrl(req){
                    if(req?.query?.returnURL){
                        return decodeURIComponent(req?.query?.returnURL);
                    }
                    return null;
                }
                app.post(loginPostPath, async (req, res) => {
                    const successURL = getReturnUrl(req) || "/";
                    let cookieOpts, cookieData;
                    let isOK;

                    /**
                     * Throttle response times to prevent timing attacks
                     */
                    let interval = setInterval(() => {
                        if(typeof isOK === "boolean"){
                            if(isOK){
                                res.cookie(sidKeyName, cookieData, cookieOpts); 
                                res.redirect(successURL);
                            } else {
                                res.status(404).json({ err: "Invalid username or password" });
                            }
                            clearInterval(interval);
                        }
                    }, responseThrottle);

                    try {
                        const { sid, expires } = await this.opts.login(req.body || {}, this.dbo as any, this.db) || {};
                        
                        if(sid){
            
                            let options = {
                                maxAge: expires || 1000 * 60 * 60 * 24, // would expire after 24 hours
                                httpOnly: true, // The cookie only accessible by the web server
                                //signed: true // Indicates if the cookie should be signed
                            }
                            cookieOpts = { ...options, secure: true, sameSite: "strict", ...cookieOptions }
                            cookieData = sid;
                            // res.cookie('sid', sid, { ...options, sameSite:  });
                            
                            // res.redirect(successURL);
                            isOK = true;
                        } else {
                            isOK = false;
                            console.error("no user or session")
                        }
                    } catch (err){
                        console.log(err)
                        isOK = false;
                    }
            
            
                });
                
                if(app && logoutGetPath){
                    app.get(logoutGetPath, async function(req, res){
                        const sid = req?.cookies?.[sidKeyName];
                        if(sid){
                            try {
                                this.opts.auth.logout(req?.cookies?.[sidKeyName], this.dbo as any, this.db);
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
                            const sid = req.cookies?.[sidKeyName];
                            if(!sid) return undefined;
                            return this.opts.getUser(sid, this.dbo, this.db);
                        }
                                
                        try {
                    
                            /* If authorized and going to returnUrl then redirect */
                            if(getReturnUrl(req)){
                        
                                const u = await getUser();
                                if(u){
                                    res.redirect(getReturnUrl(req));
                                    return;
                                } else {
                                    throw "User not found"
                                }
                            
                            /* Check auth. Redirect if unauthorized */
                            } else if(userRoutes.find(userRoute => {
                                return userRoute === req.path || req.path.startsWith(userRoute) && ["/", "?", "#"].includes(req.path.slice(-1));
                            })){
                                const u = await getUser();
                                if(!u){
                                    res.redirect(`${loginPostPath}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                                    return; 
                                }
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
                return cookie[sidKeyName];
            }

        } else if(localParams.httpReq){
            return localParams.httpReq?.cookies?.[sidKeyName];

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
        if(this.opts){
            const { getUser, getClientUser } = this.opts;
    
            if(getUser && localParams && (localParams.httpReq || localParams.socket)){
                const sid = this.getSID(localParams);
                return {
                    sid,
                    user: await getUser(sid, this.dbo as any, this.db),
                    clientUser: await getClientUser(sid, this.dbo as any, this.db)
                }
            }
        }

        return {};
    }
}