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

type LookupTableDefinition<LANG_IDS> = {
    isLookupTable: {
        dropIfExists?: boolean;
        values: {
            [id_value: string]: {} | {
                [lang_id in keyof LANG_IDS]: string
            }
        }[]
    }
}

type TableDefinition = {
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
            }
        }
    }
}

/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = { en: 1, ro: 1 }> = {
    [table_name: string]: TableDefinition | LookupTableDefinition<LANG_IDS>;
}

/**
 * Will be run between initSQL and fileTable
 */
export default class TableConfigurator {

    config?: TableConfig;
    dbo: DbHandler;
    db: DB;
    sidKeyName: string;
    prostgles: Prostgles

    constructor(prostgles: Prostgles){
        this.config = prostgles.opts.tableConfig;
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
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
            if("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable?.values).length){
                const rows = Object.keys(tableConf.isLookupTable?.values).map(id => ({ id, ...(tableConf.isLookupTable?.values[id]) }))
                if(!this.dbo?.[tableName]){
                    if(tableConf.isLookupTable?.dropIfExists){
                        queries.push(`DROP TABLE IF EXISTS ${tableName}`);
                    }
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
                
                if(!this.dbo[tableName]){
                    console.error("TableConfigurator: Table not found in dbo: " + tableName)
                } else {
                    Object.keys(tableConf.columns).map(colName => {
                        const colConf = tableConf.columns[colName];
                        
                        if(colConf.references && !this.dbo[tableName].columns.find(c => colName === c.name)) {
                            const { nullable, tableName: lookupTable, columnName: lookupCol = "id", defaultValue } = colConf.references;
                            queries.push(`
                                ALTER TABLE ${asName(tableName)} 
                                ADD COLUMN ${asName(colName)} TEXT ${!nullable? " NOT NULL " : ""} 
                                ${defaultValue? ` DEFAULT ${asValue(defaultValue)} ` : "" } 
                                REFERENCES ${lookupTable} (${lookupCol}) ;
                            `)
                            console.log(`${tableName}(${colName}) ` + " referenced lookup table " + tableName)
                        }
                    });
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
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name=${asValue(tableName)} and column_name=${asValue(colName)}
        LIMIT 1;
    `))?.column_name);
}