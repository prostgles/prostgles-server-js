"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("./PubSubManager");
/**
 * Will be run between initSQL and fileTable
 */
class TableConfigurator {
    constructor(prostgles) {
        this.getColInfo = (params) => {
            var _a, _b;
            return (_b = (_a = this.config[params.table]) === null || _a === void 0 ? void 0 : _a[params.col]) === null || _b === void 0 ? void 0 : _b.info;
        };
        this.checkColVal = (params) => {
            const conf = this.getColInfo(params);
            if (conf) {
                const { value } = params;
                const { min, max } = conf;
                if (min !== undefined && value !== undefined && value < min)
                    throw `${params.col} must be less than ${min}`;
                if (max !== undefined && value !== undefined && value > max)
                    throw `${params.col} must be greater than ${max}`;
            }
        };
        this.getJoinInfo = (sourceTable, targetTable) => {
            if (sourceTable in this.config &&
                this.config[sourceTable] &&
                "columns" in this.config[sourceTable]) {
                const td = this.config[sourceTable];
                if ("columns" in td && td.columns[targetTable]) {
                    const cd = td.columns[targetTable];
                    if ("joinDef" in cd) {
                        const { joinDef } = cd;
                        const res = {
                            expectOne: false,
                            paths: joinDef.map(({ sourceTable, targetTable: table, on }) => ({
                                source: sourceTable,
                                target: targetTable,
                                table,
                                on
                            })),
                        };
                        return res;
                    }
                }
            }
            return undefined;
        };
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }
    get dbo() { return this.prostgles.dbo; }
    ;
    get db() { return this.prostgles.db; }
    ;
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            let queries = [];
            /* Create lookup tables */
            Object.keys(this.config).map(tableName => {
                var _a, _b, _c;
                const tableConf = this.config[tableName];
                const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
                if (dropIfExistsCascade) {
                    queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
                }
                else if (dropIfExists) {
                    queries.push(`DROP TABLE IF EXISTS ${tableName} ;`);
                }
                if ("isLookupTable" in tableConf && Object.keys((_a = tableConf.isLookupTable) === null || _a === void 0 ? void 0 : _a.values).length) {
                    const rows = Object.keys((_b = tableConf.isLookupTable) === null || _b === void 0 ? void 0 : _b.values).map(id => { var _a; return (Object.assign({ id }, ((_a = tableConf.isLookupTable) === null || _a === void 0 ? void 0 : _a.values[id]))); });
                    if (dropIfExists || dropIfExistsCascade || !((_c = this.dbo) === null || _c === void 0 ? void 0 : _c[tableName])) {
                        const keys = Object.keys(rows[0]).filter(k => k !== "id");
                        queries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (
                        id  TEXT PRIMARY KEY
                        ${keys.length ? (", " + keys.map(k => prostgles_types_1.asName(k) + " TEXT ").join(", ")) : ""}
                    );`);
                        rows.map(row => {
                            const values = this.prostgles.pgp.helpers.values(row);
                            queries.push(this.prostgles.pgp.as.format(`INSERT INTO ${tableName}  (${["id", ...keys].map(t => prostgles_types_1.asName(t)).join(", ")})  ` + " VALUES ${values:raw} ;", { values }));
                        });
                        // console.log("Created lookup table " + tableName)
                    }
                }
            });
            if (queries.length) {
                const q = queries.join("\n");
                console.log("TableConfig: \n", q);
                yield this.db.multi(q);
                yield this.prostgles.refreshDBO();
            }
            queries = [];
            /* Create referenced columns */
            yield Promise.all(Object.keys(this.config).map((tableName) => __awaiter(this, void 0, void 0, function* () {
                const tableConf = this.config[tableName];
                if ("columns" in tableConf) {
                    const getColDef = (name, colConf) => {
                        if ("references" in colConf && colConf.references) {
                            const { nullable, tableName: lookupTable, columnName: lookupCol = "id", defaultValue } = colConf.references;
                            return ` ${prostgles_types_1.asName(name)} TEXT ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${PubSubManager_1.asValue(defaultValue)} ` : ""} REFERENCES ${lookupTable} (${lookupCol}) `;
                        }
                        else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {
                            return ` ${prostgles_types_1.asName(name)} ${colConf.sqlDefinition} `;
                        }
                    };
                    const colDefs = [];
                    Object.keys(tableConf.columns).map(colName => {
                        const colConf = tableConf.columns[colName];
                        if (!this.dbo[tableName]) {
                            colDefs.push(getColDef(colName, colConf));
                        }
                        else if (!colDefs.length && !this.dbo[tableName].columns.find(c => colName === c.name)) {
                            if ("references" in colConf && colConf.references) {
                                const { tableName: lookupTable, } = colConf.references;
                                queries.push(`
                                ALTER TABLE ${prostgles_types_1.asName(tableName)} 
                                ADD COLUMN ${getColDef(colName, colConf)};
                            `);
                                console.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);
                            }
                            else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {
                                queries.push(`
                                ALTER TABLE ${prostgles_types_1.asName(tableName)} 
                                ADD COLUMN ${getColDef(colName, colConf)};
                            `);
                                console.log(`TableConfigurator: created/added column ${tableName}(${colName}) ` + colConf.sqlDefinition);
                            }
                        }
                    });
                    if (colDefs.length) {
                        queries.push(`CREATE TABLE ${prostgles_types_1.asName(tableName)} (
                        ${colDefs.join(", \n")}
                    );`);
                        console.error("TableConfigurator: Created table: \n" + queries[0]);
                    }
                }
                if ("constraints" in tableConf && tableConf.constraints) {
                    Object.keys(tableConf.constraints).map(constraintName => {
                        queries.push(`ALTER TABLE ${prostgles_types_1.asName(tableName)} ADD CONSTRAINT ${prostgles_types_1.asName(constraintName)} ${tableConf.constraints[constraintName]} ;`);
                    });
                }
            })));
            if (queries.length) {
                const q = queries.join("\n");
                console.log("TableConfig: \n", q);
                yield this.db.multi(q);
            }
        });
    }
}
exports.default = TableConfigurator;
function columnExists(args) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const { db, tableName, colName } = args;
        return Boolean((_a = (yield db.oneOrNone(`
        SELECT column_name, table_name
        FROM information_schema.columns 
        WHERE table_name=${PubSubManager_1.asValue(tableName)} and column_name=${PubSubManager_1.asValue(colName)}
        LIMIT 1;
    `))) === null || _a === void 0 ? void 0 : _a.column_name);
    });
}
//# sourceMappingURL=TableConfig.js.map