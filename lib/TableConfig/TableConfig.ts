import { getKeys, asName as _asName, AnyObject, TableInfo,  ALLOWED_EXTENSION, ALLOWED_CONTENT_TYPE, isObject, JSONB, ColumnInfo } from "prostgles-types";
import { isPlainObject, JoinInfo } from "../DboBuilder";
import { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import { asValue } from "../PubSubManager/PubSubManager";
import { validate_jsonb_schema_sql } from "../JSONBValidation/validate_jsonb_schema_sql";
import { getColConstraints, getColumnDefinitionQuery } from "./getColumnDefinitionQuery";
import { stringify } from "querystring";

type ColExtraInfo = {
  min?: string | number;
  max?: string | number;
  hint?: string;
};

export type I18N_Config<LANG_IDS> = {
  [lang_id in keyof LANG_IDS]: string;
}

export const parseI18N = <LANG_IDS, Def extends string | undefined>(params: { 
  config?: I18N_Config<LANG_IDS> | string; 
  lang?: keyof LANG_IDS | string; 
  defaultLang: keyof LANG_IDS | string;
  defaultValue: Def;
}): Def | string => {
  const { config, lang, defaultLang, defaultValue } = params;
  if(config){
    if(isPlainObject(config)){
      //@ts-ignore
      return config[lang] ?? config[defaultLang];
    } else if(typeof config === "string"){
      return config;
    }
  }

  return defaultValue;
}

type BaseTableDefinition<LANG_IDS = AnyObject> = {
  info?: {
    label?: string | I18N_Config<LANG_IDS>;
  }
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
    }
  };
}

type LookupTableDefinition<LANG_IDS> = {
  isLookupTable: {
    values: {
      [id_value: string]: {} | {
        [lang_id in keyof LANG_IDS]: string
      }
    }
  }
}

export type BaseColumn<LANG_IDS> = {
  /**
   * Will add these values to .getColumns() result
   */
  info?: ColExtraInfo;

  label?: string | Partial<{ [lang_id in keyof LANG_IDS]: string; }>;
}

type SQLDefColumn = {

  /**
   * Raw sql statement used in creating/adding column
   */
  sqlDefinition?: string;
}

export type BaseColumnTypes = {
  defaultValue?: any;
  nullable?: boolean;
}

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
}

export type JSONBColumnDef = (BaseColumnTypes & {
  /**
   * If the new schema CHECK fails old rows the update old rows using this function
   */
  // onMigrationFail?: <T>(failedRow: T) => AnyObject | Promise<AnyObject>;
}) & ({
  jsonbSchema: JSONB.JSONBSchema;
  jsonbSchemaType?: undefined;
} | {
  jsonbSchema?: undefined;
  jsonbSchemaType: JSONB.ObjectType["type"];
})

/**
 * Allows referencing media to this table.
 * Requires this table to have a primary key AND a valid fileTable config
 */
type MediaColumn = ({

  name: string;
  label?: string;
  files: "one" | "many";
} & (
    {

      /**
       * https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/accept
       */
      allowedContentType?: Record<Partial<("audio/*" | "video/*" | "image/*" | "text/*" | ALLOWED_CONTENT_TYPE)>, 1>
    } |
    {
      allowedExtensions?: Record<Partial<ALLOWED_EXTENSION>, 1>
    }
  ));

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
  }
}

type JoinDef = {
  sourceTable: string;
  targetTable: string;
  on: JoinInfo["paths"][number]["on"];
}

/**
 * Used in specifying a join path to a table. This column name can then be used in select
 */
type NamedJoinColumn = {
  label?: string;
  joinDef: JoinDef[];
}

type Enum<T extends string | number = any> = { 
  enum: T[] | readonly T[];
  nullable?: boolean; 
  defaultValue?: T; 
};

export type ColumnConfig<LANG_IDS = { en: 1 }> = string | StrictUnion<NamedJoinColumn | MediaColumn | (BaseColumn<LANG_IDS> & (SQLDefColumn | ReferencedColumn | TextColumn | JSONBColumnDef | Enum))>;

