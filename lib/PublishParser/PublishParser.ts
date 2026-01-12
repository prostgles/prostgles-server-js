import { isObject } from "prostgles-types";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import { getFileTableRules } from "./getFileTableRules";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getTableRulesWithoutFileTable } from "./getTableRulesWithoutFileTable";
import type {
  DboTable,
  DboTableCommand,
  ParsedTableRule,
  PublishParams,
  ServerFunction,
} from "./publishTypesAndUtils";
import {
  RULE_TO_METHODS,
  parsePublishTableRule,
  type PermissionScope,
  type PublishObject,
} from "./publishTypesAndUtils";

export class PublishParser {
  publish: ProstglesInitOptions["publish"];
  functionHandler: { [key: string]: ServerFunction } | undefined;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB;
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.publish = prostgles.opts.publish;
    try {
      this.functionHandler = prostgles.opts.functions?.({
        dbo: prostgles.dbo as DBOFullyTyped,
        db: prostgles.db as DB,
      });
    } catch (e) {
      console.error("Invalid functions:", e);
      throw e;
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.publishRawSQL = prostgles.opts.publishRawSQL;
    const { dbo, db } = prostgles;
    if (!dbo || !db) throw "INTERNAL ERROR: dbo and/or db missing";
    this.dbo = dbo;
    this.db = db;
  }

  async getPublishParams(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined
  ): Promise<PublishParams> {
    const sessionUser =
      clientInfo ?? (await this.prostgles.authHandler?.getSidAndUserFromRequest(clientReq));
    if (sessionUser === "new-session-redirect") {
      throw "new-session-redirect";
    }
    return {
      sid: undefined,
      ...sessionUser,
      dbo: this.dbo as DBOFullyTyped,
      db: this.db,
      clientReq,
      clientInfo: getClientRequestIPsInfo(clientReq),
      tables: this.prostgles.dboBuilder.tables,
      getClientDBHandlers: (scope: PermissionScope | undefined) =>
        getClientHandlers(this.prostgles, clientReq, scope),
    };
  }

  async getAllowedMethods(clientReq: AuthClientRequest, userData: AuthResultWithSID | undefined) {
    if (!this.functionHandler) {
      return;
    }
    const methods: Map<string, ServerFunction> = new Map();

    const publishParams = await this.getPublishParams(clientReq, userData);
    for (const [name, method] of Object.entries(this.functionHandler)) {
      if (await method.isAllowed(publishParams)) {
        methods.set(name, method);
      }
    }
    return methods;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   */
  async getPublishAsObject(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined
  ): Promise<PublishObject | undefined> {
    const publishParams = await this.getPublishParams(clientReq, clientInfo);
    const _publish = await applyParamsIfFunc(this.publish, publishParams);

    if (_publish === "*") {
      const publish: PublishObject = {};
      this.prostgles.dboBuilder.tablesOrViews?.map((tov) => {
        publish[tov.name] = "*";
      });
      return publish;
    }

    return _publish || undefined;
  }

  async getValidatedRequestRuleWusr({
    tableName,
    command,
    clientReq,
  }: DboTableCommand): Promise<ParsedTableRule> {
    const clientInfo =
      clientReq && (await this.prostgles.authHandler?.getSidAndUserFromRequest(clientReq));
    if (clientInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }
    const rules = await this.getValidatedRequestRule(
      { tableName, command, clientReq },
      clientInfo,
      undefined
    );
    return rules;
  }

  async getValidatedRequestRule(
    { tableName, command, clientReq }: DboTableCommand,
    clientInfo: AuthResultWithSID | undefined,
    scope: PermissionScope | undefined
  ): Promise<ParsedTableRule> {
    if (!command || !tableName) throw "command OR tableName are missing";

    const rule = RULE_TO_METHODS.find((rtms) => rtms.methods.some((v) => v === command));
    if (!rule) {
      throw "Invalid command: " + command;
    }

    if (scope) {
      const tableScope = scope.tables;
      if (!tableScope?.[tableName] || !tableScope[tableName]?.[rule.sqlRule]) {
        throw `Invalid or disallowed command: ${tableName}.${command}. The PermissionsScope does not allow this command.`;
      }
    }

    /* Must be local request -> allow everything */
    if (!clientReq) {
      return RULE_TO_METHODS.reduce(
        (a, v) => ({
          ...a,
          [v.rule]: v.no_limits,
        }),
        {}
      );
    }

    /* Must be from socket. Must have a publish */
    if (!this.publish) throw "publish is missing";

    /* Get any publish errors for socket */
    const errorInfo = clientReq.socket?.prostgles?.tableSchemaErrors[tableName]?.[command];

    if (errorInfo) throw errorInfo.error;

    const tableRule = await this.getTableRules({ tableName, clientReq }, clientInfo);
    if (!tableRule)
      throw {
        stack: ["getValidatedRequestRule()"],
        message: "Invalid or disallowed table: " + tableName,
      };

    if (command === "upsert") {
      if (!tableRule.update || !tableRule.insert) {
        throw {
          stack: ["getValidatedRequestRule()"],
          message: `Invalid or disallowed command: upsert`,
        };
      }
    }

    if (!tableRule[rule.rule]) {
      throw {
        stack: ["getValidatedRequestRule()"],
        message: `Invalid or disallowed command: ${tableName}.${command}`,
      };
    }

    return tableRule;
  }

  async getTableRules(
    args: DboTable,
    clientInfo: AuthResultWithSID | undefined
  ): Promise<ParsedTableRule | undefined> {
    const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo);
    if (this.dbo[args.tableName]?.is_media) {
      const { rules: fileTableRules } = await getFileTableRules.bind(this)(
        args.tableName,
        fileTablePublishRules,
        args.clientReq,
        clientInfo
      );
      return parsePublishTableRule(fileTableRules);
    }

    return parsePublishTableRule(fileTablePublishRules);
  }

  getTableRulesWithoutFileTable = getTableRulesWithoutFileTable.bind(this);

  /* Prepares schema for client. Only allowed views and commands will be present */
  getSchemaFromPublish = getSchemaFromPublish.bind(this);
}

export * from "./publishTypesAndUtils";

type FunctionWithArguments = (...args: any) => any;
function applyParamsIfFunc<T>(
  maybeFunc: T,
  ...params: any
): T extends FunctionWithArguments ? ReturnType<T> : T {
  if (
    maybeFunc !== null &&
    maybeFunc !== undefined &&
    //@ts-ignore
    (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")
  ) {
    return (maybeFunc as FunctionWithArguments)(...params);
  }

  //@ts-ignore
  return maybeFunc;
}

export const getV2Methods = (functions: ProstglesInitOptions["functions"]) => {
  if (typeof functions !== "function" && isObject(functions)) {
    return functions;
  }
};
