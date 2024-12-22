import { RequestHandler } from "express";
import { DBOFullyTyped } from "../DBSchemaBuilder";
import { AuthHandler } from "./AuthHandler";
import { setCatchAllRequestHandler } from "./endpoints/setCatchAllRequestHandler";
import { setLoginRequestHandler } from "./endpoints/setLoginRequestHandler";
import { setMagicLinkRequestHandler } from "./endpoints/setMagicLinkRequestHandler";
import { setAuthProviders, upsertNamedExpressMiddleware } from "./setAuthProviders";

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
  const { app, publicRoutes = [], onMagicLink, use } = expressConfig;
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
        getUser: () => this.getUserAndHandleError({ httpReq: req, res }),
        dbo: this.dbo as DBOFullyTyped,
        db: this.db,
      });
    };
    upsertNamedExpressMiddleware(app, prostglesUseMiddleware, "prostglesUseMiddleware");
  }

  if (onMagicLink) {
    setMagicLinkRequestHandler.bind(this)(onMagicLink, app);
  }

  setLoginRequestHandler.bind(this)(app);

  /* Redirect if not logged in and requesting non public content */
  setCatchAllRequestHandler.bind(this)(app);
}
