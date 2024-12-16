import { SessionUser } from "./Auth/AuthTypes";
import { Prostgles } from "./Prostgles";
import { ProstglesInitOptions } from "./ProstglesTypes";

import { testDboTypes } from "./typeTests/dboTypeCheck";
testDboTypes();

function prostgles<S = void, SUser extends SessionUser = SessionUser>(
  params: ProstglesInitOptions<S, SUser>,
) {
  const prgl = new Prostgles(params as any);
  return prgl.init(params.onReady as any, { type: "init" });
}
export = prostgles;
