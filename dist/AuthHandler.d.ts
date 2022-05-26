import { AnyObject } from "prostgles-types";
import { LocalParams, PRGLIOSocket } from "./DboBuilder";
import { DB, DbHandler, Prostgles } from "./Prostgles";
declare type AuthSocketSchema = {
    user?: AnyObject;
    register?: boolean;
    login?: boolean;
    logout?: boolean;
    pathGuard?: boolean;
};
declare type ExpressReq = {
    body?: AnyObject;
    query?: AnyObject;
    cookies?: AnyObject;
    params?: AnyObject;
    path: string;
    originalUrl: string;
};
declare type ExpressRes = {
    status: (code: number) => ({
        json: (response: AnyObject) => any;
    });
    cookie: (name: string, value: string, options: AnyObject) => any;
    sendFile: (filepath: string) => void;
    redirect: (url: string) => void;
};
export declare type BasicSession = {
    /** Must be hard to bruteforce */
    sid: string;
    /** UNIX millisecond timestamp */
    expires: number;
};
export declare type AuthClientRequest = {
    socket: any;
} | {
    httpReq: ExpressReq;
};
export declare type Auth<DBO = DbHandler> = {
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
         * If provided, any client requests to NOT these routes (or their subroutes) will be redirected to loginRoute and then redirected back to the initial route after logging in
         */
        publicRoutes?: string[];
        /**
         * False by default. If false and userRoutes are provided then the socket will request window.location.reload if the current url is on a user route.
         */
        disableSocketAuthGuard?: boolean;
        /**
         * Will be called after a GET request is authorised
         */
        onGetRequestOK?: (req: ExpressReq, res: ExpressRes) => any;
        /**
         * Name of get url parameter used in redirecting user after successful login. Defaults to returnURL
         */
        returnURL?: string;
        magicLinks?: {
            /**
             * Will default to /magic-link
             */
            route?: string;
            /**
             * Used in creating a session/logging in using a magic link
             */
            check: (magicId: string, dbo: DBO, db: DB) => Promise<BasicSession | undefined>;
        };
    };
    /**
     * User data used on server. Mainly used in http request auth
     */
    getUser: (sid: string | undefined, dbo: DBO, db: DB, client: AuthClientRequest) => Promise<AnyObject | undefined> | AnyObject | undefined;
    /**
     * User data sent to client. Mainly used in socket request auth
     */
    getClientUser: (sid: string, dbo: DBO, db: DB) => Promise<AnyObject | undefined> | AnyObject | undefined;
    register?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession> | BasicSession;
    login?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession> | BasicSession;
    logout?: (sid: string | undefined, dbo: DBO, db: DB) => Promise<any>;
    /**
     * If provided then then session info will be saved on socket.__prglCache and reused from there
     */
    cacheSession?: {
        getSession: (sid: string | undefined, dbo: DBO, db: DB) => Promise<BasicSession>;
    };
};
export declare type ClientInfo = {
    user?: AnyObject;
    clientUser?: AnyObject;
    sid?: string;
};
export default class AuthHandler {
    protected opts?: Auth;
    dbo: DbHandler;
    db: DB;
    sidKeyName?: string;
    returnURL?: string;
    loginRoute?: string;
    logoutGetPath?: string;
    constructor(prostgles: Prostgles);
    validateSid: (sid: string | undefined) => string | undefined;
    matchesRoute: (route: string | undefined, clientFullRoute: string) => boolean | "" | undefined;
    isUserRoute: (pathname: string) => boolean;
    private setCookieAndGoToReturnURLIFSet;
    getUser: (clientReq: AuthClientRequest) => Promise<AnyObject | undefined>;
    init(): Promise<void>;
    throttledFunc: <T>(func: () => Promise<T>, throttle?: number) => Promise<T>;
    loginThrottled: (params: AnyObject) => Promise<BasicSession>;
    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams
     * @returns string
     */
    getSID(localParams: LocalParams): string | undefined;
    getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<ClientInfo | undefined>;
    isValidSocketSession: (socket: PRGLIOSocket, session: BasicSession) => boolean;
    makeSocketAuth: (socket: PRGLIOSocket) => Promise<AuthSocketSchema>;
}
export {};
//# sourceMappingURL=AuthHandler.d.ts.map