import { Express, NextFunction, Request, Response } from "express";
import { AnyObject } from "prostgles-types";
import { LocalParams, PRGLIOSocket } from "./DboBuilder";
import { DBOFullyTyped } from "./DBSchemaBuilder";
import { DB, DBHandlerServer, Prostgles } from "./Prostgles";
declare type Awaitable<T> = T | Promise<T>;
declare type AuthSocketSchema = {
    user?: AnyObject;
    register?: boolean;
    login?: boolean;
    logout?: boolean;
    pathGuard?: boolean;
};
declare type ExpressReq = Request;
declare type ExpressRes = Response;
declare type LoginClientInfo = {
    ip_address: string;
    user_agent?: string | undefined;
};
export declare type BasicSession = {
    /** Must be hard to bruteforce */
    sid: string;
    /** UNIX millisecond timestamp */
    expires: number;
    /** On expired */
    onExpiration: "redirect" | "show_error";
};
export declare type AuthClientRequest = {
    socket: any;
} | {
    httpReq: ExpressReq;
};
export declare type SessionUser<ServerUser extends AnyObject = AnyObject, ClientUser extends AnyObject = AnyObject> = {
    /**
     * This user will be available in all serverside prostgles options
     * */
    user: ServerUser;
    /**
     * User data sent to the authenticated client
     */
    clientUser: ClientUser;
};
export declare type AuthResult<SU = SessionUser> = SU & {
    sid: string;
} | {
    user?: undefined;
    clientUser?: undefined;
    sid?: string;
} | undefined;
export declare type AuthRequestParams<S, SUser extends SessionUser> = {
    db: DB;
    dbo: DBOFullyTyped<S>;
    getUser: () => Promise<AuthResult<SUser>>;
};
export declare type Auth<S = void, SUser extends SessionUser = SessionUser> = {
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
        use?: (args: {
            req: ExpressReq;
            res: ExpressRes;
            next: NextFunction;
        } & AuthRequestParams<S, SUser>) => void | Promise<void>;
        /**
         * Will be called after a GET request is authorised
         * This means that
         */
        onGetRequestOK?: (req: ExpressReq, res: ExpressRes, params: AuthRequestParams<S, SUser>) => any;
        /**
         * Name of get url parameter used in redirecting user after successful login.
         * Defaults to "returnURL"
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
            check: (magicId: string, dbo: DBOFullyTyped<S>, db: DB, client: LoginClientInfo) => Awaitable<BasicSession | undefined>;
        };
    };
    /**
     * undefined sid is allowed to enable public users
     */
    getUser: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB, client: AuthClientRequest) => Awaitable<AuthResult<SUser>>;
    register?: (params: AnyObject, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession> | BasicSession;
    login?: (params: AnyObject, dbo: DBOFullyTyped<S>, db: DB, client: LoginClientInfo) => Awaitable<BasicSession> | BasicSession;
    logout?: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<any>;
    /**
     * If provided then session info will be saved on socket.__prglCache and reused from there
     */
    cacheSession?: {
        getSession: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession>;
    };
};
export default class AuthHandler {
    protected opts?: Auth;
    dbo: DBHandlerServer;
    db: DB;
    sidKeyName?: string;
    routes: {
        login?: string;
        returnURL?: string;
        logoutGetPath?: string;
        magicLinks?: {
            route: string;
            expressRoute: string;
        };
        readonly catchAll: '*';
    };
    constructor(prostgles: Prostgles);
    validateSid: (sid: string | undefined) => string | undefined;
    matchesRoute: (route: string | undefined, clientFullRoute: string) => boolean | "" | undefined;
    isUserRoute: (pathname: string) => boolean;
    private setCookieAndGoToReturnURLIFSet;
    getUser: (clientReq: {
        httpReq: ExpressReq;
    }) => Promise<AuthResult>;
    init(): Promise<void>;
    destroy: () => void;
    throttledFunc: <T>(func: () => Promise<T>, throttle?: number) => Promise<T>;
    loginThrottled: (params: AnyObject, client: LoginClientInfo) => Promise<BasicSession>;
    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams
     * @returns string
     */
    getSID(localParams: LocalParams): string | undefined;
    getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<AuthResult>;
    isValidSocketSession: (socket: PRGLIOSocket, session: BasicSession) => boolean;
    makeSocketAuth: (socket: PRGLIOSocket) => Promise<Record<string, never> | {
        auth: AuthSocketSchema;
        userData: AuthResult;
    }>;
}
export {};
//# sourceMappingURL=AuthHandler.d.ts.map