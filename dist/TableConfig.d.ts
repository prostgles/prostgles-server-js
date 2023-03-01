import { AnyObject, TableInfo, ALLOWED_EXTENSION, ALLOWED_CONTENT_TYPE, JSONB, ColumnInfo } from "prostgles-types";
import { JoinInfo } from "./DboBuilder";
import { DB, DBHandlerServer, Prostgles } from "./Prostgles";
type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};
export type I18N_Config<LANG_IDS> = {
    [lang_id in keyof LANG_IDS]: string;
};
export declare const parseI18N: <LANG_IDS, Def extends string | undefined>(params: {
    config?: string | I18N_Config<LANG_IDS> | undefined;
    lang?: string | keyof LANG_IDS | undefined;
    defaultLang: string | keyof LANG_IDS;
    defaultValue: Def;
}) => string | Def;
type BaseTableDefinition<LANG_IDS = AnyObject> = {
    info?: {
        label?: string | I18N_Config<LANG_IDS>;
    };
    dropIfExistsCascade?: boolean;
    dropIfExists?: boolean;
    triggers?: {
        [triggerName: string]: {
            /**
             * Use "before" when you need to change the data before the action
             */
            type: "before" | "after" | "instead of";
            actions: ("insert" | "update" | "delete")[];
            forEach: "statement" | "row";
            /**
             * @example
             * DECLARE
                x_rec record;
              BEGIN
                  raise notice '=operation: % =', TG_OP;
                  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
                      FOR x_rec IN SELECT * FROM old_table LOOP
                          raise notice 'OLD: %', x_rec;
                      END loop;
                  END IF;
                  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
                      FOR x_rec IN SELECT * FROM new_table LOOP
                          raise notice 'NEW: %', x_rec;
                      END loop;
                  END IF;
      
                  RETURN NULL;
              END;
             */
            query: string;
        };
    };
};
type LookupTableDefinition<LANG_IDS> = {
    isLookupTable: {
        values: {
            [id_value: string]: {} | {
                [lang_id in keyof LANG_IDS]: string;
            };
        };
    };
};
export type BaseColumn<LANG_IDS> = {
    /**
     * Will add these values to .getColumns() result
     */
    info?: ColExtraInfo;
    label?: string | Partial<{
        [lang_id in keyof LANG_IDS]: string;
    }>;
};
type SQLDefColumn = {
    /**
     * Raw sql statement used in creating/adding column
     */
    sqlDefinition?: string;
};
type BaseColumnTypes = {
    defaultValue?: any;
    nullable?: boolean;
};
type TextColumn = BaseColumnTypes & {
    isText: true;
    /**
     * Value will be trimmed before update/insert
     */
    trimmed?: boolean;
    /**
     * Value will be lower cased before update/insert
     */
    lowerCased?: boolean;
};
export type JSONBColumnDef = (BaseColumnTypes & {}) & ({
    jsonbSchema: JSONB.JSONBSchema;
    jsonbSchemaType?: undefined;
} | {
    jsonbSchema?: undefined;
    jsonbSchemaType: JSONB.ObjectSchema;
});
/**
 * Allows referencing media to this table.
 * Requires this table to have a primary key AND a valid fileTable config
 */
type MediaColumn = ({
    name: string;
    label?: string;
    files: "one" | "many";
} & ({
    /**
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept
     */
    allowedContentType?: Record<Partial<("audio/*" | "video/*" | "image/*" | "text/*" | ALLOWED_CONTENT_TYPE)>, 1>;
} | {
    allowedExtensions?: Record<Partial<ALLOWED_EXTENSION>, 1>;
}));
type ReferencedColumn = {
    /**
     * Will create a lookup table that this column will reference
     */
    references?: BaseColumnTypes & {
        tableName: string;
        /**
         * Defaults to id
         */
        columnName?: string;
    };
};
type JoinDef = {
    sourceTable: string;
    targetTable: string;
    on: JoinInfo["paths"][number]["on"];
};
/**
 * Used in specifying a join path to a table. This column name can then be used in select
 */
