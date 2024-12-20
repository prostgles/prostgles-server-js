import { Express, NextFunction, Request, Response } from "express";
import Mail from "nodemailer/lib/mailer";
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
import {
  AnyObject,
  FieldFilter,
  IdentityProvider,
  AuthResponse,
  UserLike,
  AuthRequest,
  AuthFailure,
} from "prostgles-types";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import { DB } from "../Prostgles";

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
  /** Must be hard to bruteforce */
  sid: string;

  /** UNIX millisecond timestamp */
  expires: number;

  /** On expired */
  onExpiration: "redirect" | "show_error";
};
export type AuthClientRequest =
  | { socket: PRGLIOSocket; httpReq?: undefined }
  | { httpReq: ExpressReq; socket?: undefined };

type ThirdPartyProviders = {
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
};

export type SMTPConfig =
  | {
      type: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
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

type EmailWithoutTo = Omit<Email, "to">;

type MagicLinkAuthResponse =
  | AuthResponse.MagicLinkAuthFailure["code"]
  | { response: AuthResponse.MagicLinkAuthSuccess; email: EmailWithoutTo };

type PasswordRegisterResponse =
  | AuthResponse.PasswordRegisterFailure["code"]
  | { response: AuthResponse.PasswordRegisterSuccess; email: EmailWithoutTo };

export type EmailProvider =
  | {
      signupType: "withMagicLink";
      onRegister: (data: {
        email: string;
        magicLinkUrlPath: string;
        clientInfo: LoginClientInfo;
        req: ExpressReq;
      }) => Awaitable<MagicLinkAuthResponse>;
      smtp: SMTPConfig;
    }
  | {
      /**
       * Users have to provide an email and a password.
       * Account should be activated after email confirmation
       */
      signupType: "withPassword";
      /**
       * Defaults to 8
       */
      minPasswordLength?: number;
      /**
       * Called when the user has registered
       */
      onRegister: (data: {
        email: string;
        password: string;
        confirmationUrlPath: string;
        clientInfo: LoginClientInfo;
        req: ExpressReq;
      }) => Awaitable<PasswordRegisterResponse>;
      smtp: SMTPConfig;

      /**
       * Called after the user has clicked the URL to confirm their email address
       */
      onEmailConfirmation: (data: {
        confirmationCode: string;
        clientInfo: LoginClientInfo;
        req: ExpressReq;
      }) => Awaitable<AuthFailure["code"] | AuthResponse.AuthSuccess>;
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

export type AuthRegistrationConfig<S> = {
  email?: EmailProvider;

  OAuthProviders?: ThirdPartyProviders;

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
  }) => Promise<{ error: string } | { ok: true }>;

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
   * Controls which fields from user are available in postgres session variable
   */
  sessionFields?: FieldFilter<ServerUser>;
  /**
   * User data sent to the authenticated client
   */
  clientUser: ClientUser;
};

export type AuthResult<SU = SessionUser> =
  | (SU & { sid: string })
  | {
      user?: undefined;
      clientUser?: undefined;
      sid?: string | undefined;
    }
  | undefined;

export type AuthRequestParams<S, SUser extends SessionUser> = {
  db: DB;
  dbo: DBOFullyTyped<S>;
  getUser: () => Promise<AuthResult<SUser>>;
};

export type Auth<S = void, SUser extends SessionUser = SessionUser> = {
  /**
   * Name of the cookie or socket hadnshake query param that represents the session id.
   * Defaults to "session_id"
   */
  sidKeyName?: string;

  /**
   * undefined sid is allowed to enable public users
   */
  getUser: (
    sid: string | undefined,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: AuthClientRequest & LoginClientInfo
  ) => Awaitable<AuthResult<SUser>>;

  /**
   * Will setup auth routes
   *  /login
   *  /logout
   *  /magic-link/:id
   */
  expressConfig?: ExpressConfig<S, SUser>;

  login?: (
    params: LoginParams,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo
  ) => Awaitable<LoginResponse>;
  logout?: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<any>;

  /**
   * Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
   */
  responseThrottle?: number;

  /**
   * If provided then session info will be saved on socket.__prglCache and reused from there
   */
  cacheSession?: {
    getSession: (
      sid: string | undefined,
      dbo: DBOFullyTyped<S>,
      db: DB
    ) => Awaitable<BasicSession | undefined>;
  };
};

export type LoginResponse =
  | {
      session: BasicSession;
      response?: AuthResponse.PasswordLoginSuccess | AuthResponse.MagicLinkAuthSuccess;
    }
  | AuthResponse.PasswordLoginFailure["code"]
  | AuthResponse.MagicLinkAuthFailure["code"];

export type LoginParams =
  | ({ type: "username" } & AuthRequest.LoginData)
  | ({ type: "provider" } & AuthProviderUserData);

type ExpressConfig<S, SUser extends SessionUser> = {
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
   * Will attach a app.use listener and will expose getUser
   * Used in UI for blocking access
   */
  use?: ExpressMiddleware<S, SUser>;

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
   * If defined, will enable GET /magic-link/:id route.
   * Requests with valid magic link ids will be logged in and redirected to the returnUrl if set
   */
  onMagicLink?: (
    magicId: string,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo
  ) => Awaitable<
    | { session: BasicSession; response?: AuthResponse.MagicLinkAuthSuccess }
    | { session?: undefined; response: AuthResponse.MagicLinkAuthFailure }
  >;

  registrations?: AuthRegistrationConfig<S>;
};

type ExpressMiddleware<S, SUser extends SessionUser> = (
  args: {
    req: ExpressReq;
    res: ExpressRes;
    next: NextFunction;
  } & AuthRequestParams<S, SUser>
) => void | Promise<void>;
