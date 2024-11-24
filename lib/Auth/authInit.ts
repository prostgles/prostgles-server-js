import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AuthHandler, getLoginClientInfo, HTTPCODES } from "./AuthHandler";
import { AuthClientRequest, ExpressReq, ExpressRes } from "./AuthTypes";
import { setAuthSignup } from "./setAuthSignup";

export async function authInit(this: AuthHandler) {
  if (!this.opts) return;

  this.opts.sidKeyName = this.opts.sidKeyName || "session_id";
  const { sidKeyName, login, getUser, expressConfig } = this.opts;
  this.sidKeyName = this.opts.sidKeyName;

  if (typeof sidKeyName !== "string" && !login) {
    throw "Invalid auth: Provide { sidKeyName: string } ";
  }
  /**
   * Why ??? Collision with socket.io ???
   */
  if (this.sidKeyName === "sid") throw "sidKeyName cannot be 'sid' please provide another name.";

  if (!getUser) throw "getUser missing from auth config";

  if (expressConfig) {
    const { app, publicRoutes = [], onGetRequestOK, magicLinks, use } = expressConfig;
    if (publicRoutes.find(r => typeof r !== "string" || !r)) {
      throw "Invalid or empty string provided within publicRoutes "
    }

    setAuthSignup(expressConfig);

    if(use){
      app.use((req, res, next) => {
        use({ 
          req, 
          res, 
          next, 
          getUser: () => this.getUser({ httpReq: req }) as any,
          dbo: this.dbo as DBOFullyTyped, 
          db: this.db,
        })
      })
    }

    if (magicLinks && this.routes.magicLinks) {
      const { check } = magicLinks;
      if (!check) throw "Check must be defined for magicLinks";

      app.get(this.routes.magicLinks?.expressRoute, async (req: ExpressReq, res: ExpressRes) => {
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

    const loginRoute = this.routes?.login;
    if (loginRoute) {
      app.post(loginRoute, async (req: ExpressReq, res: ExpressRes) => {
        try {
          const start = Date.now();
          const { sid, expires } = await this.loginThrottled(req.body || {}, getLoginClientInfo({ httpReq: req })) || {};
          await this.prostgles.opts.onLog?.({
            type: "auth",
            command: "login",
            duration: Date.now() - start,
            sid,
            socketId: undefined,
          })
          if (sid) {

            this.setCookieAndGoToReturnURLIFSet({ sid, expires }, { req, res });

          } else {
            throw ("Internal error: no user or session")
          }
        } catch (err) {
          console.log(err)
          res.status(HTTPCODES.AUTH_ERROR).json({ err });
        }

      });

      if (this.routes.logoutGetPath && this.opts.logout) {
        app.get(this.routes.logoutGetPath, async (req: ExpressReq, res: ExpressRes) => {
          const sid = this.validateSid(req?.cookies?.[sidKeyName]);
          if (sid) {
            try {
              await this.throttledFunc(() => {
                return this.opts!.logout!(req?.cookies?.[sidKeyName], this.dbo as any, this.db);
              })
            } catch (err) {
              console.error(err);
            }
          }
          res.redirect("/")
        });
      }

      if (Array.isArray(publicRoutes)) {

        /* Redirect if not logged in and requesting non public content */
        app.get(this.routes.catchAll, async (req: ExpressReq, res: ExpressRes, next) => {
          const clientReq: AuthClientRequest = { httpReq: req }
          const getUser = this.getUser;
          if(this.prostgles.restApi){
            if(Object.values(this.prostgles.restApi.routes).some(restRoute => this.matchesRoute(restRoute.split("/:")[0], req.path))){
              next();
              return;
            }
          }
          try {
            const returnURL = this.getReturnUrl(req);

            /**
             * Requesting a User route
             */
            if (this.isUserRoute(req.path)) {

              /* Check auth. Redirect to login if unauthorized */
              const u = await getUser(clientReq);
              if (!u) {
                res.redirect(`${loginRoute}?returnURL=${encodeURIComponent(req.originalUrl)}`);
                return;
              }

              /* If authorized and going to returnUrl then redirect. Otherwise serve file */
            } else if (returnURL && (await getUser(clientReq))) {

              res.redirect(returnURL);
              return;

              /** If Logged in and requesting login then redirect to main page */
            } else if (this.matchesRoute(loginRoute, req.path) && (await getUser(clientReq))) {

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
    }
  }
}