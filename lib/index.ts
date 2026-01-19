import type { SessionUser } from "./Auth/AuthTypes";
import type { InitResult, OnReadyCallbackBasic } from "./initProstgles";
import { Prostgles } from "./Prostgles";
import type { ProstglesInitOptions } from "./ProstglesTypes";

function prostgles<S = void, SUser extends SessionUser = SessionUser>(
  params: ProstglesInitOptions<S, SUser>
) {
  const prgl = new Prostgles(params as ProstglesInitOptions);
  return prgl.init(params.onReady as OnReadyCallbackBasic, {
    type: "init",
  }) as unknown as Promise<InitResult<S, SUser>>;
}
export * from "./PublishParser/defineServerFunction";
export * from "./Auth/AuthTypes";
export type { PublishParams } from "./PublishParser/publishTypesAndUtils";
export type { DBOFullyTyped } from "./DBSchemaBuilder/DBSchemaBuilder";
export type { DBHandlerServer } from "./Prostgles";
export type { CloudClient, LocalConfig } from "./FileManager/FileManager";
export type * from "./TableConfig/TableConfig";

export default prostgles;