export type ColumnConfigs<LANG_IDS = { en: 1 }> = {
  sql: string | BaseColumn<LANG_IDS> & SQLDefColumn;
  join: BaseColumn<LANG_IDS> & NamedJoinColumn;
  media: BaseColumn<LANG_IDS> & MediaColumn;
  referenced: BaseColumn<LANG_IDS> & ReferencedColumn;
  text: BaseColumn<LANG_IDS> & TextColumn;
  jsonb: BaseColumn<LANG_IDS> & JSONBColumnDef;
  enum: BaseColumn<LANG_IDS> & Enum;
}

type UnionKeys<T> = T extends T ? keyof T : never;
type StrictUnionHelper<T, TAll> = T extends any ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, never>> : never;
export type StrictUnion<T> = StrictUnionHelper<T, T>

export const CONSTRAINT_TYPES = ["PRIMARY KEY", "UNIQUE", "CHECK"] as const; // "FOREIGN KEY", 
type TableDefinition<LANG_IDS> = {
  columns?: {
    [column_name: string]: ColumnConfig<LANG_IDS>
  },
  constraints?: {
    [constraint_name: string]: 
    | string 
    | { 
        type: typeof CONSTRAINT_TYPES[number]; 
        dropIfExists?: boolean; 
        /**
         * E.g.: 
         * colname
         * col1, col2
         * col1 > col3
         */
        content: string;
      } 
      // & ({
      // } 
      // | {
      //   type: "FOREIGN KEY",
      //   columns: string[];
      //   ftable: string;
      //   fcols: string[];
      // }
      // )
  },

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
    }
  }
}

/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = { en: 1 }> = {
  [table_name: string]: BaseTableDefinition<LANG_IDS> & (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>);
}

