import { AnyObject, 
  TableHandler, 
  UserLike, getKeys, pickKeys } from "prostgles-types";
import { ExpressReq } from "./Auth/AuthTypes";
import { LocalParams, PRGLIOSocket } from "./DboBuilder/DboBuilder";
import { parseFieldFilter } from "./DboBuilder/ViewHandler/parseFieldFilter";
import { canRunSQL } from "./DboBuilder/runSQL";
import { Prostgles } from "./Prostgles";
import { TableHandler as TableHandlerServer } from "./DboBuilder/TableHandler/TableHandler";
import { TableRule } from "./PublishParser/publishTypesAndUtils";
 
type ReqInfo = {
  type: "socket";
  socket: PRGLIOSocket;
  httpReq?: undefined;
} | {
  type: "http";
  httpReq: ExpressReq;
  socket?: undefined;
}
type ReqInfoClient = {
  socket: PRGLIOSocket;
} | {
  httpReq: ExpressReq;
}

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
} as const satisfies Record<(keyof (TableHandler & Pick<TableHandlerServer, "sync">)), 1>;

const TABLE_METHODS_KEYS = getKeys(TABLE_METHODS);
const SOCKET_ONLY_COMMANDS = ["subscribe", "subscribeOne", "sync"] as const satisfies typeof TABLE_METHODS_KEYS;

type Args = ReqInfo & {
  tableName: string; 
  command: string;
  param1: any;
  param2: any;
  param3: any;
};

const getReqInfoClient = (reqInfo: ReqInfo): ReqInfoClient => {
  if(reqInfo.type === "socket"){
    return { socket: reqInfo.socket };
  }
  return { httpReq: reqInfo.httpReq };
}

type TableMethodFunctionWithRulesAndLocalParams = ((arg1: any, arg2: any, arg3: any, tableRule: TableRule, localParams: LocalParams) => any);

export const runClientRequest = async function(this: Prostgles, args: Args){
  /* Channel name will only include client-sent params so we ignore table_rules enforced params */
  if ((args.type === "socket" && !args.socket) || (args.type === "http" && !args.httpReq) || !this.authHandler || !this.publishParser || !this.dbo) {
    throw "socket/httpReq or authhandler missing";
  }

  const { tableName, command: nonValidatedCommand, param1, param2, param3 } = args;
  if(!TABLE_METHODS_KEYS.some(v => v === nonValidatedCommand)){
    throw `Invalid command: ${nonValidatedCommand}. Expecting one of: ${TABLE_METHODS_KEYS};`
  }
  const command = nonValidatedCommand as keyof TableHandler;
  if(args.type !== "socket" && SOCKET_ONLY_COMMANDS.some(v => v === command)){
    throw "The following commands cannot be completed over a non-websocket connection: " + SOCKET_ONLY_COMMANDS;
  }

  const reqInfo = getReqInfoClient(args);
  const clientInfo = await this.authHandler.getClientInfo(args);
  const validRules = await this.publishParser.getValidatedRequestRule({ tableName, command, localParams: reqInfo }, clientInfo);
  if (!validRules) {
    throw `Invalid OR disallowed request: ${tableName}.${command} `;
  }

  const sessionUser: UserLike | undefined = !clientInfo?.user? undefined : {
    ...parseFieldFilter(clientInfo.sessionFields ?? [] as any, false, Object.keys(clientInfo.user)),
    ...pickKeys(clientInfo.user, ["id", "type"]) as UserLike,
  }
  const localParams: LocalParams = { ...reqInfo, isRemoteRequest: { user: sessionUser } }
  if(param3 && (param3 as LocalParams).returnQuery){
    const isAllowed = await canRunSQL(this, localParams);
    if(isAllowed){
      localParams.returnQuery = (param3 as LocalParams).returnQuery;
    } else {
      throw "Must be allowed to run sql to use returnQuery";
    }
  }
  const tableHandler = this.dbo[tableName];
  if(!tableHandler || !tableHandler.column_names) throw `Invalid tableName ${tableName} provided`;

  /**
   * satisfies check is used to ensure rules arguments are correctly passed to each method
   */
  const tableCommand = tableHandler[command] satisfies undefined | TableMethodFunctionWithRulesAndLocalParams;
  if(!tableCommand) throw `Invalid or disallowed command provided: ${command}`;
  //TODO: why does this not work?
  // const result = await (tableCommand as TableMethodFunctionWithRulesAndLocalParams)(param1, param2, param3, validRules, localParams);
  // return result;
  //@ts-ignore
  return this.dbo[tableName][command](param1, param2, param3, validRules, localParams);
}

export const clientCanRunSqlRequest = async function(this: Prostgles, args: ReqInfo){
  const reqInfo = getReqInfoClient(args);
  if(!this.opts.publishRawSQL || typeof this.opts.publishRawSQL !== "function"){
    return { allowed: false, reqInfo }
  } 
  const canRunSQL = async () => {
    if(!this.authHandler){
      throw "authHandler missing";
    } 
    const publishParams = await this.publishParser?.getPublishParams(reqInfo);
    const res = await this.opts.publishRawSQL?.(publishParams as any);
    return Boolean(res && typeof res === "boolean" || res === "*");
  }

  const allowed = await canRunSQL();
  return { allowed, reqInfo };
}

type ArgsSql = ReqInfo & {
  query: string;
  args?: AnyObject | any[];
  options?: any;
}
export const runClientSqlRequest = async function(this: Prostgles, params: ArgsSql){
  const { allowed, reqInfo } = await clientCanRunSqlRequest.bind(this)(params);
  if(!allowed){
    throw "Not allowed to execute sql";
  }
  if (!this.dbo?.sql) throw "Internal error: sql handler missing";
  const { query, args, options } = params;
  return this.dbo.sql(query, args, options, reqInfo);
}



type ArgsMethod = ReqInfo & {
  method: string;
  params?: any[]
}
export const runClientMethod = async function(this: Prostgles, reqArgs: ArgsMethod){

  const reqInfo = getReqInfoClient(reqArgs);
  const { method, params = [] } = reqArgs;
  const methods = await this.publishParser?.getAllowedMethods(reqInfo);

  if (!methods || !methods[method]) {
    throw ("Disallowed/missing method " + JSON.stringify(method));
  } 

  const methodDef = methods[method]!;
  const onRun = (typeof methodDef === "function" || typeof (methodDef as any).then === "function")? (methodDef as (...args: any) => Promise<void>) : methodDef.run;
  const res = await onRun(...params);
  return res;  
}