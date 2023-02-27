import { SessionUser } from "./AuthHandler";
import { ProstglesInitOptions } from "./Prostgles";
declare function prostgles<S = void, SUser extends SessionUser = SessionUser>(params: ProstglesInitOptions<S, SUser>): Promise<import("./Prostgles").InitResult>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map