import { AnyObject, asName } from "prostgles-types";
import { LocalParams } from "./DboBuilder";
import { asSQLIdentifier } from "./FileManager";
import { DB, DbHandler, Prostgles } from "./Prostgles";

type ColExtraInfo = {
    min?: string | number;
    max?: string | number;
    hint?: string;
};

/**
 * Helper utility to create lookup tables for TEXT columns
 */
export type TableConfig<LANG_IDS = { en: 1, ro: 1 }> = {
    [table_name: string]: {
        [column_name: string]: {
            
            /**
             * Will add these values to .getColumns() result
             */
            info?: ColExtraInfo;

            /**
             * Will create a lookup table that this column will reference
             */
            lookupValues?: {
                nullable?: boolean;
                values: {
                    id: string;
                    i18n?: {
                        [lang_id in keyof LANG_IDS]: string
                    }
                }[]
            }
        }
    }
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
        await Promise.all(Object.keys(this.config).map(async tableName => {
            if(!this.dbo?.[tableName])throw "Table not found: " + tableName;

            const tCols = this.dbo?.[tableName]?.columns;
            const tConf = this.config[tableName];
            
            await Promise.all(Object.keys(tConf).map(async colName => {
                const colConf = tConf[colName];
                const lookupConf = colConf.lookupValues;
                const rows = lookupConf?.values;
                if(rows?.length){

                    const keys = Object.keys(rows?.[0]?.i18n || {})
                    const lookup_table_name = await asSQLIdentifier(`lookup_${tableName}_${colName}`, this.db)
                    // const lookup_table_name = asName(`lookup_${tableName}_${colName}`);
                    
                    await this.db.any(`CREATE TABLE IF NOT EXISTS ${lookup_table_name} (
                        id  TEXT PRIMARY KEY
                        ${keys.length? (", " + keys.map(k => asName(k) + " TEXT ").join(", ")) : ""}
                    )`);

                    if(!tCols.find(c => c.name === colName)){
                        await this.db.any(`ALTER TABLE ${asName(tableName)} ADD COLUMN ${asName(colName)} TEXT ${!lookupConf.nullable? " NOT NULL " : ""} REFERENCES ${lookup_table_name} (id)`)
                    };

                    await this.prostgles.refreshDBO();

                    const lcols = await this.dbo[lookup_table_name].columns;
                    const missing_lcols = keys.filter(k => !lcols.find(lc => lc.name === k));
                    
                    if(missing_lcols.length){
                        await this.db.any(`ALTER TABLE ${lookup_table_name} ${missing_lcols.map(c => `ADD COLUMN  ${c} TEXT `).join(", ")}`)
                    }

                    await this.dbo[lookup_table_name].insert(
                        rows.map(r => ({ id: r.id, ...r.i18n })), 
                        { onConflictDoNothing: true }
                    );

                    console.log(`TableConfig: Created ${lookup_table_name}(id) for ${tableName}(${asName(colName)})`)
                }
            }))
        }))
    }
}