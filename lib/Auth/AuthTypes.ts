import type { Express, Request, Response } from "express";
import type { AuthenticateOptions } from "passport";
import type {
  Profile as FacebookProfile,
  StrategyOptions as FacebookStrategy,
} from "passport-facebook";
import type { Profile as GitHubProfile, StrategyOptions as GitHubStrategy } from "passport-github2";
import type {
  Profile as GoogleProfile,
  StrategyOptions as GoogleStrategy,
} from "passport-google-oauth20";
import type { MicrosoftStrategyOptions } from "passport-microsoft";
import type OAuth2Strategy from "passport-oauth2";
import type {
  AnyObject,
  AuthInput,
  AuthOutput,
  AuthRequest,
  AuthResponse,
  ClientSchema,
  FieldFilter,
  FullFilter,
  IdentityProvider,
  LocalLoginMode,
  MaybePromise,
  UserLike,
} from "prostgles-types";
import type { DBHandlerServer } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { ClientSocketWithCachedData } from "../DboBuilder/DboBuilderTypes";
import type { DB } from "../Prostgles";
import { getAuthRoute } from "./AuthHandler";
import type { ServerSideRequest } from "./utils/serverSideRequest";

type Awaitable<T> = T | Promise<T>;

export type ExpressReq = Request;
export type ExpressRes = Response;

export type LoginClientInfo = {
  ip_address: string;
  ip_address_remote: string | undefined;
  x_real_ip: string | undefined;
  user_agent: string | undefined;
};

export type BasicSession = {
  /** Must be hard to brute-force */
  sid: string;

  /** UNIX millisecond timestamp */
  expires: number;

  /** On expired */
  onExpiration: "redirect" | "show_error";
};

type SocketClientRequest = { socket: ClientSocketWithCachedData; httpReq?: undefined };
type HttpClientRequest = {
  httpReq: ExpressReq;
  res: ExpressRes;
  socket?: undefined;
};
export type NetworkClientRequest = SocketClientRequest | HttpClientRequest;
export type AuthClientRequest = NetworkClientRequest | ServerSideRequest;

export type ThirdPartyProviders = {
  facebook?: Pick<FacebookStrategy, "clientID" | "clientSecret"> & {
    authOpts?: AuthenticateOptions;
  };
  google?: Pick<GoogleStrategy, "clientID" | "clientSecret"> & {
    authOpts?: AuthenticateOptions;
  };
  github?: Pick<GitHubStrategy, "clientID" | "clientSecret"> & {
    authOpts?: AuthenticateOptions;
  };
  microsoft?: Pick<MicrosoftStrategyOptions, "clientID" | "clientSecret"> & {
    authOpts?: AuthenticateOptions;
  };
  customOAuth?: OAuth2Strategy.StrategyOptions & {
    authOpts?: AuthenticateOptions;
    displayName?: string;
    displayIconPath?: string;
  };
};

type PasswordRegisterResponse = AuthOutput<"register">;

/**
 * Users have to provide an email and optionally a password.
 * Account should be activated after email confirmation
 */
export type SignupWithEmail = {
  /**
   * Defaults to 8
   */
  minPasswordLength?: number;

  /**
   * If true, the user will have to provide a password
   */
  requirePassword?: boolean;

  /**
   * Called when the user has registered.
   */
  onRegister: (data: {
    email: AuthInput<"register">["username"];

    /**
     * Password after validation.
     * Will be empty if requirePassword is false
     */
    password: string;
    clientInfo: LoginClientInfo;

    /**
     * Returns a URL that the user can click or enter the verification code to confirm their email address.
     * Will point to /magic-link/:email:code by default
     */
    getConfirmationUrl: (data: { code: string; websiteUrl: string }) => string;
    req: ExpressReq;
  }) => Awaitable<PasswordRegisterResponse>;
};

export type AuthProviderUserData =
  | {
      provider: "google";
      profile: GoogleProfile;
      accessToken: string;
      refreshToken: string;
    }
  | {
      provider: "github";
      profile: GitHubProfile;
      accessToken: string;
      refreshToken: string;
    }
  | {
      provider: "facebook";
      profile: FacebookProfile;
      accessToken: string;
      refreshToken: string;
    }
  | {
      provider: "microsoft";
      profile: any;
      accessToken: string;
      refreshToken: string;
    }
  | {
      provider: "customOAuth";
      profile: any;
      accessToken: string;
      refreshToken: string;
    };

