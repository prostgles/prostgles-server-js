import e, { RequestHandler, Request, Response } from "express";
import { AuthClientRequest } from "../AuthTypes";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { getReturnUrl } from "../utils/getReturnUrl";
import { DBOFullyTyped } from "../../DBSchemaBuilder";
import { throttledReject } from "../utils/throttledReject";

export function setCatchAllRequestHandler(this: AuthHandler, app: e.Express) {
  const onLogout = async (req: Request, res: Response) => {
    const sid = this.validateSid(req.cookies?.[this.sidKeyName]);
    if (sid) {
      try {
        await throttledReject(async () => {
          return this.opts.loginSignupConfig?.logout(
            req.cookies?.[this.sidKeyName],
            this.dbo as DBOFullyTyped,
            this.db
          );
        });
      } catch (err) {
        console.error(err);
      }
    }
    res.redirect("/");
  };

  const requestHandler: RequestHandler = async (req, res, next) => {
    const { onGetRequestOK } = this.opts.loginSignupConfig ?? {};
    const clientReq: AuthClientRequest = { httpReq: req, res };
    const getUser = async () => {
      return this.getUserAndHandleError(clientReq);
    };
    const isLoggedInUser = async () => {
      const userInfo = await getUser();
      return !!userInfo.user;
    };
    if (this.prostgles.restApi) {
      if (
        Object.values(this.prostgles.restApi.routes).some((restRoute) =>
          this.matchesRoute(restRoute.split("/:")[0], req.path)
        )
      ) {
        next();
        return;
      }
    }
    try {
      const returnURL = getReturnUrl(req);

      if (this.matchesRoute(AUTH_ROUTES_AND_PARAMS.logoutGetPath, req.path)) {
        await onLogout(req, res);
        return;
      }

      if (this.matchesRoute(AUTH_ROUTES_AND_PARAMS.loginWithProvider, req.path)) {
        next();
        return;
      }
      /**
       * Requesting a User route
       */
      if (this.isUserRoute(req.path)) {
        /* Check auth. Redirect to login if unauthorized */
        const u = await isLoggedInUser();
        if (!u) {
          res.redirect(
            `${AUTH_ROUTES_AND_PARAMS.login}?returnURL=${encodeURIComponent(req.originalUrl)}`
          );
          return;
        }

        /* If authorized and going to returnUrl then redirect. Otherwise serve file */
      } else if (returnURL && (await isLoggedInUser())) {
        res.redirect(returnURL);
        return;

        /** If Logged in and requesting login then redirect to main page */
      } else if (this.matchesRoute(AUTH_ROUTES_AND_PARAMS.login, req.path)) {
        const { user, isAnonymous } = await getUser();
        if (user && !isAnonymous) {
          res.redirect("/");
          return;
        }
      }

      onGetRequestOK?.(req, res, {
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
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({
        error:
          "Something went wrong when processing your request" +
          (errorMessage ? ": " + errorMessage : ""),
      });
    }
  };

  app.get(AUTH_ROUTES_AND_PARAMS.catchAll, requestHandler);
}
