import { RequestHandler, Response } from "express";
import { AuthResponse } from "prostgles-types";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "./AuthHandler";
import { AuthClientRequest, ExpressReq, ExpressRes, LoginParams } from "./AuthTypes";
import { setAuthProviders, upsertNamedExpressMiddleware } from "./setAuthProviders";
import { getClientRequestIPsInfo } from "./utils/getClientRequestIPsInfo";
import { getReturnUrl } from "./utils/getReturnUrl";
export async function setupAuthRoutes(this: AuthHandler) {
  const { login, expressConfig } = this.opts;

  if (!login) {
    throw "Invalid auth: Provide { sidKeyName: string } ";
  }

  if (this.sidKeyName === "sid") {
    throw "sidKeyName cannot be 'sid' due to collision with socket.io";
  }

  if (!expressConfig) {
    return;
  }
  const { app, publicRoutes = [], onGetRequestOK, onMagicLink, use } = expressConfig;
  if (publicRoutes.find((r) => typeof r !== "string" || !r)) {
    throw "Invalid or empty string provided within publicRoutes ";
  }

  await setAuthProviders.bind(this)(expressConfig);

  if (use) {
    const prostglesUseMiddleware: RequestHandler = (req, res, next) => {
      use({
        req,
        res,
        next,
        getUser: () => this.getUser({ httpReq: req }) as any,
        dbo: this.dbo as DBOFullyTyped,
        db: this.db,
      });
    };
    upsertNamedExpressMiddleware(app, prostglesUseMiddleware, "prostglesUseMiddleware");
  }

  if (onMagicLink) {
    app.get(
      AUTH_ROUTES_AND_PARAMS.magicLinksExpressRoute,
      async (
        req: ExpressReq,
        res: Response<AuthResponse.MagicLinkAuthFailure | AuthResponse.MagicLinkAuthSuccess>
      ) => {
        const { id } = req.params;

        if (typeof id !== "string" || !id) {
          res
            .status(HTTP_FAIL_CODES.BAD_REQUEST)
            .json({ success: false, code: "something-went-wrong", message: "Invalid magic link" });
        } else {
          try {
            const response = await this.throttledFunc(async () => {
              return onMagicLink(
                id,
                this.dbo as any,
                this.db,
                getClientRequestIPsInfo({ httpReq: req })
              );
            });
            if (!response.session) {
              res.status(HTTP_FAIL_CODES.UNAUTHORIZED).json(response.response);
            } else {
              this.setCookieAndGoToReturnURLIFSet(response.session, { req, res });
            }
          } catch (e) {
            res
              .status(HTTP_FAIL_CODES.UNAUTHORIZED)
              .json({ success: false, code: "something-went-wrong" });
          }
        }
      }
    );
  }

  app.post(AUTH_ROUTES_AND_PARAMS.login, async (req: ExpressReq, res: ExpressRes) => {
    try {
      const loginParams: LoginParams = {
        type: "username",
        ...req.body,
      };

      await this.loginThrottledAndSetCookie(req, res, loginParams);
    } catch (error) {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({ error });
    }
  });

  const onLogout = async (req: ExpressReq, res: ExpressRes) => {
    const sid = this.validateSid(req.cookies?.[this.sidKeyName]);
    if (sid) {
      try {
        await this.throttledFunc(() => {
          return this.opts.logout?.(req.cookies?.[this.sidKeyName], this.dbo as any, this.db);
        });
      } catch (err) {
        console.error(err);
      }
    }
    res.redirect("/");
  };

  /* Redirect if not logged in and requesting non public content */
  app.get(AUTH_ROUTES_AND_PARAMS.catchAll, async (req: ExpressReq, res: ExpressRes, next) => {
    const clientReq: AuthClientRequest = { httpReq: req };
    const getUser = this.getUser;
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
        const u = await getUser(clientReq);
        if (!u) {
          res.redirect(
            `${AUTH_ROUTES_AND_PARAMS.login}?returnURL=${encodeURIComponent(req.originalUrl)}`
          );
          return;
        }

        /* If authorized and going to returnUrl then redirect. Otherwise serve file */
      } else if (returnURL && (await getUser(clientReq))) {
        res.redirect(returnURL);
        return;

        /** If Logged in and requesting login then redirect to main page */
      } else if (
        this.matchesRoute(AUTH_ROUTES_AND_PARAMS.login, req.path) &&
        (await getUser(clientReq))
      ) {
        res.redirect("/");
        return;
      }

      onGetRequestOK?.(req, res, {
        getUser: () => getUser(clientReq),
        dbo: this.dbo as DBOFullyTyped,
        db: this.db,
      });
    } catch (error) {
      console.error(error);
      const errorMessage =
        typeof error === "string" ? error
        : error instanceof Error ? error.message
        : "";
      res.status(HTTP_FAIL_CODES.UNAUTHORIZED).json({
        error:
          "Something went wrong when processing your request" +
          (errorMessage ? ": " + errorMessage : ""),
      });
    }
  });
}