export type RegistrationData =
  | {
      provider: "email";
      profile: {
        username: string;
        password: string;
      };
    }
  | AuthProviderUserData;

export type LoginWithOAuthConfig<S> = {
  OAuthProviders: ThirdPartyProviders;

  /**
   * Required for social login callback
   */
  websiteUrl: string;

  /**
   * Used to stop abuse
   */
  onProviderLoginStart?: (data: {
    provider: IdentityProvider;
    dbo: DBHandlerServer<S>;
    db: DB;
    req: ExpressReq;
    res: ExpressRes;
    clientInfo: LoginClientInfo;
  }) => MaybePromise<
    AuthResponse.OAuthRegisterSuccess | AuthResponse.OAuthRegisterFailure | AuthResponse.AuthFailure
  >;

  /**
   * Used to identify abuse
   */
  onProviderLoginFail?: (data: {
    provider: IdentityProvider;
    error: any;
    dbo: DBHandlerServer<S>;
    db: DB;
    req: ExpressReq;
    res: ExpressRes;
    clientInfo: LoginClientInfo;
  }) => void | MaybePromise<void>;
};

export type SessionUser<
  ServerUser extends UserLike = UserLike,
  ClientUser extends UserLike = UserLike,
> = {
  /**
   * This user will be available in all server-side prostgles options
   * id and type values will be available in the prostgles.user session variable in postgres
   * */
  user: ServerUser;

  /**
   * If true, this is a public/non registered user that can login. Used in UI
   */
  isAnonymous?: boolean;

  /**
   * User data sent to the authenticated client
   */
  clientUser: ClientUser;

  /** Validated session metadata used when auth.cacheSession is enabled. */
  session?: BasicSession;
};

type AllNeverAndOptional<T> = {
  [P in keyof T]?: never;
};
export type AuthResultWithSID<SU = SessionUser> =
  | (SU & { sid: string | undefined; error?: undefined; preferredLogin?: undefined })
  | (AllNeverAndOptional<SU> & {
      sid: string | undefined;
      error?: AuthResponse.AuthFailure;
      preferredLogin?: NonNullable<ClientSchema["auth"]>["preferredLogin"];
    });

export type AuthResult<SU = SessionUser> =
  | SU
  | undefined
  | (AllNeverAndOptional<SU> & {
      preferredLogin?: NonNullable<ClientSchema["auth"]>["preferredLogin"];
    });
export type AuthResultOrError<SU = SessionUser> =
  | AuthResponse.AuthFailure
  | AuthResponse.AuthFailure["code"]
  | AuthResult<SU>
  | {
      type: "new-session";

      /**
       * If provided must login the user. Used for passwordless admin and public users
       */
      session: BasicSession;
      reqInfo: HttpClientRequest;
    };

export type AuthRequestParams<S, SUser extends SessionUser> = {
  db: DB;
  dbo: DBHandlerServer<S>;
  getUser: () => Promise<AuthResultWithSID<SUser>>;
};

export type AuthConfig<S = void, SUser extends SessionUser = SessionUser> = {
  /**
   * Name of the cookie or socket handshake query param that represents the session id.
   * Defaults to "session_id"
   */
  sidKeyName?: string;

  /**
   * Awaited before HTTP/socket auth actions.
   * If session is returned then will set cookie and redirect
   * Failure will stop the auth process
   */
  onUseOrSocketConnected?: (
    sid: string | undefined,
    client: LoginClientInfo,
    reqInfo: NetworkClientRequest,
  ) => Awaitable<void | { error: string; httpCode: 400 | 401 | 403 } | { session: BasicSession }>;

  /**
   * Required to allow self-managed or managed (by setting up loginSignupConfig) authentication.
   * HTTP/socket requests only; server-side userId requests use findUser.
   * Used in:
   * - publish - userData and/or sid (in testing) are passed to the publish function
   * - auth.expressConfig.use - express middleware to get user data and
   *    undefined sid is allowed to enable public users
   * - websocket auth guard - when session expires tells the client to reload to be redirected to login
   */
  getUser: (
    sid: string | undefined,
    dbo: DBHandlerServer<S>,
    db: DB,
    client: LoginClientInfo,
    reqInfo: NetworkClientRequest,
  ) => Awaitable<AuthResultOrError<SUser>>;

  /**
   * Used in functions and server-side userId requests.
   */
  findUser: (
    userFilter: FullFilter<void, void>,
    dbo: DBHandlerServer<S>,
  ) => Awaitable<SUser["user"] | undefined>;

  /**
   * Controls which fields from user are available in postgres session variable.
   * "id" and "type" are always included.
   */
  sessionFields?: FieldFilter<SUser["user"]>;

  /**
   * Will setup auth routes
   *  /login
   *  /logout
   *  /magic-link/:id
   */
  loginSignupConfig?: LoginSignupConfig<S, SUser>;

  /**
   * Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
   */
  responseThrottle?: number;

  /**
   * Reuse getUser results per socket when they include session metadata.
   * Expiry closes the socket. Call invalidateAuth when cached user permissions change.
   */
  cacheSession?: boolean;
};

