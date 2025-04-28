import { SessionUser } from "./Auth/AuthTypes";
import type { InitResult, OnReadyCallbackBasic } from "./initProstgles";
import { Prostgles } from "./Prostgles";
import { ProstglesInitOptions } from "./ProstglesTypes";

import { testDboTypes } from "./typeTests/dboTypeCheck";
testDboTypes();

function prostgles<S = void, SUser extends SessionUser = SessionUser>(
  params: ProstglesInitOptions<S, SUser>
) {
  const prgl = new Prostgles(params as ProstglesInitOptions);
  return prgl.init(params.onReady as OnReadyCallbackBasic, { type: "init" }) as unknown as Promise<
    InitResult<S, SUser>
  >;
}
export = prostgles;