type NamedJoinColumn = {
    label?: string;
    joinDef: JoinDef[];
};
type Enum<T extends string | number = any> = {
    enum: T[] | readonly T[];
    nullable?: boolean;
    defaultValue?: T;
};
export type ColumnConfig<LANG_IDS = {
    en: 1;
}> = string | StrictUnion<NamedJoinColumn | MediaColumn | (BaseColumn<LANG_IDS> & (SQLDefColumn | ReferencedColumn | TextColumn | JSONBColumnDef | Enum))>;
export type ColumnConfigs<LANG_IDS = {
    en: 1;
}> = {
    sql: string | BaseColumn<LANG_IDS> & SQLDefColumn;
    join: BaseColumn<LANG_IDS> & NamedJoinColumn;
    media: BaseColumn<LANG_IDS> & MediaColumn;
    referenced: BaseColumn<LANG_IDS> & ReferencedColumn;
    text: BaseColumn<LANG_IDS> & TextColumn;
    jsonb: BaseColumn<LANG_IDS> & JSONBColumnDef;
    enum: BaseColumn<LANG_IDS> & Enum;
};
type UnionKeys<T> = T extends T ? keyof T : never;
type StrictUnionHelper<T, TAll> = T extends any ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, never>> : never;
export type StrictUnion<T> = StrictUnionHelper<T, T>;
type TableDefinition<LANG_IDS> = {
    columns?: {
        [column_name: string]: ColumnConfig<LANG_IDS>;
    };
    constraints?: {
        [constraint_name: string]: string;
    };
    /**
     * Similar to unique constraints but expressions are allowed inside definition
     */
    replaceUniqueIndexes?: boolean;
    indexes?: {
        [index_name: string]: {
            /**
             * If true then will drop any existing index with this name
             * Overrides replaceUniqueIndexes
             */
            replace?: boolean;
            /**
             * Causes the system to check for duplicate values in the table when the index is created (if data already exist) and each time data is added.
             * Attempts to insert or update data which would result in duplicate entries will generate an error.
             */
            unique?: boolean;
            /**
             * When this option is used, PostgreSQL will build the index without taking any locks that prevent
             * concurrent inserts, updates, or deletes on the table; whereas a standard index build locks out writes (but not reads) on the table until it's done.
             * There are several caveats to be aware of when using this option — see Building Indexes Concurrently.
             */
            concurrently?: boolean;
            /**
             * Table name
             */
            /**
             * Column list
             * @example: col1, col2
             */
            columns: string;
            /**
             * Where clause without the "where"
             * Used to create a partial index. A partial index is an index that contains entries for only a portion of a table
             * Another possible application is to use WHERE with UNIQUE to enforce uniqueness over a subset of a table
             */
            where?: string;
            /**
             * The name of the index method to be used.
             * Choices are btree, hash, gist, and gin. The default method is btree.
             */
            using?: "btree" | "hash" | "gist" | "gin";
        };
    };
};
/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = {
    en: 1;
}> = {
    [table_name: string]: BaseTableDefinition<LANG_IDS> & (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>);
};
/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator<LANG_IDS = {
    en: 1;
}> {
    config?: TableConfig<LANG_IDS>;
    get dbo(): DBHandlerServer;
    get db(): DB;
    prostgles: Prostgles;
    constructor(prostgles: Prostgles);
    getColumnConfig: (tableName: string, colName: string) => ColumnConfig | undefined;
    getTableInfo: (params: {
        tableName: string;
        lang?: string;
    }) => TableInfo["info"] | undefined;
    getColInfo: (params: {
        col: string;
        table: string;
        lang?: string;
    }) => (ColExtraInfo & {
        label?: string;
    } & Pick<ColumnInfo, "jsonbSchema">) | undefined;
    checkColVal: (params: {
        col: string;
        table: string;
        value: any;
    }) => void;
    getJoinInfo: (sourceTable: string, targetTable: string) => JoinInfo | undefined;
    init(): Promise<void>;
    log: (...args: any[]) => void;
}
export {};
//# sourceMappingURL=TableConfig.d.ts.map