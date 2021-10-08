import { DB, DbHandler, Prostgles } from "./Prostgles";
/**
 * Helper utility to create lookup tables for TEXT columns
 */
export declare type TableConfig<LANG_IDS = {
    en: 1;
    ro: 1;
}> = {
    [table_name: string]: {
        lookupColumns?: {
            [column_name: string]: {
                nullable?: boolean;
                values: {
                    id: string;
                    i18n?: {
                        [lang_id in keyof LANG_IDS]: string;
                    };
                }[];
            };
        };
    };
};
/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator {
    config?: TableConfig;
    dbo: DbHandler;
    db: DB;
    sidKeyName: string;
    prostgles: Prostgles;
    constructor(prostgles: Prostgles);
    init(): Promise<void>;
}
//# sourceMappingURL=TableConfig.d.ts.map