import { DB, DBHandlerServer } from "../Prostgles";
import { TableConfig } from "./TableConfig";
type Args = {
    db: DB;
    tableConf: TableConfig[string];
    tableName: string;
    tableHandler: DBHandlerServer[string];
};
export declare const getTableColumnQueries: ({ db, tableConf, tableName, tableHandler }: Args) => Promise<{
    columnDefs: string[];
    newColumnDefs: string[];
    fullQuery: string;
    isCreate: boolean;
}>;
export {};
//# sourceMappingURL=getTableColumnQueries.d.ts.map