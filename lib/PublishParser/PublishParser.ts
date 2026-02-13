import { getKeys, includes, pickKeys } from "prostgles-types";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import type { ServerFunctionDefinition } from "./defineServerFunction";
import { getFileTableRules } from "./getFileTableRules";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getTableRulesWithoutFileTable } from "./getTableRulesWithoutFileTable";
import type {
  DboTable,
  DboTableCommand,
  ParsedTableRule,
  PublishParams,
} from "./publishTypesAndUtils";
import {
  RULE_TO_METHODS,
  parsePublishTableRule,
  type PermissionScope,
  type PublishObject,
} from "./publishTypesAndUtils";

export class PublishParser {
  publish: ProstglesInitOptions["publish"];
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB;
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.publish = prostgles.opts.publish;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.publishRawSQL = prostgles.opts.publishRawSQL;
    const { dbo, db } = prostgles;
    if (!dbo || !db) throw "INTERNAL ERROR: dbo and/or db missing";
    this.dbo = dbo;
    this.db = db;
  }

  async getPublishParams(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined,
  ): Promise<PublishParams> {
    const sessionUser =
      clientInfo ?? (await this.prostgles.authHandler.getSidAndUserFromRequest(clientReq));
    if (sessionUser === "new-session-redirect") {
      throw "new-session-redirect";
    }
    return {
      ...sessionUser,
      dbo: this.dbo as DBOFullyTyped,
      db: this.db,
      sql: this.prostgles.dboBuilder.sql,
      clientReq,
      clientInfo: getClientRequestIPsInfo(clientReq),
      tables: this.prostgles.dboBuilder.tables,
      getClientDBHandlers: (scope: PermissionScope | undefined) =>
        getClientHandlers(this.prostgles, clientReq, scope),
    };
  }

  async getAllowedFunctions(clientReq: AuthClientRequest, userData: AuthResultWithSID | undefined) {
    const publishParams = await this.getPublishParams(clientReq, userData);
    const allowedFunctions = await this.prostgles.opts.functions?.(publishParams);
    if (!allowedFunctions) {
      return;
    }
    const allowedFunctionsMap: Map<string, ServerFunctionDefinition> = new Map();

    for (const [name, method] of Object.entries(allowedFunctions)) {
      if (method.run !== undefined) {
        allowedFunctionsMap.set(name, method);
      }
    }
    return allowedFunctionsMap;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   */
  async getPublishAsObject(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined,
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

  async getValidatedRequestRuleWusr(
    { tableName, command, clientReq }: DboTableCommand,
    scope: PermissionScope | undefined,
  ): Promise<ParsedTableRule> {
    const rules = await this.getParsedTableRule({ tableName, clientReq }, undefined, scope);
    const clientInfo =
      clientReq && (await this.prostgles.authHandler.getSidAndUserFromRequest(clientReq));
    if (clientInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }
    this.validateRequestRule({ tableName, command, clientReq }, rules, scope);
    return rules;
  }

  async getParsedTableRule(
    { tableName, clientReq }: Pick<DboTableCommand, "tableName" | "clientReq">,
    clientInfo: AuthResultWithSID | undefined,
    scope: PermissionScope | undefined,
  ): Promise<ParsedTableRule> {
    if (!tableName) throw "tableName missing";

    /* Must be local request -> allow everything */
    if (!clientReq) {
      return RULE_TO_METHODS.reduce(
        (a, v) => ({
          ...a,
          [v.rule]: v.no_limits,
        }),
        {},
      );
    }

    /* Must be from socket. Must have a publish */
    if (!this.publish) throw "publish is missing";

    const tableErrors = clientReq.socket?.prostgles?.tableSchemaErrors[tableName];
    /* Get any publish errors for socket */
    Object.values(tableErrors ?? {}).forEach((errorInfo) => {
      throw errorInfo.error;
    });

    const tableRule = await this.getTableRules({ tableName, clientReq }, clientInfo, scope);

    if (!tableRule) {
      throw {
        stack: ["getValidatedRequestRule()"],
        message: "Invalid or disallowed table: " + tableName,
      };
    }
    return tableRule;
  }

  validateRequestRule(
    { tableName, command }: DboTableCommand,
    tableRule: ParsedTableRule,
    scope: PermissionScope | undefined,
  ) {
    if (!command || !tableName) throw "command OR tableName are missing";

    const rule = RULE_TO_METHODS.find(({ methods }) => includes(methods, command));
    if (!rule) {
      throw "Invalid command: " + command;
    }

    if (scope) {
      if (scope.sql === "commited") {
        // Allow all commands
      } else if (scope.sql === "rolledback") {
        if (rule.sqlRule === "select") {
          // Allow select
        } else {
          throw `Invalid or disallowed command: ${tableName}.${command}. The PermissionsScope only allows ${scope.sql}`;
        }
      } else {
        const tableScope = scope.tables;
        if (!tableScope?.[tableName] || !tableScope[tableName][rule.sqlRule]) {
          throw `Invalid or disallowed command: ${tableName}.${command}. The PermissionsScope does not allow this command.`;
        }
      }
    }

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
  }

  async getTableRules(
    args: DboTable,
    clientInfo: AuthResultWithSID | undefined,
    scope: PermissionScope | undefined,
  ): Promise<ParsedTableRule | undefined> {
    const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo);
    const applyScopeToTableRules = (tableRules: ParsedTableRule | undefined) => {
      if (!tableRules) return;
      if (!scope || scope.sql === "commited") return tableRules;
      if (scope.sql === "rolledback") {
        return pickKeys(tableRules, ["select"]);
      }
      const tableScope = scope.tables?.[args.tableName];
      if (!tableScope) return;
      return pickKeys(
        tableRules,
        getKeys(tableScope).filter((k) => tableScope[k]),
      );
    };
    if (this.dbo[args.tableName]?.is_media) {
      const { rules: fileTableRules } = await getFileTableRules.bind(this)(
        args.tableName,
        fileTablePublishRules,
        args.clientReq,
        clientInfo,
        scope,
      );
      return applyScopeToTableRules(parsePublishTableRule(fileTableRules));
    }

    return applyScopeToTableRules(parsePublishTableRule(fileTablePublishRules));
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
