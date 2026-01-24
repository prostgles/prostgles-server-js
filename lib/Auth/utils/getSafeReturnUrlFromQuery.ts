import { AUTH_RETURN_URL_PARAM_NAME } from "../AuthHandler";
import type { ExpressReq } from "../AuthTypes";
import { getSafeReturnURL } from "./getSafeReturnURL";

export const getSafeReturnUrlFromQuery = (req: ExpressReq) => {
  if (req.query[AUTH_RETURN_URL_PARAM_NAME]) {
    const returnURL = decodeURIComponent(req.query[AUTH_RETURN_URL_PARAM_NAME] as string);

    return getSafeReturnURL(returnURL, AUTH_RETURN_URL_PARAM_NAME);
  }
  return null;
};
