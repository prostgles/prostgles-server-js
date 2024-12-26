import type e from "express";
import { RequestHandler } from "express";
import { removeExpressRouteByName } from "../../FileManager/FileManager";

export const upsertNamedExpressMiddleware = (
  app: e.Express,
  handler: RequestHandler,
  name: string
) => {
  const funcName = name;
  Object.defineProperty(handler, "name", { value: funcName });
  removeExpressRouteByName(app, name);
  app.use(handler);
};
