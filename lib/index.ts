import { SessionUser } from "./AuthHandler";
import { Prostgles, ProstglesInitOptions, InitResult } from "./Prostgles";

function prostgles<S = void, SUser extends SessionUser = SessionUser>(params: ProstglesInitOptions<S, SUser>){

    const prgl = new Prostgles(params as any);
    return prgl.init(params.onReady as any);
}
export = prostgles;