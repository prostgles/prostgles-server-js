import { ProstglesInitOptions } from "./Prostgles";
import { DbHandler } from "./DboBuilder";
declare function prostgles(params: ProstglesInitOptions): Promise<{
    db: DbHandler;
    _db: import("./Prostgles").DB;
    pgp: import("./Prostgles").PGP;
    io?: any;
    destroy: () => Promise<boolean>;
}>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map