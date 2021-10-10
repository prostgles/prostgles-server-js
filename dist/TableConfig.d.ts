import { DB, DbHandler, Prostgles } from "./Prostgles";
declare type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};
declare type BaseTableDefinition = {
    dropIfExists?: boolean;
};
declare type LookupTableDefinition<LANG_IDS> = {
    isLookupTable: {
        values: {
            [id_value: string]: {} | {
                [lang_id in keyof LANG_IDS]: string;
            };
        };
    };
};
declare type BaseColumn = {
    /**
     * Will add these values to .getColumns() result
     */
    info?: ColExtraInfo;
};
declare type SQLDefColumn = {
    /**
     * Raw sql statement used in creating/adding column
     */
    sqlDefinition?: string;
};
declare type ReferencedColumn = {
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
declare type TableDefinition = {
    columns: {
        [column_name: string]: BaseColumn & (SQLDefColumn | ReferencedColumn);
    };
};
/**
 * Helper utility to create lookup tables for TEXT columns
 */
export declare type TableConfig<LANG_IDS = {
    en: 1;
    ro: 1;
}> = {
    [table_name: string]: BaseTableDefinition & (TableDefinition | LookupTableDefinition<LANG_IDS>);
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