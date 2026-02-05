import type e from "express";
import type { RequestHandler } from "express";
import type { AuthHandler } from "../AuthHandler";
import { upsertNamedExpressMiddleware } from "../utils/upsertNamedExpressMiddleware";
import type { GetUserOrRedirected } from "../utils/handleGetUser";

export function setupUserContextMiddleware(this: AuthHandler, app: e.Express) {
  const userContextMiddleware: RequestHandler = (req, _res, next): void => {
    (req as RequestWithUser).getUser = () => {
      return this.getUserOrError({ httpReq: req, res: _res });
    };

    next();
  };
  upsertNamedExpressMiddleware(app, userContextMiddleware, "prostglesUserContextMiddleware");
}

export interface RequestWithUser extends e.Request {
  getUser(): Promise<GetUserOrRedirected>;
}
