import { Express, NextFunction, Request, Response } from "express";
import { AnyObject, FieldFilter, IdentityProvider, UserLike } from "prostgles-types";
import { DB } from "../Prostgles";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import type { AuthenticateOptions } from "passport";
import type {
  StrategyOptions as GoogleStrategy,
  Profile as GoogleProfile,
} from "passport-google-oauth20";
import type { StrategyOptions as GitHubStrategy, Profile as GitHubProfile } from "passport-github2";
import type { MicrosoftStrategyOptions } from "passport-microsoft";
import type {
  StrategyOptions as FacebookStrategy,
  Profile as FacebookProfile,
} from "passport-facebook";
import Mail from "nodemailer/lib/mailer";

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

type EmailProvider =
  | {
      signupType: "withMagicLink";
      onRegistered: (data: { username: string }) => void | Promise<void>;
      emailMagicLink: {
        onSend: (data: {
          email: string;
          magicLinkPath: string;
          clientInfo: LoginClientInfo;
          req: ExpressReq;
        }) => EmailWithoutTo | Promise<EmailWithoutTo>;
        smtp: SMTPConfig;
      };
    }
  | {
      signupType: "withPassword";
      onRegistered: (
        data: { username: string; password: string },
        clientInfo: LoginClientInfo
      ) => void | Promise<void>;
      /**
       * Defaults to 8
       */
      minPasswordLength?: number;
      /**
       * If provided, the user will be required to confirm their email address
       */
      emailConfirmation?: {
        /**
         * Called when the user has registered
         */
        onSend: (data: {
          email: string;
          confirmationUrlPath: string;
          clientInfo: LoginClientInfo;
          req: ExpressReq;
        }) => EmailWithoutTo | Promise<EmailWithoutTo>;
        smtp: SMTPConfig;
        /**
         * Called after the user has clicked the URL to confirm their email address
         */
        onConfirmed: (data: {
          confirmationCode: string;
          clientInfo: LoginClientInfo;
          req: ExpressReq;
        }) => void | Promise<void>;
      };
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
      sid?: string;
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
   * Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
   */
  responseThrottle?: number;

  /**
   * Will setup auth routes
   *  /login
   *  /logout
   *  /magic-link/:id
   */
  expressConfig?: ExpressConfig<S, SUser>;

  /**
   * undefined sid is allowed to enable public users
   */
  getUser: (
    sid: string | undefined,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: AuthClientRequest & LoginClientInfo
  ) => Awaitable<AuthResult<SUser>>;

  login?: (
    params: LoginParams,
    dbo: DBOFullyTyped<S>,
    db: DB,
    client: LoginClientInfo
  ) => Awaitable<BasicSession> | BasicSession;
  logout?: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<any>;

  /**
   * If provided then session info will be saved on socket.__prglCache and reused from there
   */
  cacheSession?: {
    getSession: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession>;
  };
};

export type LoginParams =
  | { type: "username"; username: string; password: string; [key: string]: any }
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
  onGetRequestOK?: (req: ExpressReq, res: ExpressRes, params: AuthRequestParams<S, SUser>) => any;

  /**
   * If defined, will check the magic link id and log in the user and redirect to the returnUrl if set
   */
  magicLinks?: {
    /**
     * Used in creating a session/logging in using a magic link
     */
    check: (
      magicId: string,
      dbo: DBOFullyTyped<S>,
      db: DB,
      client: LoginClientInfo
    ) => Awaitable<BasicSession | undefined>;
  };

  registrations?: AuthRegistrationConfig<S>;
};

type ExpressMiddleware<S, SUser extends SessionUser> = (
  args: {
    req: ExpressReq;
    res: ExpressRes;
    next: NextFunction;
  } & AuthRequestParams<S, SUser>
) => void | Promise<void>;
