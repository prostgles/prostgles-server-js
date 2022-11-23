import { SessionUser } from "./AuthHandler";
import { ProstglesInitOptions, InitResult } from "./Prostgles";
declare function prostgles<S = void, SUser extends SessionUser = SessionUser>(params: ProstglesInitOptions<S, SUser>): Promise<InitResult>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map