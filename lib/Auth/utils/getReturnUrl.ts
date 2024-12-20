import { AUTH_ROUTES_AND_PARAMS } from "../AuthHandler";
import { ExpressReq } from "../AuthTypes";
import { getSafeReturnURL } from "./getSafeReturnURL";

export const getReturnUrl = (req: ExpressReq) => {
  const { returnUrlParamName } = AUTH_ROUTES_AND_PARAMS;
  if (req.query[returnUrlParamName]) {
    const returnURL = decodeURIComponent(req.query[returnUrlParamName] as string);

    return getSafeReturnURL(returnURL, returnUrlParamName);
  }
  return null;
};
