import { ProstglesInitOptions } from "./Prostgles";
import { DbHandler } from "./DboBuilder";
declare function prostgles<DBObj = DbHandler>(params: ProstglesInitOptions<DBObj>): Promise<{
    db: DbHandler;
    _db: import("./Prostgles").DB;
    pgp: import("./Prostgles").PGP;
    io?: any;
    destroy: () => Promise<boolean>;
}>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map