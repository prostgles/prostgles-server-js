import * as bodyParser from "body-parser";
import { Express } from "express";
import { HTTP_FAIL_CODES } from "./Auth/AuthHandler";
import { ExpressReq, ExpressRes } from "./Auth/AuthTypes";
import { getSerializedClientErrorFromPGError } from "./DboBuilder/DboBuilder";
import { Prostgles } from "./Prostgles";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "./runClientRequest";
import { VoidFunction } from "./SchemaWatch/SchemaWatch";
const jsonParser = bodyParser.json();

export type ExpressApp = {
  _router?: {
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
} & Omit<Express, "_router">;

export type RestApiConfig = {
  /**
   * Express server instance
   */
  expressApp: Express;

  /**
   * Defaults to "/api"
   */
  routePrefix: string;
};

export class RestApi {
  prostgles: Prostgles;
  routes: {
    db: string;
    sql: string;
    methods: string;
    schema: string;
  };
  expressApp: Express;
  constructor({ expressApp, routePrefix, prostgles }: RestApiConfig & { prostgles: Prostgles }) {
    this.prostgles = prostgles;
    this.routes = {
      db: `${routePrefix}/db/:tableName/:command`,
      sql: `${routePrefix}/db/sql`,
      methods: `${routePrefix}/methods/:method`,
      schema: `${routePrefix}/schema`,
    };
    this.expressApp = expressApp;
    expressApp.post(this.routes.db, jsonParser, this.onPostTableCommand);
    expressApp.post(this.routes.sql, jsonParser, this.onPostSql);
    expressApp.post(this.routes.methods, jsonParser, this.onPostMethod);
    expressApp.post(this.routes.schema, jsonParser, this.onPostSchema);
  }

  destroy = () => {
    this.expressApp.removeListener(this.routes.db, this.onPostTableCommand);
    this.expressApp.removeListener(this.routes.sql, this.onPostSql);
    this.expressApp.removeListener(this.routes.methods, this.onPostMethod);
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
      const data = await this.prostgles.getClientSchema({ httpReq: req, res });
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
        }
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
