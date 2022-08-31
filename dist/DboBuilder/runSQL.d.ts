import { SQLOptions } from "prostgles-types";
import { DboBuilder, LocalParams } from "../DboBuilder";
import { Prostgles } from "../Prostgles";
export declare function runSQL(this: DboBuilder, query: string, params: any, options: SQLOptions | undefined, localParams?: LocalParams): Promise<any>;
export declare const canRunSQL: (prostgles: Prostgles, localParams?: LocalParams) => Promise<boolean>;
//# sourceMappingURL=runSQL.d.ts.map