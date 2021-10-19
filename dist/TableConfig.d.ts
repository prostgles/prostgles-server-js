import { JoinInfo } from "./DboBuilder";
import { DB, DbHandler, Prostgles } from "./Prostgles";
declare type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};
declare type BaseTableDefinition = {
    dropIfExistsCascade?: boolean;
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
declare type JoinDef = {
    sourceTable: string;
    targetTable: string;
    /**
     * E.g.: [sourceCol: string, targetCol: string][];
     */
    on: [string, string][];
};
/**
 * Used in specifying a join path to a table. This column name can then be used in select
 */
declare type NamedJoinColumn = {
    label?: string;
    joinDef: JoinDef[];
};
declare type ColumnConfig = NamedJoinColumn | (BaseColumn & (SQLDefColumn | ReferencedColumn));
declare type TableDefinition = {
    columns: {
        [column_name: string]: ColumnConfig;
    };
    constraints?: {
        [constraint_name: string]: string;
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
    get dbo(): DbHandler;
    get db(): DB;
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
    getJoinInfo: (sourceTable: string, targetTable: string) => JoinInfo | undefined;
    init(): Promise<void>;
}
export {};
//# sourceMappingURL=TableConfig.d.ts.map