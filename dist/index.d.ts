import { ProstglesInitOptions } from "./Prostgles";
import { DBSchema } from "prostgles-types";
declare function prostgles<S extends DBSchema | undefined = undefined>(params: ProstglesInitOptions<S>): Promise<{
    db: import("./DBSchemaBuilder").DBOFullyTyped<S>;
    _db: import("./Prostgles").DB;
    pgp: import("./Prostgles").PGP;
    io?: any;
    destroy: () => Promise<boolean>;
}>;
export = prostgles;
//# sourceMappingURL=index.d.ts.map