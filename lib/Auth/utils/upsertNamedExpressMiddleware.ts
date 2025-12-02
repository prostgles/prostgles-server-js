import type e from "express";
import { RequestHandler } from "express";
import { removeExpressRouteByName } from "../../FileManager/FileManager";
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
