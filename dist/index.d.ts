import { ProstglesInitOptions } from "./Prostgles";
declare function prostgles<S = void>(params: ProstglesInitOptions<S>): Promise<{
    db: import("./DboBuilder").DBHandlerServer<import("./DboBuilder").TableHandlers>;
    _db: import("./Prostgles").DB;
    pgp: import("./Prostgles").PGP;
    io?: any;
    destroy: () => Promise<boolean>;
}>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map