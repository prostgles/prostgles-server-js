"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initFileManager = void 0;
const prostgles_types_1 = require("prostgles-types");
const runSQL_1 = require("../DboBuilder/runSQL");
const FileManager_1 = require("./FileManager");
const fs = __importStar(require("fs"));
async function initFileManager(prg) {
    this.prostgles = prg;
    // const { dbo, db, opts } = prg;
    const { fileTable } = prg.opts;
    if (!fileTable)
        throw "fileTable missing";
    const { tableName = "media", referencedTables = {} } = fileTable;
    this.tableName = tableName;
    const maxBfSizeMB = (prg.opts.io?.engine?.opts?.maxHttpBufferSize || 1e6) / 1e6;
    console.log(`Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`);
    // throw `this.db.tx(d => do everything in a transaction pls!!!!`;
    const canCreate = await (0, runSQL_1.canCreateTables)(this.db);
    const runQuery = (q) => {
        if (!canCreate)
            throw "File table creation failed. Your postgres user does not have CREATE table privileges";
        return this.db.any(`
      ${q}
    `);
        /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
    };
    /**
     * 1. Create media table
     */
    if (!this.dbo[tableName]) {
        console.log(`Creating fileTable ${(0, prostgles_types_1.asName)(tableName)} ...`);
        await runQuery(`CREATE EXTENSION IF NOT EXISTS pgcrypto `);
        await runQuery(`CREATE TABLE IF NOT EXISTS ${(0, prostgles_types_1.asName)(tableName)} (
        name                  TEXT NOT NULL,
        extension             TEXT NOT NULL,
        content_type          TEXT NOT NULL,
        content_length        BIGINT NOT NULL DEFAULT 0,
        added                 TIMESTAMP NOT NULL DEFAULT NOW(),
        url                   TEXT NOT NULL,
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_name         TEXT NOT NULL,
        description           TEXT,
        s3_url                TEXT,
        signed_url            TEXT,
        signed_url_expires    BIGINT,
        etag                  TEXT,
        deleted               BIGINT,
        deleted_from_storage  BIGINT,
        UNIQUE(id),
        UNIQUE(name)
    )`);
        console.log(`Created fileTable ${(0, prostgles_types_1.asName)(tableName)}`);
        await prg.refreshDBO();
    }
    /**
     * 2. Create media lookup tables
     */
    for (const refTable in referencedTables) {
        if (!this.dbo[refTable]) {
            throw `Referenced table (${refTable}) from fileTable.referencedTables prostgles init config does not exist`;
        }
        const cols = await this.dbo[refTable].getColumns();
        const tableConfig = referencedTables[refTable];
        if (typeof tableConfig !== "string") {
            for (const colName of (0, prostgles_types_1.getKeys)(tableConfig.referenceColumns)) {
                const existingCol = cols.find(c => c.name === colName);
                if (existingCol) {
                    if (existingCol.references?.some(({ ftable }) => ftable === tableName)) {
                        // All ok
                    }
                    else {
                        if (existingCol.udt_name === "uuid") {
                            try {
                                const query = `ALTER TABLE ${(0, prostgles_types_1.asName)(refTable)} ADD FOREIGN KEY (${(0, prostgles_types_1.asName)(colName)}) REFERENCES ${(0, prostgles_types_1.asName)(tableName)} (id);`;
                                console.log(`Referenced file column ${refTable} (${colName}) exists but is not referencing file table. Trying to add REFERENCE constraing...\n${query}`);
                                await runQuery(query);
                                console.log("SUCCESS: " + query);
                            }
                            catch (e) {
                                console.error(`Could not add constraing. Err: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                            }
                        }
                        else {
                            console.error(`Referenced file column ${refTable} (${colName}) exists but is not of required type (UUID). Choose a different column name or ALTER the existing column to match the type and the data found in file table ${tableName}(id)`);
                        }
                    }
                }
                else {
                    try {
                        const query = `ALTER TABLE ${(0, prostgles_types_1.asName)(refTable)} ADD COLUMN ${(0, prostgles_types_1.asName)(colName)} UUID REFERENCES ${(0, prostgles_types_1.asName)(tableName)} (id);`;
                        console.log(`Creating referenced file column ${refTable} (${colName})...\n${query}`);
                        await runQuery(query);
                        console.log("SUCCESS: " + query);
                    }
                    catch (e) {
                        console.error(`FAILED. Err: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                    }
                }
            }
        }
        else {
            const lookupTableName = await this.parseSQLIdentifier(`prostgles_lookup_${tableName}_${refTable}`);
            const pKeyFields = cols.filter(f => f.is_pkey);
            if (pKeyFields.length !== 1) {
                console.error(`Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`);
            }
            const pkField = pKeyFields[0];
            const refType = referencedTables[refTable];
            if (!this.dbo[lookupTableName]) {
                // if(!(await dbo[lookupTableName].count())) await db.any(`DROP TABLE IF EXISTS  ${lookupTableName};`);
                const action = ` (${tableName} <-> ${refTable}) join table ${lookupTableName}`; //  PRIMARY KEY
                const query = `        
        CREATE TABLE ${lookupTableName} (
          foreign_id  ${pkField.udt_name} ${refType === "one" ? " PRIMARY KEY " : ""} REFERENCES ${(0, prostgles_types_1.asName)(refTable)}(${(0, prostgles_types_1.asName)(pkField.name)}),
          media_id    UUID NOT NULL REFERENCES ${(0, prostgles_types_1.asName)(tableName)}(id)
        )
        `;
                console.log(`Creating ${action} ...`, lookupTableName);
                await runQuery(query);
                console.log(`Created ${action}`);
            }
            else {
                const cols = await this.dbo[lookupTableName].getColumns();
                const badCols = cols.filter(c => !c.references);
                await Promise.all(badCols.map(async (badCol) => {
                    console.error(`Prostgles: media ${lookupTableName} joining table has lost a reference constraint for column ${badCol.name}.` +
                        ` This may have been caused by a DROP TABLE ... CASCADE.`);
                    let q = ` ALTER TABLE ${(0, prostgles_types_1.asName)(lookupTableName)} ADD FOREIGN KEY (${badCol.name}) `;
                    console.log("Trying to add the missing constraint back");
                    if (badCol.name === "foreign_id") {
                        q += `REFERENCES ${(0, prostgles_types_1.asName)(refTable)}(${(0, prostgles_types_1.asName)(pkField.name)}) `;
                    }
                    else if (badCol.name === "media_id") {
                        q += `REFERENCES ${(0, prostgles_types_1.asName)(tableName)}(id) `;
                    }
                    if (q) {
                        try {
                            await runQuery(q);
                            console.log("Added missing constraint back");
                        }
                        catch (e) {
                            console.error("Failed to add missing constraint", e);
                        }
                    }
                }));
            }
        }
        await prg.refreshDBO();
    }
    /**
     * 4. Serve media through express
     */
    const { fileServeRoute = `/${tableName}`, expressApp: app } = fileTable;
    if (fileServeRoute.endsWith("/")) {
        throw `fileServeRoute must not end with a '/'`;
    }
    this.fileRoute = fileServeRoute;
    if (app) {
        app.get(this.fileRouteExpress, async (req, res) => {
            if (!this.dbo[tableName]) {
                res.status(500).json({ err: `Internal error: media table (${tableName}) not valid` });
                return false;
            }
            const mediaTable = this.dbo[tableName];
            try {
                const { name } = req.params;
                if (typeof name !== "string" || !name)
                    throw "Invalid media name";
                const media = await mediaTable.findOne({ name }, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1, content_type: 1 } }, { httpReq: req });
                if (!media) {
                    /**
                     * Redirect to login !??
                     */
                    // const mediaExists = await mediaTable.count({ name });
                    // if(mediaExists && this.prostgles.authHandler){
                    // } else {
                    //   throw "Invalid media";
                    // }
                    throw "Invalid media";
                }
                if (this.s3Client) {
                    let url = media.signed_url;
                    const expires = +(media.signed_url_expires || 0);
                    const EXPIRES = Date.now() + FileManager_1.HOUR;
                    if (!url || expires < EXPIRES) {
                        url = await this.getFileS3URL(media.name, 60 * 60);
                        await mediaTable.update({ name }, { signed_url: url, signed_url_expires: EXPIRES });
                    }
                    res.redirect(url);
                }
                else {
                    const pth = `${this.config.localFolderPath}/${media.name}`;
                    if (!fs.existsSync(pth)) {
                        throw new Error("File not found");
                    }
                    res.contentType(media.content_type);
                    res.sendFile(pth);
                }
            }
            catch (e) {
                console.log(e);
                res.status(404).json({ err: "Invalid/missing media" });
            }
        });
    }
}
exports.initFileManager = initFileManager;
