import { SQLOptions } from "prostgles-types";
import { DboBuilder, LocalParams } from "../DboBuilder";
import { DB, Prostgles } from "../Prostgles";
export declare function runSQL(this: DboBuilder, queryWithoutRLS: string, params: any, options: SQLOptions | undefined, localParams?: LocalParams): Promise<any>;
export declare const canRunSQL: (prostgles: Prostgles, localParams?: LocalParams) => Promise<boolean>;
export declare const canCreateTables: (db: DB) => Promise<boolean>;
//# sourceMappingURL=runSQL.d.ts.map