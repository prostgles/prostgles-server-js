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
const FileManager_1 = require("./FileManager");
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
        this.config = prostgles.opts.tableConfig;
        this.dbo = prostgles.dbo;
        this.db = prostgles.db;
        this.prostgles = prostgles;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(Object.keys(this.config).map((tableName) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                if (!((_a = this.dbo) === null || _a === void 0 ? void 0 : _a[tableName]))
                    throw "Table not found: " + tableName;
                const tCols = (_c = (_b = this.dbo) === null || _b === void 0 ? void 0 : _b[tableName]) === null || _c === void 0 ? void 0 : _c.columns;
                const tConf = this.config[tableName];
                yield Promise.all(Object.keys(tConf).map((colName) => __awaiter(this, void 0, void 0, function* () {
                    var _d;
                    const colConf = tConf[colName];
                    const lookupConf = colConf.lookupValues;
                    const rows = lookupConf === null || lookupConf === void 0 ? void 0 : lookupConf.values;
                    if (rows === null || rows === void 0 ? void 0 : rows.length) {
                        const keys = Object.keys(((_d = rows === null || rows === void 0 ? void 0 : rows[0]) === null || _d === void 0 ? void 0 : _d.i18n) || {});
                        const lookup_table_name = yield FileManager_1.asSQLIdentifier(`lookup_${tableName}_${colName}`, this.db);
                        // const lookup_table_name = asName(`lookup_${tableName}_${colName}`);
                        yield this.db.any(`CREATE TABLE IF NOT EXISTS ${lookup_table_name} (
                        id  TEXT PRIMARY KEY
                        ${keys.length ? (", " + keys.map(k => prostgles_types_1.asName(k) + " TEXT ").join(", ")) : ""}
                    )`);
                        if (!tCols.find(c => c.name === colName)) {
                            yield this.db.any(`ALTER TABLE ${prostgles_types_1.asName(tableName)} ADD COLUMN ${prostgles_types_1.asName(colName)} TEXT ${!lookupConf.nullable ? " NOT NULL " : ""} REFERENCES ${lookup_table_name} (id)`);
                        }
                        ;
                        yield this.prostgles.refreshDBO();
                        const lcols = yield this.dbo[lookup_table_name].columns;
                        const missing_lcols = keys.filter(k => !lcols.find(lc => lc.name === k));
                        if (missing_lcols.length) {
                            yield this.db.any(`ALTER TABLE ${lookup_table_name} ${missing_lcols.map(c => `ADD COLUMN  ${c} TEXT `).join(", ")}`);
                        }
                        yield this.dbo[lookup_table_name].insert(rows.map(r => (Object.assign({ id: r.id }, r.i18n))), { onConflictDoNothing: true });
                        console.log(`TableConfig: Created ${lookup_table_name}(id) for ${tableName}(${prostgles_types_1.asName(colName)})`);
                    }
                })));
            })));
        });
    }
}
exports.default = TableConfigurator;
//# sourceMappingURL=TableConfig.js.map