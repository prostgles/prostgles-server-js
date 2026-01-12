import type { Method } from "prostgles-types";
import { getObjectEntries, isObject } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID, SessionUser } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import type { VoidFunction } from "../SchemaWatch/SchemaWatch";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import { getFileTableRules } from "./getFileTableRules";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getTableRulesWithoutFileTable } from "./getTableRulesWithoutFileTable";
import type {
  DboTable,
  DboTableCommand,
  ParsedTableRule,
  PublishMethods,
  PublishParams,
} from "./publishTypesAndUtils";
import {
  RULE_TO_METHODS,
  parsePublishTableRule,
  type PublishMethodsV2,
  type PublishObject,
  type PermissionScope,
} from "./publishTypesAndUtils";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";

export class PublishParser {
  publish: ProstglesInitOptions["publish"];
  publishMethods:
    | PublishMethods<void, SessionUser>
    | PublishMethodsV2<void, SessionUser>
    | undefined;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB;
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.publish = prostgles.opts.publish;
    this.publishMethods = prostgles.opts.publishMethods;
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

  get publishMethodsV2() {
    const { publishMethods } = this;
    return getV2Methods(publishMethods);
  }

  async getAllowedMethods(clientReq: AuthClientRequest, userData: AuthResultWithSID | undefined) {
    const methods: Map<string, Method> = new Map();

    const publishParams = await this.getPublishParams(clientReq, userData);
    const v2Methods = this.publishMethodsV2;
    if (v2Methods) {
      for (const [name, method] of Object.entries(v2Methods)) {
        if (await method.isAllowed(publishParams)) {
          methods.set(name, method);
        }
      }
      return methods;
    }

    const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);
    if (!_methods) return methods;
    getObjectEntries(_methods).map(([key, method]) => {
      if (typeof key !== "string") {
        throw `invalid publishMethods key -> ${String(key)} \n Expecting a string`;
      }
      const isFuncLike = (maybeFunc: VoidFunction | Promise<void> | Promise<any>) =>
        typeof maybeFunc === "function" || typeof maybeFunc.then === "function";
      if (
        isFuncLike(method as Extract<Method, Promise<any>>) ||
        // @ts-ignore
        (isObject(method) && isFuncLike(method.run))
      ) {
        methods.set(key, method);
      } else {
        throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`;
      }
    });

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

export const getV2Methods = (publishMethods: ProstglesInitOptions["publishMethods"]) => {
  if (typeof publishMethods !== "function" && isObject(publishMethods)) {
    return publishMethods;
  }
};
