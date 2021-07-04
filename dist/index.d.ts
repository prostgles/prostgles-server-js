import { ProstglesInitOptions } from "./Prostgles";
declare function prostgles(params: ProstglesInitOptions): Promise<{
    db: import("./DboBuilder").DbHandlerTX;
    _db: import("./Prostgles").DB;
    pgp: import("./Prostgles").PGP;
    io?: any;
    destroy: () => Promise<undefined>;
}>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map