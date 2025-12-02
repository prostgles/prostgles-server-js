import { Express } from "express";
import { HTTP_FAIL_CODES, removeExpressRoute } from "./Auth/AuthHandler";
import { ExpressReq, ExpressRes } from "./Auth/AuthTypes";
import { getSerializedClientErrorFromPGError } from "./DboBuilder/DboBuilder";
import { Prostgles } from "./Prostgles";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "./runClientRequest";
import { VoidFunction } from "./SchemaWatch/SchemaWatch";
import { isDefined } from "prostgles-types";

type ExpressInternalRouter = {
  stack?: {
    name: string;
    handle: VoidFunction;
    path: undefined;
    keys?: any[];
    route?: {
      path?: string;
      methods?: {
        get?: boolean;
        post?: boolean;
        put?: boolean;
        delete?: boolean;
      };
    };
  }[];
};

export type ExpressApp = {
  _router?: ExpressInternalRouter;
  router?: ExpressInternalRouter;
} & Omit<Express, "_router" | "router">;

export type RestApiConfig = {
  /**
   * Express server instance
   */
  expressApp: Express;

  /**
   * Defaults to "/api"
   */
  path?: string;
};

export class RestApi {
  prostgles: Prostgles;
  routes: {
    db: string;
    sql: string;
    methods: string;
    schema: string;
  };
  expressApp: ExpressApp;
  path = "/api";
  constructor({ expressApp, path, prostgles }: RestApiConfig & { prostgles: Prostgles }) {
    if (isDefined(path) && !path.trim()) {
      throw new Error("path cannot be empty");
    }
    this.path = path || "/api";
    this.prostgles = prostgles;
    this.routes = {
      db: `${path}/db/:tableName/:command`,
      sql: `${path}/db/sql`,
      methods: `${path}/methods/:method`,
      schema: `${path}/schema`,
    };
    this.expressApp = expressApp as ExpressApp;
    /** Must check if json parser is loaded */

    expressApp.post(this.routes.db, this.onPostTableCommand);
    expressApp.post(this.routes.sql, this.onPostSql);
    expressApp.post(this.routes.methods, this.onPostMethod);
    expressApp.post(this.routes.schema, this.onPostSchema);
  }

  destroy = () => {
    this.expressApp.removeListener(this.routes.db, this.onPostTableCommand);
    this.expressApp.removeListener(this.routes.sql, this.onPostSql);
    this.expressApp.removeListener(this.routes.methods, this.onPostMethod);
    removeExpressRoute(this.expressApp, [this.path]);
  };
  onPostMethod = async (req: ExpressReq, res: ExpressRes) => {
    const { method = "" } = req.params;
    const params = req.body || [];

    try {
      const data = await runClientMethod.bind(this.prostgles)(
        {
          method,
          params,
        },
        {
          res,
          httpReq: req,
        }
      );
      res.json(data);
    } catch (rawError) {
      const error = getSerializedClientErrorFromPGError(rawError, {
        type: "method",
        localParams: { clientReq: { httpReq: req, res } },
      });
      res.status(400).json({ error });
    }
  };
  onPostSchema = async (req: ExpressReq, res: ExpressRes) => {
    try {
      const data = await this.prostgles.getClientSchema({ httpReq: req, res }, undefined);
      res.json(data);
    } catch (rawError) {
      const error = getSerializedClientErrorFromPGError(rawError, {
        type: "method",
        localParams: { clientReq: { httpReq: req, res } },
      });
      res.status(400).json({ error });
    }
  };
  onPostSql = async (req: ExpressReq, res: ExpressRes) => {
    const [query, params, options] = req.body || [];
    try {
      const data = await runClientSqlRequest.bind(this.prostgles)(
        {
          query,
          params,
          options,
        },
        {
          res,
          httpReq: req,
        }
      );
      res.json(data);
    } catch (rawError) {
      const error = getSerializedClientErrorFromPGError(rawError, {
        type: "sql",
        localParams: { clientReq: { httpReq: req, res } },
      });
      res.status(400).json({ error });
    }
  };

  onPostTableCommand = async (req: ExpressReq, res: ExpressRes) => {
    const { params } = req;
    const { tableName, command } = params;
    if (!tableName || typeof tableName !== "string") {
      res.status(400).json({ error: "tableName missing" });
      return;
    }
    if (!command || typeof command !== "string") {
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).json({ error: "command missing" });
      return;
    }

    try {
      const [param1, param2, param3] = req.body || [];
      const data = await runClientRequest.bind(this.prostgles)(
        {
          tableName,
          command,
          param1,
          param2,
          param3,
        },
        {
          httpReq: req,
          res,
        },
        undefined
      );
      res.json(data);
    } catch (rawError) {
      const error = getSerializedClientErrorFromPGError(rawError, {
        type: "tableMethod",
        localParams: { clientReq: { httpReq: req, res } },
        view: this.prostgles.dboBuilder.dbo[tableName],
      });
      res.status(400).json({ error });
    }
  };
}
