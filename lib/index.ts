import { defineJoin } from "prostgles-types";
import type { SessionUser } from "./Auth/AuthTypes";
import type { InitResult, OnReadyCallbackBasic } from "./initProstgles";
import { Prostgles } from "./Prostgles";
import type { ProstglesInitOptions } from "./ProstglesTypes";
export { DB_GENERATED_NAMES } from "./DBSchemaBuilder/constants";

function prostgles<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
  ClientSchema = S,
>(params: ProstglesInitOptions<S, SUser, Context>) {
  const prgl = new Prostgles(params as unknown as ProstglesInitOptions<void, SessionUser, any>);
  return prgl.init(params.onReady as unknown as OnReadyCallbackBasic, {
    type: "init",
  }) as unknown as Promise<InitResult<S, SUser, Context, ClientSchema>>;
}

/** Creates a schema-bound Prostgles initializer while allowing context inference. */
export const createProstgles = <
  S = void,
  SUser extends SessionUser = SessionUser,
  ClientSchema = S,
>() => {
  return <Context = undefined>(params: ProstglesInitOptions<S, SUser, Context>) =>
    prostgles<S, SUser, Context, ClientSchema>(params);
};
export * from "./PublishParser/defineServerFunction";
export { createJobDefiner } from "./Jobs/JobTypes";
export type {
  JobsConfig,
  JobsOptions,
  JobDefinition,
  JobContext,
  RowTrigger,
  ScheduleTrigger,
  ParamsSchema,
  ParamsOutput,
  Jobs,
  JobRecord,
  JobStatus,
} from "./Jobs/JobTypes";
export * from "./Auth/AuthTypes";
export type { ExecutionContext, FunctionInvocation, TriggerInvocation } from "./ExecutionContext";

export type {
  PublishContextValue,
  Publish,
  PublishObject,
  PublishAllTables,
  PublishedResult,
  BeforeEachTsTrigger,
  AfterAllTsTrigger,
  AfterCommitTsTrigger,
  AfterEachTsTrigger,
  PublishProfile,
  PublishParams,
} from "./PublishParser/publishTypesAndUtils";
export type { ClientDBHandlerRequest, GetClientDBHandlers } from "./WebsocketAPI/getClientHandlers";
export type {
  DBHandlerServer,
  DBHandlerServerRestricted,
  DBOFullyTyped,
  DBOFullyTypedClient,
} from "./DBSchemaBuilder/DBSchemaBuilder";
export type { DBHandlerServerInternal } from "./Prostgles";
export type { ServerSelectParams } from "./DboBuilder/ViewHandler/find";
export type { StorageClient as CloudClient } from "./StorageClient/StorageClientTypes";
export * from "./StorageClient/getLocalStorageClient";
export type {
  ContextCleanup,
  CreateContext,
  CreateContextParams,
  DB,
  InitResult,
  OnReadyParams,
} from "./initProstgles";
export type {
  FileTableConfig,
  ProstglesInitOptions,
  TableConfigMigrations,
} from "./ProstglesTypes";
export type * from "./TableConfig/TableConfigTypes";
export type * from "./Audit/AuditTypes";
export type * from "./TableHooks/TableHooks";
export * from "./Auth/utils/upsertNamedExpressMiddleware";
export type { RequestWithUser } from "./Auth/middleware/userContextMiddleware";
export default prostgles;
export type { FileTableInsertRow, FileTableRow } from "./StorageClient/getFileTableConfig";
export { defineJoin };
export {
  AUDIT_TABLE_COLUMN_DEFINITIONS,
  AUDIT_TABLE_COLUMN_NAMES,
  AUDIT_TABLE_COLUMNS,
  type AuditTableInsertRow,
  type AuditTableRow,
} from "./Audit/AuditTable";
