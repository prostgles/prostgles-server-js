import { Method, getObjectEntries, isObject } from "prostgles-types";
import { AuthClientRequest, AuthResult, SessionUser } from "../Auth/AuthTypes";
import { PublishFullyTyped } from "../DBSchemaBuilder";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import { ProstglesInitOptions } from "../ProstglesTypes";
import { VoidFunction } from "../SchemaWatch/SchemaWatch";
import { getFileTableRules } from "./getFileTableRules";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getTableRulesWithoutFileTable } from "./getTableRulesWithoutFileTable";
import {
  DboTable,
  DboTableCommand,
  ParsedPublishTable,
  PublishMethods,
  PublishObject,
  PublishParams,
  RULE_TO_METHODS,
  TableRule,
} from "./publishTypesAndUtils";

export class PublishParser {
  publish: ProstglesInitOptions["publish"];
  publishMethods?: PublishMethods<void, SessionUser> | undefined;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB;
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.publish = prostgles.opts.publish;
    this.publishMethods = prostgles.opts.publishMethods;
    this.publishRawSQL = prostgles.opts.publishRawSQL;
    const { dbo, db } = prostgles;
    if (!dbo || !db) throw "INTERNAL ERROR: dbo and/or db missing";
    this.dbo = dbo;
    this.db = db;
  }

  async getPublishParams(
    clientReq: AuthClientRequest,
    clientInfo?: AuthResult
  ): Promise<PublishParams> {
    return {
      ...(clientInfo || (await this.prostgles.authHandler?.getUserFromRequest(clientReq))),
      dbo: this.dbo as any,
      db: this.db,
      clientReq,
      tables: this.prostgles.dboBuilder.tables,
    };
  }

  async getAllowedMethods(
    clientReq: AuthClientRequest,
    userData: AuthResult | undefined
  ): Promise<{ [key: string]: Method }> {
    const methods: { [key: string]: Method } = {};

    const publishParams = await this.getPublishParams(clientReq, userData);
    const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);

    if (_methods && Object.keys(_methods).length) {
      getObjectEntries(_methods).map(([key, method]) => {
        const isFuncLike = (maybeFunc: VoidFunction | Promise<void> | Promise<any>) =>
          typeof maybeFunc === "function" || typeof maybeFunc.then === "function";
        if (
          isFuncLike(method as Extract<Method, Promise<any>>) ||
          // @ts-ignore
          (isObject(method) && isFuncLike(method.run))
        ) {
          methods[key] = _methods[key]!;
        } else {
          throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`;
        }
      });
    }

    return methods;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   */
  async getPublish(
    clientReq: AuthClientRequest,
    clientInfo: AuthResult
  ): Promise<PublishFullyTyped | undefined> {
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
  }: DboTableCommand): Promise<TableRule> {
    const clientInfo = await this.prostgles.authHandler?.getUserFromRequest(clientReq);
    const rules = await this.getValidatedRequestRule({ tableName, command, clientReq }, clientInfo);
    return rules;
  }

  async getValidatedRequestRule(
    { tableName, command, clientReq }: DboTableCommand,
    clientInfo: AuthResult | undefined
  ): Promise<TableRule> {
    if (!command || !tableName) throw "command OR tableName are missing";

    const rtm = RULE_TO_METHODS.find((rtms) => rtms.methods.some((v) => v === command));
    if (!rtm) {
      throw "Invalid command: " + command;
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

    if (tableRule[rtm.rule]) {
      return tableRule;
    } else
      throw {
        stack: ["getValidatedRequestRule()"],
        message: `Invalid or disallowed command: ${tableName}.${command}`,
      };
  }

  async getTableRules(
    args: DboTable,
    clientInfo: AuthResult | undefined
  ): Promise<ParsedPublishTable | undefined> {
    if (this.dbo[args.tableName]?.is_media) {
      const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo);
      const { rules } = await getFileTableRules.bind(this)(
        args.tableName,
        fileTablePublishRules,
        args.clientReq,
        clientInfo
      );
      return rules;
    }

    return await this.getTableRulesWithoutFileTable(args, clientInfo);
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