/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator<LANG_IDS = { en: 1 }> {

  config?: TableConfig<LANG_IDS>;
  get dbo(): DBHandlerServer {
    if (!this.prostgles.dbo) throw "this.prostgles.dbo missing"
    return this.prostgles.dbo
  } 
  get db(): DB {
    if (!this.prostgles.db) throw "this.prostgles.db missing"
    return this.prostgles.db
  } 
  // sidKeyName: string;
  prostgles: Prostgles

  constructor(prostgles: Prostgles) {
    this.config = prostgles.opts.tableConfig as any;
    this.prostgles = prostgles;
  }

  getColumnConfig = (tableName: string, colName: string): ColumnConfig | undefined => {
    const tconf = this.config?.[tableName];
    if (tconf && "columns" in tconf) {
      return tconf.columns?.[colName];
    }
    return undefined;
  }

  getTableInfo = (params: { tableName: string; lang?: string }): TableInfo["info"] | undefined => {
    const tconf = this.config?.[params.tableName];
    
    return {
      label: parseI18N<LANG_IDS, string>({ config: tconf?.info?.label, lang: params.lang, defaultLang: "en", defaultValue: params.tableName })
    }
  }

  getColInfo = (params: { col: string, table: string, lang?: string }): (ColExtraInfo & { label?: string; } & Pick<ColumnInfo, "jsonbSchema">) | undefined => {
    const colConf = this.getColumnConfig(params.table, params.col);
    let result: Partial<ReturnType<typeof this.getColInfo>> = undefined;
    if (colConf) {

      if (isObject(colConf)) {
        const { jsonbSchema, jsonbSchemaType, info } = colConf;
        result = {
          ...(result ?? {}),
          ...info,
          ...((jsonbSchema || jsonbSchemaType) && { jsonbSchema: { nullable: colConf.nullable, ...(jsonbSchema || { type: jsonbSchemaType }) } })
        }

        /**
         * Get labels from TableConfig if specified
         */
        if (colConf.label) {
          const { lang } = params;
          const lbl = colConf?.label;
          if (["string", "object"].includes(typeof lbl)) {
            if (typeof lbl === "string") {
              result ??= {};
              result.label = lbl
            } else if (lang && (lbl?.[lang as "en"] || lbl?.en)) {
              result ??= {};
              result.label = (lbl?.[lang as "en"]) || lbl?.en;
            }
          }

        }

      }

    }


    return result;
  }

  checkColVal = (params: { col: string, table: string, value: any }): void => {
    const conf = this.getColInfo(params);
    if (conf) {
      const { value } = params;
      const { min, max } = conf;
      if (min !== undefined && value !== undefined && value < min) throw `${params.col} must be less than ${min}`
      if (max !== undefined && value !== undefined && value > max) throw `${params.col} must be greater than ${max}`
    }
  }

  getJoinInfo = (sourceTable: string, targetTable: string): JoinInfo | undefined => {
    if (
      this.config &&
      sourceTable in this.config &&
      this.config[sourceTable] &&
      "columns" in this.config[sourceTable]
    ) {
      const td = this.config[sourceTable];
      if ("columns" in td && td.columns?.[targetTable]) {
        const cd = td.columns[targetTable];
        if (isObject(cd) && "joinDef" in cd) {
          if(!cd.joinDef) throw "cd.joinDef missing"
          const { joinDef } = cd;
          const res: JoinInfo = {
            expectOne: false,
            paths: joinDef.map(({ sourceTable, targetTable: table, on }) => ({
              source: sourceTable,
              target: targetTable,
              table,
              on
            })),
          }

          return res;
        }
      }
    }
    return undefined;
  }

  async init() {
    let queries: string[] = [];

    if (!this.config || !this.prostgles.pgp) throw "config or pgp missing";

    const MAX_IDENTIFIER_LENGTH = +(await this.db.one("SHOW max_identifier_length;") as any).max_identifier_length;
    if(!Number.isFinite(MAX_IDENTIFIER_LENGTH)) throw `Could not obtain a valid max_identifier_length`;
    const asName = (v: string) => {
      if(v.length > MAX_IDENTIFIER_LENGTH - 1){
        throw `The identifier name provided (${v}) is longer than the allowed limit (max_identifier_length - 1 = ${MAX_IDENTIFIER_LENGTH -1} characters )\n Longest allowed: ${_asName(v.slice(0, MAX_IDENTIFIER_LENGTH - 1))} `
      }

      return _asName(v);
    }

    let migrations: { version: number; table: string; } | undefined;
    if(this.prostgles.opts.tableConfigMigrations){
      const { onMigrate, version, versionTableName = "schema_version" } = this.prostgles.opts.tableConfigMigrations;
      await this.db.any(`CREATE TABLE IF NOT EXISTS ${asName(versionTableName)}(id NUMERIC PRIMARY KEY, table_config JSONB NOT NULL)`);
      migrations = { version, table: versionTableName  };
      let existingVersion: number | undefined;
      try {
        existingVersion = (await this.db.oneOrNone(`SELECT MAX(id) as v FROM ${asName(versionTableName)}`)).v;
      } catch(e){

      }

      if(!existingVersion || existingVersion < version){
        await onMigrate({ db: this.db, oldVersion: existingVersion, getConstraints: (table, col, types) => getColConstraints(this.db, table, col, types) })
      }
    }

    /* Create lookup tables */
    getKeys(this.config).map(async tableNameRaw => {
      const tableName = asName(tableNameRaw);
      const tableConf = this.config![tableNameRaw];
      const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
      const isDropped = dropIfExists || dropIfExistsCascade;

      if (dropIfExistsCascade) {
        queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
      } else if (dropIfExists) {
        queries.push(`DROP TABLE IF EXISTS ${tableName} ;`);
      }

      if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable?.values).length) {
        const rows = Object.keys(tableConf.isLookupTable?.values).map(id => ({ id, ...(tableConf.isLookupTable?.values[id]) }));
        if (isDropped || !this.dbo?.[tableNameRaw]) {
          const columnNames = Object.keys(rows[0]).filter(k => k !== "id");
          queries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (
                        id  TEXT PRIMARY KEY
                        ${columnNames.length? (", " + columnNames.map(k => asName(k) + " TEXT ").join(", ")) : ""}
                    );`);

          rows.map(row => {
            const values = this.prostgles.pgp!.helpers.values(row)
            queries.push(this.prostgles.pgp!.as.format(`INSERT INTO ${tableName}  (${["id", ...columnNames].map(t => asName(t)).join(", ")})  ` + " VALUES ${values:raw} ;", { values }))
          });
          // this.log("Created lookup table " + tableName)
        }
      }      
    });

    if (queries.length) {
      const q = queries.join("\n");
      if(this.prostgles.opts.DEBUG_MODE){
        this.log("TableConfig: \n", q);
      }
      await this.db.multi(q);
      await this.prostgles.refreshDBO()
    }
    queries = [];

    /* Create columns */
    for await (const tableName of getKeys(this.config)){ 
      const tableConf = this.config![tableName];
      if ("columns" in tableConf) {
        const colCreateLines: string[] = [];
        const tableHandler = this.dbo[tableName];
        if (tableConf.columns) {
          const hasJSONBValidation = getKeys(tableConf.columns).some(c => {
            const cConf = tableConf.columns?.[c];
            return cConf && isObject(cConf) && (cConf.jsonbSchema || cConf.jsonbSchemaType)
          });

          /** Must install validation function */
          if(hasJSONBValidation){
            try {
              
              const fileContent = `
              /* prevent duplicate key value violates unique constraint "pg_namespace_nspname_index" Key (nspname)=(prostgles) already exists.*/
              LOCK TABLE pg_catalog.pg_namespace IN SHARE ROW EXCLUSIVE MODE;
              CREATE SCHEMA IF NOT EXISTS prostgles;\n 
              ${validate_jsonb_schema_sql}`;
              await this.db.any(fileContent);
            } catch(err: any){
              console.error("Could not install the jsonb validation function due to error: ", err);
              throw err;
            }
          }

          const columns = getKeys(tableConf.columns).filter(c => {
            const colDef = tableConf.columns![c];
            return typeof colDef === "string" || !("joinDef" in colDef)
          });
          
          for await(const colName of columns) {
            const colConf = tableConf.columns![colName];


            /* Add columns to create statement */
            if (!tableHandler) {
              const colDef = await getColumnDefinitionQuery({ colConf, column: colName, db: this.db, table: tableName })
              colCreateLines.push(colDef);

            } else if (tableHandler && !tableHandler.columns?.find(c => colName === c.name)) {
              const colDef = await getColumnDefinitionQuery({ colConf, column: colName, db: this.db, table: tableName })

              queries.push(`
                ALTER TABLE ${asName(tableName)} 
                ADD COLUMN ${colDef};
              `);
              if (isObject(colConf) && "references" in colConf && colConf.references) {

                const { tableName: lookupTable, } = colConf.references;
                this.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);
              }  else {
                this.log(`TableConfigurator: created/added column ${tableName}(${colName}) `)
              }
            }
          }
        }

        if (colCreateLines.length) {
          queries.push([
            `CREATE TABLE ${asName(tableName)} (`,
              colCreateLines.join(", \n"),
            `);`
          ].join("\n"))
          this.log("TableConfigurator: Created table: \n" + queries.at(-1))
        }
      }
      if ("constraints" in tableConf && tableConf.constraints) {
        const constraints = await getTableConstraings(this.db, tableName);
        const constraintNames = getKeys(tableConf.constraints);
        constraintNames.map(constraintName => {
          const _cnstr = tableConf.constraints![constraintName];
          const constraintDef = typeof _cnstr === "string"? _cnstr : `${_cnstr.type} (${_cnstr.content})`;
          const canDrop = isObject(_cnstr) && _cnstr.dropIfExists;
          /** Drop constraints with the same name */
          const existingConstraint = constraints.some(c => c.conname === constraintName);
          if(existingConstraint){
            if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
          }
          if(!existingConstraint || canDrop){
            queries.push(`ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(constraintName)} ${constraintDef} ;`);
          }
        });
      }
      if ("indexes" in tableConf && tableConf.indexes) {
        /*
            CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] [ [ IF NOT EXISTS ] name ] ON [ ONLY ] table_name [ USING method ]
              ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass [ ( opclass_parameter = value [, ... ] ) ] ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
              [ INCLUDE ( column_name [, ...] ) ]
              [ NULLS [ NOT ] DISTINCT ]
              [ WITH ( storage_parameter [= value] [, ... ] ) ]
              [ TABLESPACE tablespace_name ]
              [ WHERE predicate ]
        */
        getKeys(tableConf.indexes).map(indexName => {
          const { 
            replace, 
            unique, concurrently,
            using, columns, where = ""
          } = tableConf.indexes![indexName];
          if (replace || typeof replace !== "boolean" && tableConf.replaceUniqueIndexes) {
            queries.push(`DROP INDEX IF EXISTS ${asName(indexName)}  ;`);
          }
          queries.push([
            "CREATE",
            unique && "UNIQUE",
            concurrently && "CONCURRENTLY",
            `INDEX ${asName(indexName)} ON ${asName(tableName)}`,
            using && ("USING " + using),
            `(${columns})`,
            where && `WHERE ${where}`
          ].filter(v => v).join(" ") + ";");
        });
      }

      const { triggers, dropIfExists, dropIfExistsCascade } = tableConf;
      if(triggers){
        const isDropped = dropIfExists || dropIfExistsCascade;

        const existingTriggers = await this.dbo.sql!(`
            SELECT event_object_table
              ,trigger_name
            FROM  information_schema.triggers
            WHERE event_object_table = \${tableName}
            ORDER BY event_object_table
          `,
          { tableName }, 
          { returnType: "rows" }
        ) as { trigger_name: string }[];

        // const existingTriggerFuncs = await this.dbo.sql!(`
        //   SELECT p.oid,proname,prosrc,u.usename
        //   FROM  pg_proc p  
        //   JOIN  pg_user u ON u.usesysid = p.proowner  
        //   WHERE prorettype = 2279;
        // `, {}, { returnType: "rows" }) as { proname: string }[];

        getKeys(triggers).forEach(triggerFuncName => {
          const trigger = triggers[triggerFuncName];

          const funcNameParsed = asName(triggerFuncName);
          
          queries.push(`
            CREATE OR REPLACE FUNCTION ${funcNameParsed}()
              RETURNS trigger
              LANGUAGE plpgsql
            AS
            $$

            ${trigger.query}
            
            $$;
          `);
          
          trigger.actions.forEach(action => {
            const triggerActionName = triggerFuncName+"_"+action;
            
            const triggerActionNameParsed = asName(triggerActionName)
            if(isDropped){
              queries.push(`DROP TRIGGER IF EXISTS ${triggerActionNameParsed} ON ${tableName};`)
            }

            if(isDropped || !existingTriggers.some(t => t.trigger_name === triggerActionName)){
              const newTableName = action !== "delete"? "NEW TABLE AS new_table" : "";
              const oldTableName = action !== "insert"? "OLD TABLE AS old_table" : "";
              queries.push(`
                CREATE TRIGGER ${triggerActionNameParsed}
                ${trigger.type} ${action} ON ${tableName}
                REFERENCING ${newTableName} ${oldTableName}
                FOR EACH ${trigger.forEach}
                EXECUTE PROCEDURE ${funcNameParsed}();
              `);
            }
          })
        })
      }
    }

    if (queries.length) {
      const q = queries.join("\n");
      this.log("TableConfig: \n", q);

      try {
        await this.db.multi(q);
        if(migrations){
          await this.db.any(`INSERT INTO ${migrations.table}(id, table_config) VALUES (${asValue(migrations.version)}, ${asValue(this.config)}) ON CONFLICT DO NOTHING;`)
        }
      } catch(err: any){
        console.error("TableConfig error: ", err);
        if(err.position){
          const pos = +err.position;
          if(Number.isInteger(pos)){
            return Promise.reject(err.toString() + "\n At:" + q.slice(pos - 50, pos + 50));
          }
        }
        return Promise.reject(err);

      }
    }
  }

  log = (...args: any[]) => {
    if (this.prostgles.opts.DEBUG_MODE) {
      console.log("TableConfig: \n", ...args)
    }
  }
  
}

async function columnExists(args: { tableName: string; colName: string; db: DB }) {
  const { db, tableName, colName } = args;
  return Boolean((await db.oneOrNone(`
        SELECT column_name, table_name
        FROM information_schema.columns 
        WHERE table_name=${asValue(tableName)} and column_name=${asValue(colName)}
        LIMIT 1;
    `))?.column_name);
}

function getTableConstraings(db: DB, tableName: string): Promise<{ oid: number; conname: string; definition: string; }[]>{
  return db.any(`
    SELECT con.*, pg_get_constraintdef(con.oid)
    FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel
            ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = connamespace
    WHERE 1=1
    AND nsp.nspname = current_schema
    AND rel.relname = ` + "${tableName}", { tableName })
}
