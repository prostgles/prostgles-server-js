import type { Express, Request, Response } from "express";
import type Mail from "nodemailer/lib/mailer";
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
  AuthRequest,
  AuthResponse,
  AuthSocketSchema,
  ClientSchema,
  FieldFilter,
  IdentityProvider,
  UserLike,
} from "prostgles-types";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { PRGLIOSocket} from "../DboBuilder/DboBuilderTypes";
import { type CachedSession } from "../DboBuilder/DboBuilderTypes";
import type { DB } from "../Prostgles";
import { AUTH_ROUTES_AND_PARAMS } from "./AuthHandler";

type Awaitable<T> = T | Promise<T>;

export type ExpressReq = Request & CachedSession;
export type ExpressRes = Response;

export type LoginClientInfo = {
  ip_address: string;
  ip_address_remote: string | undefined;
  x_real_ip: string | undefined;
  user_agent: string | undefined;
};

export type BasicSession = {
  /** Must be hard to bruteforce */
  sid: string;

  /** UNIX millisecond timestamp */
  expires: number;

  /** On expired */
  onExpiration: "redirect" | "show_error";
};

type SocketClientRequest = { socket: PRGLIOSocket; httpReq?: undefined };
type HttpClientRequest = { httpReq: ExpressReq; res: ExpressRes; socket?: undefined };
export type AuthClientRequest = SocketClientRequest | HttpClientRequest;

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

type TLSConfig = {
  rejectUnauthorized?: boolean;
  servername?: string;
};
export type SMTPConfig =
  | {
      type: "smtp";
      host: string;
      port: number;
      secure?: boolean;
      user: string;
      pass: string;
      tls?: TLSConfig;
    }
  | {
      type: "aws-ses";
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      /**
       * Sending rate per second
       * Defaults to 1
       */
      sendingRate?: number;
    };

export type Email = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string }[] | Mail.Attachment[];
};

type PasswordRegisterResponse =
  | AuthResponse.PasswordRegisterFailure
  | AuthResponse.PasswordRegisterSuccess;

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
    email: string;

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
    dbo: DBOFullyTyped<S>;
    db: DB;
    req: ExpressReq;
    res: ExpressRes;
    clientInfo: LoginClientInfo;
  }) => Promise<
    AuthResponse.OAuthRegisterSuccess | AuthResponse.OAuthRegisterFailure | AuthResponse.AuthFailure
  >;

  /**
   * Used to identify abuse
   */
  onProviderLoginFail?: (data: {
    provider: IdentityProvider;
    error: any;
    dbo: DBOFullyTyped<S>;
    db: DB;
    req: ExpressReq;
    res: ExpressRes;
    clientInfo: LoginClientInfo;
  }) => void | Promise<void>;
};

export type SessionUser<
  ServerUser extends UserLike = UserLike,
  ClientUser extends UserLike = UserLike,
> = {
  /**
   * This user will be available in all serverside prostgles options
   * id and type values will be available in the prostgles.user session variable in postgres
   * */
  user: ServerUser;

  /**
   * If true, this is a public/non registered user that can login. Used in UI
   */
  isAnonymous?: boolean;

  /**
   * Controls which fields from user are available in postgres session variable
   */
  sessionFields?: FieldFilter<ServerUser>;
  /**
   * User data sent to the authenticated client
   */
  clientUser: ClientUser;
};

type AllNeverAndOptional<T> = {
  [P in keyof T]?: never;
};
export type AuthResultWithSID<SU = SessionUser> =
  | (SU & { sid: string; error?: undefined; preferredLogin?: undefined })
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
  dbo: DBOFullyTyped<S>;
  getUser: () => Promise<AuthResultWithSID<SUser>>;
};

export type AuthConfig<S = void, SUser extends SessionUser = SessionUser> = {
  /**
   * Name of the cookie or socket hadnshake query param that represents the session id.
   * Defaults to "session_id"
   */
  sidKeyName?: string;

  /**
   * Awaited before any auth actions.
   * If session is returned then will set cookie and redirect
   * Failure will stop the auth process
   */
  onUseOrSocketConnected?: (
    sid: string | undefined,
    client: LoginClientInfo,
    reqInfo: AuthClientRequest
  ) => Awaitable<void | { error: string; httpCode: 400 | 401 | 403 } | { session: BasicSession }>;

  /**
   * Required to allow self-managed or managed (by setting up loginSignupConfig) authentication.
   * Used in:
   * - publish - userData and/or sid (in testing) are passed to the publish function
   * - auth.expressConfig.use - express middleware to get user data and
   *    undefined sid is allowed to enable public users
   * - websocket authguard - when session expires tells the client to reload to be redirected to login
   */
  getUser: (
    sid: string | undefined,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo,
    reqInfo: AuthClientRequest
  ) => Awaitable<AuthResultOrError<SUser>>;

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
   * If provided then session info will be saved on socket.__prglCache and reused from there
   */
  cacheSession?: {
    getSession: (sid: string, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession | undefined>;
  };
};

export type LoginResponse =
  | {
      session: BasicSession;
      response?: AuthResponse.PasswordLoginSuccess;
    }
  | {
      session?: undefined;
      response: AuthResponse.MagicLinkAuthSuccess;
    }
  | AuthResponse.OAuthRegisterFailure["code"]
  | AuthResponse.PasswordLoginFailure["code"]
  | AuthResponse.MagicLinkAuthFailure["code"];

export type MagicLinkOrOTPData =
  | { type: "magic-link"; id: string; returnToken: boolean }
  | { type: "otp"; code: string; email: string; returnToken: boolean };

export const getMagicLinkUrl = (websiteUrl: string, data: MagicLinkOrOTPData) => {
  if (data.type === "magic-link") {
    return `${AUTH_ROUTES_AND_PARAMS.magicLinkWithId}/${data.id}`;
  }
  const { code, email } = data;
  const confirmationUrl = new URL(`${websiteUrl}${AUTH_ROUTES_AND_PARAMS.magicLinks}`);
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
    params: AuthRequestParams<S, SUser>
  ) => Awaitable<void>;

  /**
   * If defined, will enable:
   * - GET /magic-link/:id route.
   * - POST /magic-link { email, code } route.
   * Successfull requests that return a session will be logged in
   * and redirected to the returnUrl if set.
   * Otherwise just the response will be sent
   */
  onMagicLinkOrOTP?: (
    data: MagicLinkOrOTPData,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo
  ) => Awaitable<
    | {
        session: BasicSession | undefined;
        response?: AuthResponse.AuthSuccess | AuthResponse.PasswordRegisterEmailConfirmationSuccess;
      }
    | {
        session?: undefined;
        response: AuthResponse.MagicLinkAuthFailure | AuthResponse.CodeVerificationFailure;
      }
  >;

  signupWithEmail?: SignupWithEmail;

  loginWithOAuth?: LoginWithOAuthConfig<S>;

  /**
   * Used to hint to the client which login mode is available
   * Defaults to username and password
   */
  localLoginMode?: AuthSocketSchema["loginType"];

  /**
   * If provided then the user will be able to login with a username and/or password
   * through the POST /login route.
   */
  login: (
    params: LoginParams,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo
  ) => Awaitable<LoginResponse>;

  logout: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<void>;
};
