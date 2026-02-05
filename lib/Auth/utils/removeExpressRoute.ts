import { isDefined } from "prostgles-types";
import type { ExpressApp } from "../../RestApi";
import type { Express } from "express";
import { matchesRoute } from "./matchesRoute";

export const getRouter = (app: ExpressApp | Express) => {
  const router = (app._router || app.router) as ExpressApp["_router"] | undefined;
  if (typeof router === "string") {
    throw new Error("app.router is a string");
  }
  const stack = router?.stack;

  if (!stack) {
    throw new Error("app._router or app.router is missing");
  }
  return {
    getStack: () => {
      const { stack } = router;
      if (!stack) {
        throw new Error("app._router.stack or app.router.stack is missing");
      }
      return stack;
    },
    router,
  };
};

export const removeExpressRoute = (
  app: ExpressApp | Express | undefined,
  _routePaths: (string | undefined)[],
  method?: "get" | "post" | "put" | "delete",
) => {
  if (!app) return;
  const routePaths = _routePaths.filter(isDefined);
  const { router, getStack } = getRouter(app);
  const newRoutes = getStack().filter((route) => {
    const path = route.route?.path;
    const matchesForRemoval =
      path &&
      routePaths.some((routePath) => matchesRoute(routePath, path)) &&
      (!method || route.route?.methods?.[method]);

    return !matchesForRemoval;
  });
  router.stack = newRoutes;
};

let testedApp: ExpressApp | Express | undefined;
export const removeExpressRoutesTest = async (app: ExpressApp | Express) => {
  if (testedApp) return;
  app.get("/removeExpressRoute", (req, res) => {
    res.json({ v: 1 });
  });
  const { getStack } = getRouter(app);
  const currentRoutes = getStack().slice(0);
  removeExpressRoute(app, ["/removeExpressRoute"]);
  if (getStack().length !== currentRoutes.length - 1) {
    throw "removeExpressRoutesTest failed app._router.stack length is not correct";
  }
  /** Full test */
  if (process.env.NODE_TEST_CONTEXT && process.env.TEST_TYPE === "server") {
    app.get("/removeExpressRoute", (req, res) => {
      res.json({ v: 2 });
    });
    const r = (await fetch("http://localhost:3001/removeExpressRoute").then((res) =>
      res.json(),
    )) as {
      v: number;
    };
    if (r.v !== 2) {
      throw "removeExpressRoute failed " + JSON.stringify(r);
    }
    removeExpressRoute(app, ["/removeExpressRoute"]);
  }
  testedApp = app;
};
