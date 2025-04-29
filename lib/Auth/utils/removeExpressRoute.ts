import { isDefined } from "prostgles-types";
import type { ExpressApp } from "../../RestApi";
import { matchesRoute } from "../AuthHandler";

export const removeExpressRoute = (
  app: ExpressApp | undefined,
  _routePaths: (string | undefined)[],
  method?: "get" | "post" | "put" | "delete"
) => {
  const routes = app?._router?.stack;
  const routePaths = _routePaths.filter(isDefined);
  if (routes) {
    app._router!.stack = routes.filter((route) => {
      const path = route.route?.path;
      const matchesForRemoval =
        path &&
        routePaths.some((routePath) => matchesRoute(routePath, path)) &&
        (!method || route.route?.methods?.[method]);

      return !matchesForRemoval;
    });
  }
};

let testedApp: ExpressApp | undefined;
export const removeExpressRoutesTest = async (app: ExpressApp) => {
  if (testedApp) return;
  app.get("/removeExpressRoute", (req, res) => {
    res.json({ v: 1 });
  });
  if (!app._router?.stack) {
    throw "removeExpressRoutesTest failed app._router.stack is missing";
  }
  const currentRoutes = app._router.stack.slice(0);
  removeExpressRoute(app, ["/removeExpressRoute"]);
  if (app._router.stack.length !== currentRoutes.length - 1) {
    throw "removeExpressRoutesTest failed app._router.stack length is not correct";
  }
  /** Full test */
  if (process.env.NODE_TEST_CONTEXT && process.env.TEST_TYPE === "server") {
    app.get("/removeExpressRoute", (req, res) => {
      res.json({ v: 2 });
    });
    const r = (await fetch("http://localhost:3001/removeExpressRoute").then((res) =>
      res.json()
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
