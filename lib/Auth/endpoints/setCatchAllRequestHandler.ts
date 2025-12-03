import type e from "express";
import type { RequestHandler } from "express";
import { isDefined } from "prostgles-types";
import type { DBOFullyTyped } from "../../DBSchemaBuilder/DBSchemaBuilder";
import type { AuthHandler } from "../AuthHandler";
import { AUTH_ROUTES_AND_PARAMS, HTTP_FAIL_CODES } from "../AuthHandler";
import type { AuthClientRequest } from "../AuthTypes";
import { getReturnUrl } from "../utils/getReturnUrl";
import { matchesRoute } from "../utils/matchesRoute";

export function setCatchAllRequestHandler(this: AuthHandler, app: e.Express) {
  const requestHandlerCatchAll: RequestHandler = async (req, res, next) => {
    const { onGetRequestOK } = this.opts.loginSignupConfig ?? {};
    const { restApi, fileManager, authHandler } = this.prostgles;
    const pathsHandledByProstgles = [
      restApi?.path,
      fileManager?.path,
      authHandler && AUTH_ROUTES_AND_PARAMS.loginWithProvider,
    ].filter(isDefined);
    if (pathsHandledByProstgles.some((path) => matchesRoute(path, req.path))) {
      next();
      return;
    }
    let newSessionRedirect = false as boolean;
    try {
      const clientReq: AuthClientRequest = { httpReq: req, res };
      const getUser = async () => {
        const res = await this.getUserOrError(clientReq);
        if (res === "new-session-redirect") {
          newSessionRedirect = true;
          throw "new-session-redirect";
        }
        return res;
      };
      const isLoggedInUser = async () => {
        const userInfo = await getUser();
        return !!userInfo.user;
      };
      const returnURL = getReturnUrl(req);

      /**
       * Requesting a User route (must be logged in)
       */
      if (this.isUserRoute(req.path)) {
        /* Check auth. Redirect to login if unauthorized */
        const isLoggedIn = await isLoggedInUser();
        if (!isLoggedIn) {
          res.redirect(
            `${AUTH_ROUTES_AND_PARAMS.login}?returnURL=${encodeURIComponent(req.originalUrl)}`
          );
          return;
        }

        /**
         * If authorized and going to returnUrl then redirect. Otherwise serve file
         * */
      } else if (returnURL && (await isLoggedInUser())) {
        res.redirect(returnURL);
        return;

        /**
         * Visiting login:
         * 1) If logged in and not anonymous then redirect to main page
         * 2) If logged in and anonymous then allow visiting /login (it will be caught earlier by new-session-redirect)
         * */
      } else if (matchesRoute(AUTH_ROUTES_AND_PARAMS.login, req.path)) {
        const { user, isAnonymous, error } = await getUser();
        if (error) {
          res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(error);
          return;
        }
        if (user && !isAnonymous) {
          res.redirect("/");
          return;
        }
      }

      await onGetRequestOK?.(req, res, {
        getUser,
        dbo: this.dbo as DBOFullyTyped,
        db: this.db,
      });
    } catch (error) {
      console.error(error);
      const errorMessage =
        typeof error === "string" ? error
        : error instanceof Error ? error.message
        : "";
      if (newSessionRedirect) return;
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
        error:
          "Something went wrong when processing your request" +
          (errorMessage ? ": " + errorMessage : ""),
      });
    }
  };

  app.get(AUTH_ROUTES_AND_PARAMS.catchAll, requestHandlerCatchAll);
}
