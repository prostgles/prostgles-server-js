import { DBHandlerServer } from "../dist/Prostgles";
import type { DBHandlerClient } from "./client/index";
export declare function tryRun(desc: string, func: () => any, log?: Function): Promise<void>;
export declare function tryRunP(desc: string, func: (resolve: any, reject: any) => any, opts?: {
    log?: Function;
    timeout?: number;
}): Promise<unknown>;
export default function isomorphic(db: Required<DBHandlerServer> | Required<DBHandlerClient>): Promise<void>;
//# sourceMappingURL=isomorphic_queries.d.ts.map