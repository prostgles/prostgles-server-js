import { AnyObject, asName } from "prostgles-types";
import { DboBuilder, LocalParams } from "./DboBuilder";
import { asSQLIdentifier } from "./FileManager";
import { DB, DbHandler, Prostgles } from "./Prostgles";
import { asValue } from "./PubSubManager";

type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};

type BaseTableDefinition = {
    dropIfExistsCascade?: boolean;
    dropIfExists?: boolean;
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

type BaseColumn = {
    /**
     * Will add these values to .getColumns() result
     */
    info?: ColExtraInfo;

}

type SQLDefColumn = {

    /**
     * Raw sql statement used in creating/adding column
     */
    sqlDefinition?: string;
}

type ReferencedColumn = {

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
    }
}

type ColumnConfig = BaseColumn & (SQLDefColumn | ReferencedColumn)

type TableDefinition = {
    columns: {
        [column_name: string]: ColumnConfig
    }
}

/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = { en: 1, ro: 1 }> = {
    [table_name: string]: BaseTableDefinition & (TableDefinition | LookupTableDefinition<LANG_IDS>);
}

/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator {

    config?: TableConfig;
    get dbo(): DbHandler { return this.prostgles.dbo };
    get db(): DB { return this.prostgles.db };
    sidKeyName: string;
    prostgles: Prostgles

    constructor(prostgles: Prostgles){
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }

    getColInfo = (params: {col: string, table: string}): ColExtraInfo | undefined => {
        return this.config[params.table]?.[params.col]?.info;
    }

    checkColVal = (params: {col: string, table: string, value: any }): void => {
        const conf = this.getColInfo(params);
        if(conf){
            const { value } = params;
            const { min, max } = conf;
            if(min !== undefined && value !== undefined && value < min) throw `${params.col} must be less than ${min}`
            if(max !== undefined && value !== undefined && value > max) throw `${params.col} must be greater than ${max}`
        }
    }

    async init(){
        let queries: string[] = [];
        
        /* Create lookup tables */
        Object.keys(this.config).map(tableName => {
            const tableConf = this.config[tableName];
            const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
            if(dropIfExistsCascade){
                queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
            } else if(dropIfExists){
                queries.push(`DROP TABLE IF EXISTS ${tableName} ;`);
            }
            if("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable?.values).length){
                const rows = Object.keys(tableConf.isLookupTable?.values).map(id => ({ id, ...(tableConf.isLookupTable?.values[id]) }));
                if(dropIfExists || dropIfExistsCascade || !this.dbo?.[tableName]){
                    const keys = Object.keys(rows[0]).filter(k => k !== "id");
                    queries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (
                        id  TEXT PRIMARY KEY
                        ${keys.length? (", " + keys.map(k => asName(k) + " TEXT ").join(", ")) : ""}
                    );`);

                    rows.map(row => {
                        const values = this.prostgles.pgp.helpers.values(row)
                        queries.push(this.prostgles.pgp.as.format(`INSERT INTO ${tableName}  (${["id", ...keys].map(t => asName(t)).join(", ")})  ` + " VALUES ${values:raw} ;", { values} ))
                    });
                    console.log("Created lookup table " + tableName)
                }
            }
        });
        
        if(queries.length){    
            await this.db.multi(queries.join("\n"));
        }
        queries = [];

        /* Create referenced columns */
        await Promise.all(Object.keys(this.config).map(async tableName => {
            const tableConf = this.config[tableName];
            if("columns" in tableConf){
                const getColDef = (name: string, colConf: ColumnConfig): string => {

                    if("references" in colConf && colConf.references){

                        const { nullable, tableName: lookupTable, columnName: lookupCol = "id", defaultValue } = colConf.references;
                        return ` ${asName(name)} TEXT ${!nullable? " NOT NULL " : ""} ${defaultValue? ` DEFAULT ${asValue(defaultValue)} ` : "" } REFERENCES ${lookupTable} (${lookupCol}) `;

                    } else if("sqlDefinition" in colConf && colConf.sqlDefinition){
                        
                        return ` ${asName(name)} ${colConf.sqlDefinition} `;
                    }
                }
                
                const colDefs = [];
                Object.keys(tableConf.columns).map(colName => {
                    const colConf = tableConf.columns[colName];
                    
                    if(!this.dbo[tableName]){
                        colDefs.push(getColDef(colName, colConf))
                    } else if(!colDefs.length && !this.dbo[tableName].columns.find(c => colName === c.name)) {

                        if("references" in colConf && colConf.references){

                            const { tableName: lookupTable, } = colConf.references;
                            queries.push(`
                                ALTER TABLE ${asName(tableName)} 
                                ADD COLUMN ${getColDef(colName, colConf)};
                            `)
                            console.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);

                        } else if("sqlDefinition" in colConf && colConf.sqlDefinition){
                            
                            queries.push(`
                                ALTER TABLE ${asName(tableName)} 
                                ADD COLUMN ${getColDef(colName, colConf)};
                            `)
                            console.log(`TableConfigurator: created/added column ${tableName}(${colName}) ` + colConf.sqlDefinition)
                        }
                    }
                });

                if(colDefs.length){
                    queries.push(`CREATE TABLE ${asName(tableName)} (
                        ${colDefs.join(", \n")}
                    );`)
                    console.error("TableConfigurator: Created table: \n" + queries[0])
                } 
            }
        }));

        if(queries.length){
            await this.db.multi(queries.join("\n"));
        }
    }
}


async function columnExists(args: {tableName: string; colName: string; db: DB }){
    const { db, tableName, colName } = args;
    return Boolean((await db.oneOrNone(`
        SELECT column_name, table_name
        FROM information_schema.columns 
        WHERE table_name=${asValue(tableName)} and column_name=${asValue(colName)}
        LIMIT 1;
    `))?.column_name);
}