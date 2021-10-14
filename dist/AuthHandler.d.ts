import { AnyObject } from "prostgles-types";
import { LocalParams } from "./DboBuilder";
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
    cookies?: AnyObject;
    params?: AnyObject;
    path: string;
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
    sid: string;
    expires: number;
};
export declare type AuthClientRequest = {
    socket: any;
} | {
    httpReq: any;
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
};
export declare type ClientInfo = {
    user?: AnyObject;
    clientUser?: AnyObject;
    sid?: string;
};
export default class AuthHandler {
    opts?: Auth;
    dbo: DbHandler;
    db: DB;
    sidKeyName: string;
    returnURL: string;
    constructor(prostgles: Prostgles);
    validateSid: (sid: string) => string;
    isUserRoute: (pathname: string) => boolean;
    private setCookie;
    init(): Promise<void>;
    throttledFunc: <T>(func: () => Promise<T>, throttle?: number) => Promise<T>;
    loginThrottled: (params: AnyObject) => Promise<BasicSession>;
    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams
     * @returns string
     */
    getSID(localParams: LocalParams): string;
    getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<ClientInfo>;
    makeSocketAuth: (socket: any) => Promise<AuthSocketSchema>;
}
export {};
//# sourceMappingURL=AuthHandler.d.ts.map