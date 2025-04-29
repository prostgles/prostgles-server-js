import { includes } from "prostgles-types";
import {
  AUTH_ROUTES_AND_PARAMS,
  HTTP_FAIL_CODES,
  matchesRoute,
  type AuthHandler,
} from "../AuthHandler";
import type { ExpressReq } from "../AuthTypes";
import type { LoginResponseHandler } from "../endpoints/setLoginRequestHandler";
import { getBasicSessionErrorCode } from "../login";
import { getReturnUrl } from "./getReturnUrl";
import { getSafeReturnURL } from "./getSafeReturnURL";

export function validateSessionAndSetCookie(
  this: AuthHandler,
  cookie: { sid: string; expires: number },
  requestHandler: { req: ExpressReq; res: LoginResponseHandler }
) {
  const sessionErrorCode = getBasicSessionErrorCode(cookie);
  if (sessionErrorCode) {
    const { res } = requestHandler;
    res.status(HTTP_FAIL_CODES.UNAUTHORIZED).json({
      success: false,
      code: sessionErrorCode,
    });
    return;
  }
  return this.setCookieAndGoToReturnURLIFSet(cookie, requestHandler);
}

export function setCookieAndGoToReturnURLIFSet(
  this: AuthHandler,
  cookie: { sid: string; expires: number },
  requestHandler: { req: ExpressReq; res: LoginResponseHandler }
) {
  const { sid, expires } = cookie;
  const { res, req } = requestHandler;
  if (!sid) {
    throw "no sid";
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
    sameSite: "strict" as const,
    ...(this.opts.loginSignupConfig?.cookieOptions ?? {}),
  };
  const cookieData = sid;
  res.cookie(this.sidKeyName, cookieData, cookieOpts);
  const safeReturnUrl = getReturnUrl(req);
  if (safeReturnUrl) {
    return res.redirect(safeReturnUrl);
  }
  const safeOriginalUrl = getSafeReturnURL(
    req.originalUrl,
    AUTH_ROUTES_AND_PARAMS.returnUrlParamName
  );
  if (
    safeOriginalUrl &&
    ![AUTH_ROUTES_AND_PARAMS.magicLinks].some((authRoute) =>
      matchesRoute(authRoute, safeOriginalUrl)
    )
  ) {
    return res.redirect(safeOriginalUrl);
  }
  return res.redirect("/");
}
