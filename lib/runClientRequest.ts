import {
  SQLRequest,
  TableHandler,
  UserLike,
  getKeys,
  pickKeys,
  type AnyObject,
} from "prostgles-types";
import { AuthClientRequest } from "./Auth/AuthTypes";
import { LocalParams } from "./DboBuilder/DboBuilder";
import { TableHandler as TableHandlerServer } from "./DboBuilder/TableHandler/TableHandler";
import { parseFieldFilter } from "./DboBuilder/ViewHandler/parseFieldFilter";
import { canRunSQL } from "./DboBuilder/runSQL";
import { Prostgles } from "./Prostgles";
import { ParsedTableRule, type PermissionScope } from "./PublishParser/publishTypesAndUtils";

const TABLE_METHODS = {
  find: 1,
  findOne: 1,
  count: 1,
  size: 1,
  update: 1,
  updateBatch: 1,
  delete: 1,
  upsert: 1,
  insert: 1,
  subscribe: 1,
  subscribeOne: 1,
  getColumns: 1,
  getInfo: 1,
  sync: 1,
} as const satisfies Record<keyof (TableHandler & Pick<TableHandlerServer, "sync">), 1>;

const TABLE_METHODS_KEYS = getKeys(TABLE_METHODS);
const SOCKET_ONLY_COMMANDS = [
  "subscribe",
  "subscribeOne",
  "sync",
] as const satisfies typeof TABLE_METHODS_KEYS;

type Args = {
  tableName: string;
  command: string;
  param1: any;
  param2: any;
  param3: any;
};

type TableMethodFunctionWithRulesAndLocalParams = (
  arg1: any,
  arg2: any,
  arg3: any,
  tableRule: ParsedTableRule,
  localParams: LocalParams
) => any;

export const runClientRequest = async function (
  this: Prostgles,
  args: Args,
  clientReq: AuthClientRequest,
  scope: PermissionScope | undefined
) {
  /* Channel name will only include client-sent params so we ignore table_rules enforced params */
  if (!this.publishParser || !this.dbo) {
    throw "socket/httpReq or authhandler missing";
  }

  const { tableName, command: nonValidatedCommand, param1, param2, param3 } = args;
  if (!TABLE_METHODS_KEYS.some((v) => v === nonValidatedCommand)) {
    throw `Invalid command: ${nonValidatedCommand}. Expecting one of: ${TABLE_METHODS_KEYS.join(", ")};`;
  }
  const command = nonValidatedCommand as keyof TableHandler;
  if (!clientReq.socket && SOCKET_ONLY_COMMANDS.some((v) => v === command)) {
    throw (
      "The following commands cannot be completed over a non-websocket connection: " +
      SOCKET_ONLY_COMMANDS.join(", ")
    );
  }

  const clientInfo = await this.authHandler?.getSidAndUserFromRequest(clientReq);
  if (clientInfo === "new-session-redirect") {
    throw clientInfo;
  }
  const validRules = await this.publishParser.getValidatedRequestRule(
    { tableName, command, clientReq },
    clientInfo,
    scope
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!validRules) {
    throw `Invalid OR disallowed request: ${tableName}.${command} `;
  }

  const sessionUser: UserLike | undefined =
    !clientInfo?.user ?
      undefined
    : {
        ...parseFieldFilter(
          //@ts-ignore
          clientInfo.sessionFields ?? [],
          false,
          getKeys(clientInfo.user)
        ),
        ...(pickKeys(clientInfo.user, ["id", "type"]) as UserLike),
      };
  const localParams: LocalParams = {
    clientReq,
    isRemoteRequest: { user: sessionUser },
  };
  if (param3 && (param3 as LocalParams).returnQuery) {
    const isAllowed = await canRunSQL(this, clientReq);
    if (isAllowed) {
      localParams.returnQuery = (param3 as LocalParams).returnQuery;
    } else {
      throw "Must be allowed to run sql to use returnQuery";
    }
  }
  const tableHandler = this.dbo[tableName];
  if (!tableHandler || !tableHandler.column_names) throw `Invalid tableName ${tableName} provided`;

  /**
   * satisfies check is used to ensure rules arguments are correctly passed to each method
   */
  const tableCommand = tableHandler[command]?.bind(tableHandler) satisfies
    | undefined
    | TableMethodFunctionWithRulesAndLocalParams;
  if (!tableCommand) throw `Invalid or disallowed command provided: ${command}`;
  return (this.dbo[tableName]![command] as TableMethodFunctionWithRulesAndLocalParams)(
    param1,
    param2,
    param3,
    validRules,
    localParams
  ) as AnyObject | undefined;
  // This approach is breaking context
  // const result = await (tableCommand as TableMethodFunctionWithRulesAndLocalParams)(param1, param2, param3, validRules, localParams);
  // return result;
};

// const getReqInfoClient = <A extends AuthClientRequest>(args: A): AuthClientRequest =>
//   args.httpReq ? { res: args.res, httpReq: args.httpReq } : { socket: args.socket };

export const clientCanRunSqlRequest = async function (
  this: Prostgles,
  clientReq: AuthClientRequest
) {
  if (!this.opts.publishRawSQL || typeof this.opts.publishRawSQL !== "function") {
    return { allowed: false, clientReq };
  }
  const canRunSQL = async () => {
    if (!this.authHandler) {
      throw "authHandler missing";
    }
    const publishParams = await this.publishParser?.getPublishParams(clientReq, undefined);
    const allowedToRunSQL = publishParams && (await this.opts.publishRawSQL?.(publishParams));
    return allowedToRunSQL === true || allowedToRunSQL === "*";
  };

  const allowed = await canRunSQL();
  return { allowed, reqInfo: clientReq };
};

export const runClientSqlRequest = async function (
  this: Prostgles,
  reqData: SQLRequest,
  clientReq: AuthClientRequest
) {
  const { allowed } = await clientCanRunSqlRequest.bind(this)(clientReq);
  if (!allowed) {
    throw "Not allowed to execute sql";
  }
  if (!this.dbo?.sql) throw "Internal error: sql handler missing";
  const { query, params, options } = reqData;
  return this.dbo.sql(query, params, options, { clientReq });
};

type ArgsMethod = {
  method: string;
  params?: any[];
};
export const runClientMethod = async function (
  this: Prostgles,
  reqArgs: ArgsMethod,
  clientReq: AuthClientRequest
) {
  const { method, params = [] } = reqArgs;
  const methods = await this.publishParser?.getAllowedMethods(clientReq, undefined);

  const methodDef = methods?.[method];
  if (!methods || !methodDef) {
    throw "Disallowed/missing method " + JSON.stringify(method);
  }

  const onRun =
    (
      typeof methodDef === "function" ||
      typeof (methodDef as unknown as Promise<void>).then === "function"
    ) ?
      (methodDef as (...args: any) => Promise<void>)
    : methodDef.run;
  const res = await onRun(...params);
  return res;
};
