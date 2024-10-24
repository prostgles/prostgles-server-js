import { Prostgles } from "./Prostgles";
import { ExpressReq, ExpressRes, HTTPCODES } from "./AuthHandler";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "./runClientRequest";
import { Express } from "express";
import * as bodyParser from "body-parser";
import { parseError } from "./DboBuilder/DboBuilder";
import { VoidFunction } from "./SchemaWatch/SchemaWatch";
const jsonParser = bodyParser.json();

export type ExpressApp = {
  _router?: { 
    stack?: {
      handle: VoidFunction;
      path: undefined,
      keys?: any[];
      route?: { 
        path?: string;
      }
    }[]
  }
} & Omit<Express, "_router">;

export type RestApiConfig = {
  expressApp: Express;
  routePrefix: string;
};

export class RestApi {
  prostgles: Prostgles;
  routes: { 
    db: string;
    sql: string;
    methods: string;
    schema: string;
  }
  expressApp: Express;
  constructor({ expressApp, routePrefix, prostgles }: RestApiConfig & { prostgles: Prostgles; }){
    this.prostgles = prostgles;
    this.routes = {
      db: `${routePrefix}/db/:tableName/:command`,
      sql: `${routePrefix}/db/sql`,
      methods: `${routePrefix}/methods/:method`,
      schema: `${routePrefix}/schema`,
    };
    this.expressApp = expressApp;
    expressApp.post(this.routes.db, jsonParser, this.onPost);
    expressApp.post(this.routes.sql, jsonParser, this.onPostSql);
    expressApp.post(this.routes.methods, jsonParser, this.onPostMethod);
    expressApp.post(this.routes.schema, jsonParser, this.onPostSchema);
  }

  destroy = () => {
    this.expressApp.removeListener(this.routes.db, this.onPost);
    this.expressApp.removeListener(this.routes.sql, this.onPostSql);
    this.expressApp.removeListener(this.routes.methods, this.onPostMethod);
  }
  onPostMethod = async (req: ExpressReq, res: ExpressRes) => {
    const { method = "" } = req.params;
    const params = req.body || [];

    try { 
      const data = await runClientMethod.bind(this.prostgles)({ 
        type: "http", 
        httpReq: req, method, params
      });
      res.json(data);
    } catch(rawError){
      const error = parseError(rawError, "onPostMethod")
      res.status(400).json({ error });
    }
  }
  onPostSchema = async (req: ExpressReq, res: ExpressRes) => {
    try {
      const data = await this.prostgles.getClientSchema({ httpReq: req });
      res.json(data);
    } catch(rawError){ 
      const error = parseError(rawError, "onPostSchema")
      res.status(400).json({ error });
    }
  }
  onPostSql = async (req: ExpressReq, res: ExpressRes) => {
    const [query, args, options] = req.body || [];
    try {
      const data = await runClientSqlRequest.bind(this.prostgles)({ type: "http", httpReq: req, query, args, options });
      res.json(data);
    } catch(rawError){ 
      const error = parseError(rawError, "onPostSql")
      res.status(400).json({ error });
    }
  }

  onPost = async (req: ExpressReq, res: ExpressRes) => {
    const { params } = req;
    const { tableName, command } = params;
    if(!tableName || typeof tableName !== "string"){
      res.status(400).json({ error: "tableName missing" });
      return;
    }
    if(!command || typeof command !== "string"){
      res.status(HTTPCODES.BAD_REQUEST).json({ error: "command missing" });
      return;
    }

    try {
      const [param1, param2, param3] = req.body || [];
      const data = await runClientRequest.bind(this.prostgles)({ 
        type: "http", 
        httpReq: req, 
        tableName, 
        command, 
        param1, param2, param3
      });
      res.json(data);
    } catch(rawError){
      const error = parseError(rawError, "onPost")
      res.status(400).json({ error });
    }
  }
}