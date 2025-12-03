import type e from "express";
import type { RequestHandler } from "express";
import type { ExpressApp } from "../../RestApi";

export const upsertNamedExpressMiddleware = (
  app: e.Express,
  handler: RequestHandler,
  name: string
) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app as ExpressApp, name);
  app.use(handler);
};

export const removeExpressRouteByName = (app: ExpressApp | undefined, name: string) => {
  const routes = app?._router?.stack;
  if (routes) {
    app._router!.stack = routes.filter((route) => {
      if (route.name === name) {
        return false;
      }
      return true;
    });
  }
};
