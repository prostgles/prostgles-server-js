import type {
  ALLOWED_CONTENT_TYPE,
  ALLOWED_EXTENSION,
  AnyObject,
  ColumnInfo,
  JSONB,
  StrictUnion,
  TableInfo,
} from "prostgles-types";
import { isObject } from "prostgles-types";
import type { JoinInfo, LocalParams } from "../DboBuilder/DboBuilder";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { uploadFile } from "../DboBuilder/uploadFile";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import type { InsertRule, ValidateRowArgs } from "../PublishParser/PublishParser";
import { initTableConfig } from "./initTableConfig";

type ColExtraInfo = {
  min?: string | number;
  max?: string | number;
  hint?: string;
};

type LangToTranslation = Record<string, string>;

export const parseI18N = <Config extends LangToTranslation>(params: {
  config?: Config | string;
  lang?: string;
  defaultLang: string;
  defaultValue: string | undefined;
}): undefined | string => {
  const { config, lang, defaultLang, defaultValue } = params;
  if (config) {
    if (isObject(config)) {
      return config[lang ?? defaultLang] ?? config[defaultLang];
    } else if (typeof config === "string") {
      return config;
    }
  }

  return defaultValue;
};

type BaseTableDefinition = {
  info?: {
    label?: string | LangToTranslation;
  };
  dropIfExistsCascade?: boolean;
  dropIfExists?: boolean;
  hooks?: {
    /**
     * Hook used to run custom logic before inserting a row.
     * The returned row must satisfy the table schema
     */
    getPreInsertRow?: (
      args: GetPreInsertRowArgs,
    ) => Promise<{ row: AnyObject; onInserted: Promise<void> }>;
  };
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
      [id_value: string]:
        | {}
        | {
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

  label?: string | Partial<{ [lang_id in keyof LANG_IDS]: string }>;
};

type SQLDefColumn = {
  /**
   * Raw sql statement used in creating/adding column
   */
  sqlDefinition?: string;
};

export type BaseColumnTypes = {
  defaultValue?: string | number | boolean | Record<string, any>;
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

export type JSONBColumnDef = BaseColumnTypes &
  (
    | {
        jsonbSchema: JSONB.JSONBSchema;
        jsonbSchemaType?: undefined;
      }
    | {
        jsonbSchema?: undefined;
        jsonbSchemaType: JSONB.ObjectType["type"];
      }
  );

/**
 * Allows referencing media to this table.
 * Requires this table to have a primary key AND a valid fileTable config
 */
type MediaColumn = {
  name: string;
  label?: string;
  files: "one" | "many";
} & (
  | {
      /**
       * https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept
       */
      allowedContentType?: Record<
        Partial<"audio/*" | "video/*" | "image/*" | "text/*" | ALLOWED_CONTENT_TYPE>,
        1
      >;
    }
  | {
      allowedExtensions?: Record<Partial<ALLOWED_EXTENSION>, 1>;
    }
);

type ReferencedColumn = BaseColumnTypes & {
  /**
   * Will create a lookup table that this column will reference
   */
  references?: {
    tableName: string;
    /**
     * Defaults to id
     */
    columnName?: string;
    onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION" | "SET DEFAULT";
    onUpdate?: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION" | "SET DEFAULT";
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

export type ColumnConfig<LANG_IDS = { en: 1 }> =
  | string
  | StrictUnion<
      | NamedJoinColumn
      | MediaColumn
      | (BaseColumn<LANG_IDS> &
          (SQLDefColumn | ReferencedColumn | TextColumn | JSONBColumnDef | Enum))
    >;

export type ColumnConfigs<LANG_IDS = { en: 1 }> = {
  sql: string | (BaseColumn<LANG_IDS> & SQLDefColumn);
  join: BaseColumn<LANG_IDS> & NamedJoinColumn;
  media: BaseColumn<LANG_IDS> & MediaColumn;
  referenced: BaseColumn<LANG_IDS> & ReferencedColumn;
  text: BaseColumn<LANG_IDS> & TextColumn;
  jsonb: BaseColumn<LANG_IDS> & JSONBColumnDef;
  enum: BaseColumn<LANG_IDS> & Enum;
};

type ConstraintType = "PRIMARY KEY" | "UNIQUE" | "CHECK" | "FOREIGN KEY";

/**
 * Each column definition cannot reference to tables that appear later in the table definition.
 * These references should be specified in constraints property
 */
export type TableDefinition<LANG_IDS> = {
  onMount?: (params: {
    dbo: DBHandlerServer;
    _db: DB;
  }) => Promise<void | { onUnmount: () => void }>;
  columns?: {
    [column_name: string]: ColumnConfig<LANG_IDS>;
  };
  constraints?:
    | string[]
    | {
        [constraint_name: string]:
          | string
          | {
              type: ConstraintType;
              dropIfExists?: boolean;
              /**
               * E.g.:
               * colname
               * col1, col2
               * col1 > col3
               */
              content: string;
            };
        // & ({
        // }
        // | {
        //   type: "FOREIGN KEY",
        //   columns: string[];
        //   ftable: string;
        //   fcols: string[];
        // }
        // )
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
      // on?: string;

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

type GetPreInsertRowArgs = Omit<ValidateRowArgs, "localParams"> & {
  // preValidate: InsertRule["preValidate"];
  validate: InsertRule["validate"];
  localParams: LocalParams | undefined;
};

/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = { en: 1 }> = {
  [table_name: string]: BaseTableDefinition &
    (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>);
};

/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator {
  instanceId = Date.now() + Math.random();

  get config() {
    return this.prostgles.opts.tableConfig ?? {};
  }
  get dbo(): DBHandlerServer {
    if (!this.prostgles.dbo) throw "this.prostgles.dbo missing";
    return this.prostgles.dbo;
  }
  get db(): DB {
    if (!this.prostgles.db) throw "this.prostgles.db missing";
    return this.prostgles.db;
  }
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
  }

  destroy = async () => {
    for (const { onUnmount } of Object.values(this.tableOnMounts)) {
      try {
        await onUnmount();
      } catch (error) {
        console.error(error);
      }
    }
  };

  tableOnMounts: Record<string, { onUnmount: () => void | Promise<void> }> = {};
  setTableOnMounts = async () => {
    this.tableOnMounts = {};
    for (const [tableName, tableConfig] of Object.entries(this.config)) {
      if ("onMount" in tableConfig && tableConfig.onMount) {
        const cleanup = await tableConfig.onMount({
          dbo: this.dbo,
          _db: this.db,
        });
        if (cleanup) {
          this.tableOnMounts[tableName] = cleanup;
        }
      }
    }
  };

  getColumnConfig = (tableName: string, colName: string): ColumnConfig | undefined => {
    const tconf = this.config[tableName];
    if (tconf && "columns" in tconf) {
      return tconf.columns?.[colName];
    }
    return undefined;
  };

  getTableInfo = (params: { tableName: string; lang?: string }): TableInfo["info"] | undefined => {
    const tconf = this.config[params.tableName];

    return {
      label: parseI18N({
        config: tconf?.info?.label,
        lang: params.lang,
        defaultLang: "en",
        defaultValue: params.tableName,
      }),
    };
  };

  getColInfo = (params: {
    col: string;
    table: string;
    lang?: string;
  }): (ColExtraInfo & { label?: string } & Pick<ColumnInfo, "jsonbSchema">) | undefined => {
    const colConf = this.getColumnConfig(params.table, params.col);
    let result: Partial<ReturnType<typeof this.getColInfo>> = undefined;
    if (colConf) {
      if (isObject(colConf)) {
        const { jsonbSchema, jsonbSchemaType, info } = colConf;
        result = {
          ...info,
          ...((jsonbSchema || jsonbSchemaType) && {
            jsonbSchema: {
              nullable: colConf.nullable,
              ...(jsonbSchema || { type: jsonbSchemaType }),
            },
          }),
        };

        /**
         * Get labels from TableConfig if specified
         */
        if (colConf.label) {
          const { lang } = params;
          const lbl = colConf.label;
          if (["string", "object"].includes(typeof lbl)) {
            if (typeof lbl === "string") {
              result ??= {};
              result.label = lbl;
            } else if (lang && (lbl[lang as "en"] || lbl.en)) {
              result ??= {};
              result.label = lbl[lang as "en"] || lbl.en;
            }
          }
        }
      }
    }

    return result;
  };

  checkColVal = (params: { col: string; table: string; value?: number | string }): void => {
    const conf = this.getColInfo(params);
    if (conf) {
      const { value } = params;
      const { min, max } = conf;
      if (min !== undefined && value !== undefined && value < min)
        throw `${params.col} must be greater than ${min}`;
      if (max !== undefined && value !== undefined && value > max)
        throw `${params.col} must be less than ${max}`;
    }
  };

  getJoinInfo = (sourceTable: string, targetTable: string): JoinInfo | undefined => {
    if (
      sourceTable in this.config &&
      this.config[sourceTable] &&
      "columns" in this.config[sourceTable]
    ) {
      const td = this.config[sourceTable];
      if ("columns" in td && td.columns?.[targetTable]) {
        const cd = td.columns[targetTable];
        if (isObject(cd) && "joinDef" in cd) {
          if (!cd.joinDef) throw "cd.joinDef missing";
          const { joinDef } = cd;
          const res: JoinInfo = {
            expectOne: false,
            paths: joinDef.map(({ sourceTable, targetTable: table, on }) => ({
              source: sourceTable,
              target: targetTable,
              table,
              on,
            })),
          };

          return res;
        }
      }
    }
    return undefined;
  };

  getPreInsertRow = async (
    tableHandler: TableHandler,
    args: Pick<GetPreInsertRowArgs, "localParams" | "row" | "validate" | "dbx" | "tx">,
  ): Promise<AnyObject> => {
    const tableHook = this.config[tableHandler.name]?.hooks?.getPreInsertRow;
    if (tableHandler.is_media) {
      return uploadFile.bind(tableHandler)(args) as Promise<AnyObject>;
    }
    if (tableHook) {
      return tableHook(args);
    }

    return args.row;
  };

  prevInitQueryHistory?: string[];
  initialising = false;
  init = initTableConfig.bind(this);
}
