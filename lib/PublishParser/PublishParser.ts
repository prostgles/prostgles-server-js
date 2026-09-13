import {
  getObjectEntries,
  includes,
  SQL_COMMAND_TABLE_METHODS,
  type TableSchema,
} from "prostgles-types";
import { getClientRequestIPsInfo } from "../Auth/AuthHandler";
import type { AuthClientRequest, AuthResultWithSID, SessionUser } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import { applyScopeToTableRules } from "./applyScopeToTableRules";
import type {
  RestrictedFunctionContext,
  ServerFunctionDefinition,
  UnrestrictedFunctionContext,
} from "./defineServerFunction";
import { getFileTableRules } from "./getFileTableRules";
import { getPublishedObjectFromResult } from "./getPublishedObjectFromResult";
import { getSchemaFromPublish } from "./getSchemaFromPublish";
import { getParsedPublishTable } from "./getParsedPublishTable";
import type {
  DboTable,
  DboTableCommand,
  ParsedTableRule,
  Publish,
  PublishParams,
} from "./publishTypesAndUtils";
import {
  isPublishProfiles,
  parsePublishTableRule,
  type PermissionScope,
  type PublishObject,
} from "./publishTypesAndUtils";
import { validatePublishProfiles } from "./validatePublishProfiles";

export class PublishParser {
  parsedPublish: ReturnType<typeof getParsedPublish>;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB;
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    const { publish } = prostgles.opts;

    this.parsedPublish = getParsedPublish(publish, prostgles.dboBuilder.tablesOrViews ?? []);

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
    this.prostgles.checkNotDestroyed();
    const sessionUser =
      clientInfo ?? (await this.prostgles.authHandler.getSidAndUserFromRequest(clientReq));
    if (sessionUser === "new-session-redirect") {
      throw "new-session-redirect";
    }
    this.prostgles.checkNotDestroyed();
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
          this.prostgles.checkNotDestroyed();
          const ctx = await (async () => {
            if (method.unrestrictedDbAccess) {
              const unrestrictedCtx: UnrestrictedFunctionContext<void, SessionUser, unknown> = {
                ...publishParams,
                user,
                context: this.prostgles.context,
              };
              return unrestrictedCtx;
            }
            const { clientDb } = await publishParams.getClientDBHandlers(undefined);
            const { clientInfo, clientReq, tables } = publishParams;
            const restrictedCtx: RestrictedFunctionContext<void, SessionUser, unknown> = {
              dbo: clientDb,
              user,
              clientInfo,
              clientReq,
              tables,
              context: this.prostgles.context,
            };
            return restrictedCtx;
          })();

          this.prostgles.checkNotDestroyed();
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
  async getPublishObjectForUser(
    clientReq: AuthClientRequest,
    clientInfo: AuthResultWithSID | undefined,
  ): Promise<PublishObject | undefined> {
    const publishParams = await this.getPublishParams(clientReq, clientInfo);

    const parsedPublish = await applyParamsIfFunc(this.parsedPublish, publishParams);

    const publishResult = (() => {
      if (!isPublishProfiles(parsedPublish)) {
        return parsedPublish;
      }

      const { user } = publishParams;
      if (!user) return;
      return parsedPublish.find(({ userTypes }) => userTypes.includes(user.type))?.publish;
    })();

    if (!publishResult) return;

    const publishedObject = getPublishedObjectFromResult(
      publishResult,
      this.prostgles.dboBuilder.tablesOrViews ?? [],
      publishParams,
    );
    return publishedObject;
  }

  async getValidatedRequestRuleWusr(
    { tableName, command, clientReq }: DboTableCommand,
    scope: PermissionScope | undefined,
  ): Promise<ParsedTableRule> {
    const clientInfo =
      clientReq && (await this.prostgles.authHandler.getSidAndUserFromRequest(clientReq));
    if (clientInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }
    const rules = await this.getParsedTableRule({ tableName, clientReq, scope, clientInfo });
    this.validateRequestRule({ tableName, command, clientReq }, rules, scope);
    return rules;
  }

  async getParsedTableRule({
    tableName,
    clientReq,
    clientInfo,
    scope,
  }: Omit<TableRequest, "resolvedPublishObject">): Promise<ParsedTableRule> {
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
    if (!this.parsedPublish) throw "publish is missing";

    const tableErrors = clientReq.socket?.prostgles?.get(this.prostgles.appId)?.tableSchemaErrors[
      tableName
    ];
    /* Get any publish errors for socket */
    Object.values(tableErrors ?? {}).forEach((errorInfo) => {
      throw errorInfo.error;
    });

    const tableRule = await this.getTableRules({
      tableName,
      clientReq,
      clientInfo,
      scope,
      resolvedPublishObject: undefined,
    });

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

  async getTableRules({
    resolvedPublishObject: overriddenPublish,
    scope,
    clientInfo,
    clientReq,
    tableName,
  }: TableRequest): Promise<ParsedTableRule | undefined> {
    const tableHandler = this.dbo[tableName];
    if (!tableHandler) {
      throw "INTERNAL ERROR: table handler not found for " + tableName;
    }
    const publishRulesExcludingFileTable = await this.getParsedPublishTable({
      clientReq,
      tableName,
      clientInfo,
      resolvedPublishObject: overriddenPublish,
    });
    if (this.dbo[tableName]?.is_media) {
      const { rules: fileTableRules } = await getFileTableRules.bind(this)(
        tableName,
        publishRulesExcludingFileTable,
        clientReq,
        clientInfo,
        scope,
        overriddenPublish,
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
      parsePublishTableRule(publishRulesExcludingFileTable),
      scope,
    );
  }

  getParsedPublishTable = getParsedPublishTable.bind(this);

  /* Prepares schema for client. Only allowed views and commands will be present */
  getSchemaFromPublish = getSchemaFromPublish.bind(this);
}

const getParsedPublish = (publish: Publish | undefined, tablesOrViews: TableSchema[]) => {
  if (!publish) return;
  return (
    isPublishProfiles(publish) ? validatePublishProfiles(publish)
    : typeof publish === "function" ? publish
    : getPublishedObjectFromResult(publish, tablesOrViews, undefined)
  );
};

export type TableRequest = DboTable & {
  clientInfo: AuthResultWithSID | undefined;
  scope: PermissionScope | undefined;
  resolvedPublishObject: PublishObject | undefined;
};

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
