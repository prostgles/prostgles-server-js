import type e from "express";
import type { RequestHandler } from "express";
import type { ExpressApp } from "../../RestApi";
import { getRouter } from "./removeExpressRoute";

export const upsertNamedExpressMiddleware = (
  app: e.Express,
  handler: RequestHandler,
  name: string,
) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app as ExpressApp, name);
  app.use(handler);
};

export const removeExpressRouteByName = (app: ExpressApp, name: string) => {
  const { router, getStack } = getRouter(app);
  const newRoutes = getStack().filter((route) => {
    if (route.name === name) {
      return false;
    }
    return true;
  });
  router.stack = newRoutes;
};
