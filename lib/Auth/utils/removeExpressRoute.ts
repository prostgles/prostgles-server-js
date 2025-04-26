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
      if (
        routePaths.some((routePath) => matchesRoute(path, routePath)) &&
        (!method || route.route?.methods?.[method])
      ) {
        return false;
      }
      return true;
    });
  }
};

export const removeExpressRoutesTest = async (app: ExpressApp) => {
  app.get("/removeExpressRoute", (req, res) => {
    res.json({ v: 1 });
  });
  removeExpressRoute(app, ["/removeExpressRoute"]);
  app.get("/removeExpressRoute", (req, res) => {
    res.json({ v: 2 });
  });
  const r = (await fetch("http://localhost:3001/removeExpressRoute").then((res) => res.json())) as {
    v: number;
  };
  if (r.v !== 2) {
    throw "removeExpressRoute failed " + JSON.stringify(r);
  }
  removeExpressRoute(app, ["/removeExpressRoute"]);
};
