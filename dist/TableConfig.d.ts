import { DB, DbHandler, Prostgles } from "./Prostgles";
declare type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};
declare type LookupTableDefinition<LANG_IDS> = {
    isLookupTable: {
        dropIfExists?: boolean;
        values: {
            [id_value: string]: {} | {
                [lang_id in keyof LANG_IDS]: string;
            };
        };
    };
};
declare type TableDefinition = {
    columns: {
        [column_name: string]: {
            /**
             * Will add these values to .getColumns() result
             */
            info?: ColExtraInfo;
            /**
             * Will create a lookup table that this column will reference
             */
            references?: {
                tableName: string;
                /**
                 * Defaults to id
                 */
                columnName?: string;
                defaultValue?: string;
                nullable?: boolean;
            };
        };
    };
};
/**
 * Helper utility to create lookup tables for TEXT columns
 */
export declare type TableConfig<LANG_IDS = {
    en: 1;
    ro: 1;
}> = {
    [table_name: string]: TableDefinition | LookupTableDefinition<LANG_IDS>;
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
    getColInfo: (params: {
        col: string;
        table: string;
    }) => ColExtraInfo | undefined;
    checkColVal: (params: {
        col: string;
        table: string;
        value: any;
    }) => void;
    init(): Promise<void>;
}
export {};
//# sourceMappingURL=TableConfig.d.ts.map