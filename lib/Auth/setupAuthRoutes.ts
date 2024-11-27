import { RequestHandler } from "express";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, getLoginClientInfo, HTTPCODES } from "./AuthHandler";
import { AuthClientRequest, ExpressReq, ExpressRes, LoginParams } from "./AuthTypes";
import { setAuthProviders, upsertNamedExpressMiddleware } from "./setAuthProviders";

export async function setupAuthRoutes(this: AuthHandler) {
  if (!this.opts) return;
 
  const { login, getUser, expressConfig } = this.opts;

  if (!login) {
    throw "Invalid auth: Provide { sidKeyName: string } ";
  }

  if (this.sidKeyName === "sid") {
    throw "sidKeyName cannot be 'sid' due to collision with socket.io";
  }

  if (!getUser) throw "getUser missing from auth config";

  if (!expressConfig) {
    return 
  }
  const { app, publicRoutes = [], onGetRequestOK, magicLinks, use } = expressConfig;
  if (publicRoutes.find(r => typeof r !== "string" || !r)) {
    throw "Invalid or empty string provided within publicRoutes "
  }

  await setAuthProviders.bind(this)(expressConfig);

  if(use){
    const prostglesUseMiddleware: RequestHandler = (req, res, next) => {
      use({ 
        req, 
        res, 
        next, 
        getUser: () => this.getUser({ httpReq: req }) as any,
        dbo: this.dbo as DBOFullyTyped, 
        db: this.db,
      })
    };
    upsertNamedExpressMiddleware(app, prostglesUseMiddleware, "prostglesUseMiddleware");
  }

  if (magicLinks) {
    const { check } = magicLinks;
    if (!check) {
      throw "Check must be defined for magicLinks";
    }

    app.get(AUTH_ROUTES_AND_PARAMS.magicLinksExpressRoute, async (req: ExpressReq, res: ExpressRes) => {
      const { id } = req.params ?? {};

      if (typeof id !== "string" || !id) {
        res.status(HTTPCODES.BAD_REQUEST).json({ msg: "Invalid magic-link id. Expecting a string" });
      } else {
        try {
          const session = await this.throttledFunc(async () => {
            return check(id, this.dbo as any, this.db, getLoginClientInfo({ httpReq: req }));
          });
          if (!session) {
            res.status(HTTPCODES.AUTH_ERROR).json({ msg: "Invalid magic-link" });
          } else {
            this.setCookieAndGoToReturnURLIFSet(session, { req, res });
          }

        } catch (e) {
          res.status(HTTPCODES.AUTH_ERROR).json({ msg: e });
        }
      }
    });
  }

  app.post(AUTH_ROUTES_AND_PARAMS.login, async (req: ExpressReq, res: ExpressRes) => {
    try {
      const loginParams: LoginParams = {
        type: "username",
        ...req.body,
      };

      await this.loginThrottledAndSetCookie(req, res, loginParams);
    } catch (err) {
      console.log(err)
      res.status(HTTPCODES.AUTH_ERROR).json({ err });
    }

  });

  const onLogout = async (req: ExpressReq, res: ExpressRes) => {
    const sid = this.validateSid(req?.cookies?.[this.sidKeyName]);
    if (sid) {
      try {
        await this.throttledFunc(() => {
          return this.opts?.logout?.(req?.cookies?.[this.sidKeyName], this.dbo as any, this.db);
        })
      } catch (err) {
        console.error(err);
      }
    }
    res.redirect("/")
  }
  
  /* Redirect if not logged in and requesting non public content */
  app.get(AUTH_ROUTES_AND_PARAMS.catchAll, async (req: ExpressReq, res: ExpressRes, next) => {

    const clientReq: AuthClientRequest = { httpReq: req };
    const getUser = this.getUser;
    if(this.prostgles.restApi){
      if(Object.values(this.prostgles.restApi.routes).some(restRoute => this.matchesRoute(restRoute.split("/:")[0], req.path))){
        next();
        return;
      }
    }
    try {
      const returnURL = this.getReturnUrl(req);
      
      if(this.matchesRoute(AUTH_ROUTES_AND_PARAMS.logoutGetPath, req.path)){
        await onLogout(req, res);
        return;
      }

      if(this.matchesRoute(AUTH_ROUTES_AND_PARAMS.loginWithProvider, req.path)){
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
          res.redirect(`${AUTH_ROUTES_AND_PARAMS.login}?returnURL=${encodeURIComponent(req.originalUrl)}`);
          return;
        }

        /* If authorized and going to returnUrl then redirect. Otherwise serve file */
      } else if (returnURL && (await getUser(clientReq))) {

        res.redirect(returnURL);
        return;

        /** If Logged in and requesting login then redirect to main page */
      } else if (this.matchesRoute(AUTH_ROUTES_AND_PARAMS.login, req.path) && (await getUser(clientReq))) {

        res.redirect("/");
        return;
      }

      onGetRequestOK?.(req, res, { getUser: () => getUser(clientReq), dbo: this.dbo as DBOFullyTyped, db: this.db })

    } catch (error) {
      console.error(error);
      const errorMessage = typeof error === "string" ? error : error instanceof Error ? error.message : "";
      res.status(HTTPCODES.AUTH_ERROR).json({ msg: "Something went wrong when processing your request" + (errorMessage? (": " + errorMessage) : "") });
    }

  });
}