export type LoginResponse =
  | {
      session: BasicSession;
      response?: Extract<AuthOutput<"login">, { success: true; code?: undefined }>;
    }
  | {
      session?: undefined;
      response: Extract<AuthOutput<"login">, { success: true; code: string }>;
    }
  | Extract<AuthOutput<"login">, { success: false }>["code"];

export type MagicLinkOrOTPData =
  | (Extract<AuthInput<"magicLinkOrOTP">, { id: string }> & {
      type: "magic-link";
      returnToken: boolean;
    })
  | (Extract<AuthInput<"magicLinkOrOTP">, { email: string }> & {
      type: "otp";
      returnToken: boolean;
    });

export const getMagicLinkUrl = ({
  websiteUrl,
  data,
  loginSignupConfig,
}: {
  websiteUrl: string;
  data: MagicLinkOrOTPData;
  loginSignupConfig: AuthConfig["loginSignupConfig"];
}) => {
  if (data.type === "magic-link") {
    return new URL(
      `${getAuthRoute(loginSignupConfig, "magicLinks")}/${encodeURIComponent(data.id)}`,
      websiteUrl,
    ).toString();
  }
  const { code, email } = data;
  const confirmationUrl = new URL(`${websiteUrl}${getAuthRoute(loginSignupConfig, "magicLinks")}`);
  confirmationUrl.searchParams.set("email", email);
  confirmationUrl.searchParams.set("code", code);
  return confirmationUrl.toString();
};
export type LoginParams =
  | ({
      type: "username";
    } & AuthRequest.LoginData)
  | ({ type: "OAuth" } & AuthProviderUserData);

export type LoginSignupConfig<S, SUser extends SessionUser> = {
  /**
   * Express app instance. If provided Prostgles will attempt to set sidKeyName to user cookie
   */
  app: Express;

  authRoutesBasePath?: string;

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
   * Will be called after a GET request is authorised
   * This means that
   */
  onGetRequestOK?: (
    req: ExpressReq,
    res: ExpressRes,
    params: AuthRequestParams<S, SUser>,
  ) => Awaitable<void>;

  /**
   * If defined, will enable:
   * - GET /magic-link/:id route.
   * - POST /magic-link { email, code } route.
   * Successful requests that return a session will be logged in
   * and redirected to the returnUrl if set.
   * Otherwise just the response will be sent
   */
  onMagicLinkOrOTP?: (
    data: MagicLinkOrOTPData,
    dbo: DBHandlerServer<S>,
    db: DB,
    client: LoginClientInfo,
  ) => Awaitable<
    | {
        session: BasicSession | undefined;
        response?: Extract<AuthOutput<"magicLinkOrOTP">, { success: true }>;
      }
    | {
        session?: undefined;
        response: Extract<AuthOutput<"magicLinkOrOTP">, { success: false }>;
      }
  >;

  signupWithEmail?: SignupWithEmail;

  loginWithOAuth?: LoginWithOAuthConfig<S>;

  /**
   * Used to hint to the client which login mode is available
   * Defaults to username and password
   */
  localLoginMode?: LocalLoginMode;

  /**
   * If provided then the user will be able to login with a username and/or password
   * through the POST /login route.
   */
  login: (
    params: LoginParams,
    dbo: DBHandlerServer<S>,
    db: DB,
    client: LoginClientInfo,
    getMagicLinkUrl: (data: MagicLinkOrOTPData, websiteUrl: string) => string,
  ) => Awaitable<LoginResponse>;

  logout: (sid: string | undefined, dbo: DBHandlerServer<S>, db: DB) => Awaitable<void>;
};
