import { Method, isObject } from "prostgles-types";
import { AuthResult, SessionUser } from "../Auth/AuthTypes";
import { LocalParams } from "../DboBuilder/DboBuilder";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import { VoidFunction } from "../SchemaWatch/SchemaWatch";
import { getFileTableRules } from "./getFileTableRules";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getTableRulesWithoutFileTable } from "./getTableRulesWithoutFileTable";
import { DboTable, DboTableCommand, ParsedPublishTable, PublishMethods, PublishObject, PublishParams, RULE_TO_METHODS, TableRule } from "./publishTypesAndUtils";

export class PublishParser {
  publish: any;
  publishMethods?: PublishMethods<void, SessionUser> | undefined;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB
  prostgles: Prostgles;

  constructor(publish: any, publishMethods: PublishMethods<void, SessionUser> | undefined, publishRawSQL: any, dbo: DBHandlerServer, db: DB, prostgles: Prostgles) {
    this.publish = publish;
    this.publishMethods = publishMethods;
    this.publishRawSQL = publishRawSQL;
    this.dbo = dbo;
    this.db = db;
    this.prostgles = prostgles;

    if (!this.dbo || !this.publish) throw "INTERNAL ERROR: dbo and/or publish missing";
  }

  async getPublishParams(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishParams> {
    if (!this.dbo) throw "dbo missing"
    return {
      ...(clientInfo || await this.prostgles.authHandler?.getClientInfo(localParams)),
      dbo: this.dbo as any,
      db: this.db,
      socket: localParams.socket!,
      tables: this.prostgles.dboBuilder.tables,
    }
  }

  async getAllowedMethods(reqInfo: Pick<LocalParams, "httpReq" | "socket">, userData?: AuthResult): Promise<{ [key: string]: Method; }> {
    const methods: { [key: string]: Method; } = {};

    const publishParams = await this.getPublishParams(reqInfo, userData);
    const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);

    if (_methods && Object.keys(_methods).length) {
      Object.entries(_methods).map(([key, method]) => {
        const isFuncLike = (maybeFunc: VoidFunction | Promise<void>) => (typeof maybeFunc === "function" || maybeFunc && typeof maybeFunc.then === "function");
        //@ts-ignore
        if (method && (isFuncLike(method) || isObject(method) && isFuncLike(method.run))) {
          //@ts-ignore
          methods[key] = _methods[key];
        } else {
          throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`
        }
      });
    }

    return methods;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   * @param socket 
   * @param user 
   */
  async getPublish(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishObject> {
    const publishParams = await this.getPublishParams(localParams, clientInfo)
    const _publish = await applyParamsIfFunc(this.publish, publishParams);

    if (_publish === "*") {
      const publish: PublishObject = {};
      this.prostgles.dboBuilder.tablesOrViews?.map(tov => {
        publish[tov.name] = "*";
      });
      return publish;
    }

    return _publish;
  }
  async getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule> {
    
    const clientInfo = await this.prostgles.authHandler!.getClientInfo(localParams);
    const rules = await this.getValidatedRequestRule({ tableName, command, localParams }, clientInfo);
    return rules;
  }

  async getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo?: AuthResult): Promise<TableRule> {
    if (!this.dbo) throw "INTERNAL ERROR: dbo is missing";

    if (!command || !tableName) throw "command OR tableName are missing";

    const rtm = RULE_TO_METHODS.find(rtms => (rtms.methods as any).includes(command));
    if (!rtm) {
      throw "Invalid command: " + command;
    }

    /* Must be local request -> allow everything */
    if (!localParams || (!localParams.socket && !localParams.httpReq)) {
      return RULE_TO_METHODS.reduce((a, v) => ({
        ...a,
        [v.rule]: v.no_limits
      }), {})
    }

    /* Must be from socket. Must have a publish */
    if (!this.publish) throw "publish is missing";

    /* Get any publish errors for socket */
    const errorInfo = localParams?.socket?.prostgles?.tableSchemaErrors?.[tableName]?.[command];

    if (errorInfo) throw errorInfo.error;

    const table_rule = await this.getTableRules({ tableName, localParams }, clientInfo);
    if (!table_rule) throw { stack: ["getValidatedRequestRule()"], message: "Invalid or disallowed table: " + tableName };


    if (command === "upsert") {
      if (!table_rule.update || !table_rule.insert) {
        throw { stack: ["getValidatedRequestRule()"], message: `Invalid or disallowed command: upsert` };
      }
    }

    if (rtm && table_rule && table_rule[rtm.rule]) {
      return table_rule;
    } else throw { stack: ["getValidatedRequestRule()"], message: `Invalid or disallowed command: ${tableName}.${command}` };
  }

  async getTableRules(args: DboTable, clientInfo?: AuthResult): Promise<ParsedPublishTable | undefined> {

    if(this.dbo[args.tableName]?.is_media){
      const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo)
      const { rules } = await getFileTableRules.bind(this)(args.tableName, fileTablePublishRules, args.localParams, clientInfo);
      return rules;
    }

    return await this.getTableRulesWithoutFileTable(args, clientInfo)
  }

  getTableRulesWithoutFileTable = getTableRulesWithoutFileTable.bind(this);

  /* Prepares schema for client. Only allowed views and commands will be present */
  getSchemaFromPublish = getSchemaFromPublish.bind(this);

}

export * from "./publishTypesAndUtils";

type FunctionWithArguments = (...args: any) => any
function applyParamsIfFunc<T>(maybeFunc: T, ...params: any): T extends FunctionWithArguments ? ReturnType<T> : T {
  if (
    (maybeFunc !== null && maybeFunc !== undefined) &&
    //@ts-ignore
    (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")
  ) {
    return (maybeFunc as FunctionWithArguments)(...params);
  }

  //@ts-ignore
  return maybeFunc;
}
