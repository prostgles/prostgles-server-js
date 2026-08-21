import type { SessionUser } from "./Auth/AuthTypes";
import type { InitResult, OnReadyCallbackBasic } from "./initProstgles";
import { Prostgles } from "./Prostgles";
import type { ProstglesInitOptions } from "./ProstglesTypes";

function prostgles<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
>(
  params: ProstglesInitOptions<S, SUser, Context>,
) {
  const prgl = new Prostgles(
    params as unknown as ProstglesInitOptions<void, SessionUser, any>,
  );
  return prgl.init(params.onReady as unknown as OnReadyCallbackBasic, {
    type: "init",
  }) as unknown as Promise<InitResult<S, SUser, Context>>;
}

/** Creates a schema-bound Prostgles initializer while allowing context inference. */
export const createProstgles = <S = void, SUser extends SessionUser = SessionUser>() => {
  return <Context = undefined>(params: ProstglesInitOptions<S, SUser, Context>) =>
    prostgles<S, SUser, Context>(params);
};
export * from "./PublishParser/defineServerFunction";
export * from "./Auth/AuthTypes";
export type { PublishParams } from "./PublishParser/publishTypesAndUtils";
export type { DBOFullyTyped } from "./DBSchemaBuilder/DBSchemaBuilder";
export type { DBHandlerServer } from "./Prostgles";
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
export type { ProstglesInitOptions } from "./ProstglesTypes";
export type * from "./TableConfig/TableConfigTypes";
export type * from "./TableHooks/TableHooks";
export * from "./Auth/utils/upsertNamedExpressMiddleware";
export type { RequestWithUser } from "./Auth/middleware/userContextMiddleware";
export default prostgles;
export type { FileTableRow } from "./StorageClient/getFileTableConfig";
