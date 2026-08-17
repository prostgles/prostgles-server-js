import { getObjectEntries, includes, SQL_COMMAND_TABLE_METHODS } from "prostgles-types";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import { applyScopeToTableRules } from "./applyScopeToTableRules";
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
    if (!dbo || !db) {
      throw "INTERNAL ERROR: dbo and/or db missing";
    }
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
    const functionGroups = this.prostgles.opts.functions;
    if (!functionGroups || !publishParams.user) {
      return;
    }
    const { findUser } = this.prostgles.opts.auth ?? {};
    if (!findUser) {
      throw new Error(
        "findUser function is missing in auth config. It is required for functions to work.",
      );
    }
    const user = publishParams.user;
    const userId = user.id;
    if (!userId || typeof userId !== "string") {
      throw "User ID is missing or invalid";
    }
    const allowedFunctionsMap = new Map<string, ServerFunctionDefinition>();

    for (const group of Object.values(functionGroups)) {
      const matchingUser = await findUser(
        {
          $and: [group.userFilter, { id: userId }],
        },
        publishParams.dbo,
      );
      if (!matchingUser) continue;

      for (const [name, method] of Object.entries(group.functions)) {
        const existingMethod = allowedFunctionsMap.get(name);
        if (existingMethod) {
          throw `Duplicate function name detected: ${name}. Function names must be unique across all groups.`;
        }

        const runWithContext = async (args: Record<string, unknown> | undefined) => {
          const ctx = await (async () => {
            if (method.unrestrictedDbAccess) {
              return {
                ...publishParams,
                db: publishParams.dbo,
                _db: publishParams.db,
                user,
              };
            }
            const { clientDb, clientSql } = await publishParams.getClientDBHandlers(undefined);
            const { db: _db, ...safeParams } = publishParams;
            return {
              ...safeParams,
              db: clientDb,
              dbo: clientDb,
              sql: clientSql,
              user,
            };
          })();

          return method.run(args, ctx);
        };
        allowedFunctionsMap.set(name, { ...method, run: runWithContext });
      }
    }
    return allowedFunctionsMap;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   */
  async getPublishObject(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined,
  ): Promise<PublishObject | undefined> {
    const publishParams = await this.getPublishParams(clientReq, clientInfo);
    const publish = await applyParamsIfFunc(this.publish, publishParams);

    if (publish === "*") {
      const publish: PublishObject = {};
      this.prostgles.dboBuilder.tablesOrViews?.map((tov) => {
        publish[tov.name] = "*";
      });
      return publish;
    }

    return publish || undefined;
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
      return {
        select: { fields: "*", filterFields: "*", orderByFields: "*" },
        insert: { returningFields: "*", fields: "*" },
        update: { fields: "*", returningFields: "*", filterFields: "*" },
        delete: { returningFields: "*", filterFields: "*" },
      };
    }

    /* Must be from socket. Must have a publish */
    if (!this.publish) throw "publish is missing";

    const tableErrors = clientReq.socket?.prostgles?.get(this.prostgles.appId)?.tableSchemaErrors[
      tableName
    ];
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
    if (!command || !tableName) {
      throw "command OR tableName are missing";
    }

    const [rule] =
      getObjectEntries(SQL_COMMAND_TABLE_METHODS).find(([_, methods]) =>
        includes(methods, command),
      ) ?? [];
    if (!rule) {
      throw "Invalid command: " + command;
    }

    if (scope) {
      if (scope.allowSql) {
        // Allow all commands
      } else {
        const tableScope = scope.tables;
        const tableScopeCommands = tableScope?.[tableName];
        const methodAllowedInScope =
          tableScopeCommands &&
          (rule === "schema" ?
            getObjectEntries(tableScopeCommands).some(([_, value]) => {
              return value;
            })
          : tableScopeCommands[rule]);
        if (!methodAllowedInScope) {
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

    const isAllowed =
      rule === "schema" ? getObjectEntries(tableRule).some(([_, value]) => value) : tableRule[rule];
    if (!isAllowed) {
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
    const { tableName } = args;
    const tableHandler = this.dbo[tableName];
    if (!tableHandler) {
      throw "INTERNAL ERROR: table handler not found for " + args.tableName;
    }
    const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo);
    if (this.dbo[args.tableName]?.is_media) {
      const { rules: fileTableRules } = await getFileTableRules.bind(this)(
        args.tableName,
        fileTablePublishRules,
        args.clientReq,
        clientInfo,
        scope,
      );
      return applyScopeToTableRules(
        tableName,
        tableHandler,
        parsePublishTableRule(fileTableRules),
        scope,
      );
    }

    return applyScopeToTableRules(
      tableName,
      tableHandler,
      parsePublishTableRule(fileTablePublishRules),
      scope,
    );
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
