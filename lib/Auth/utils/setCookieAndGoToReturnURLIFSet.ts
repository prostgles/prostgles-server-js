import { AUTH_RETURN_URL_PARAM_NAME, HTTP_FAIL_CODES, type AuthHandler } from "../AuthHandler";
import type { ExpressReq } from "../AuthTypes";
import type { LoginResponseHandler } from "../endpoints/setLoginRequestHandler";
import { getBasicSessionErrorCode } from "../login";
import { getSafeReturnUrlFromQuery } from "./getSafeReturnUrlFromQuery";
import { getSafeReturnURL } from "./getSafeReturnURL";
import { matchesRoute } from "./matchesRoute";

export function validateSessionAndSetCookie(
  this: AuthHandler,
  cookie: { sid: string; expires: number },
  requestHandler: { req: ExpressReq; res: LoginResponseHandler },
) {
  const sessionErrorCode = getBasicSessionErrorCode(cookie);
  if (sessionErrorCode) {
    const { res } = requestHandler;
    return res.status(HTTP_FAIL_CODES.UNAUTHORIZED).json({
      success: false,
      code: sessionErrorCode,
    });
  }
  return this.setCookieAndGoToReturnURLIFSet(cookie, requestHandler);
}

export function setCookieAndGoToReturnURLIFSet(
  this: AuthHandler,
  cookie: { sid: string; expires: number },
  requestHandler: { req: ExpressReq; res: LoginResponseHandler },
) {
  const { sid, expires } = cookie;
  const { res, req } = requestHandler;
  if (!sid) {
    throw new Error("sid missing");
  }

  const maxAgeOneDay = 60 * 60 * 24; // 24 hours;
  type CookieExpirationOptions = { maxAge: number } | { expires: Date };
  let cookieDuration: CookieExpirationOptions = {
    maxAge: maxAgeOneDay,
  };

  if (expires && Number.isFinite(expires) && !isNaN(+new Date(expires))) {
    cookieDuration = { expires: new Date(expires) };
    const days = (+cookieDuration.expires - Date.now()) / (24 * 60 * 60e3);
    if (days >= 400) {
      console.warn(`Cookie expiration is higher than the Chrome 400 day limit: ${days}days`);
    }
  }

  const cookieOpts = {
    ...cookieDuration,
    // The cookie only accessible by the web server
    httpOnly: true,
    //signed: true
    secure: true,
    sameSite: "strict",
    ...(this.opts.loginSignupConfig?.cookieOptions ?? {}),
  } as const;
  const cookieData = sid;

  res.cookie(this.sidKeyName, cookieData, cookieOpts);
  const safeReturnUrl = getSafeReturnUrlFromQuery(req);
  if (safeReturnUrl) {
    return res.redirect(safeReturnUrl);
  }
  const safeOriginalUrl = getSafeReturnURL(req.originalUrl, AUTH_RETURN_URL_PARAM_NAME);
  if (safeOriginalUrl && !matchesRoute(this.authRoutes.magicLinks, safeOriginalUrl)) {
    return res.redirect(safeOriginalUrl);
  }
  return res.redirect("/");
}
