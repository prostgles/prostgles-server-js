"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TableHandler = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const delete_1 = require("./delete");
const insert_1 = require("./insert");
const insertDataParse_1 = require("./insertDataParse");
const QueryBuilder_1 = require("./QueryBuilder/QueryBuilder");
const update_1 = require("./update");
const ViewHandler_1 = require("./ViewHandler");
const parseUpdateRules_1 = require("./parseUpdateRules");
const Functions_1 = require("./QueryBuilder/Functions");
class TableHandler extends ViewHandler_1.ViewHandler {
    constructor(db, tableOrViewInfo, dboBuilder, t, dbTX, joinPaths) {
        super(db, tableOrViewInfo, dboBuilder, t, dbTX, joinPaths);
        this.parseUpdateRules = parseUpdateRules_1.parseUpdateRules.bind(this);
        this.update = update_1.update.bind(this);
        this.insertDataParse = insertDataParse_1.insertDataParse;
        this.prepareReturning = async (returning, allowedFields) => {
            const result = [];
            if (returning) {
                const sBuilder = new QueryBuilder_1.SelectItemBuilder({
                    allFields: this.column_names.slice(0),
                    allowedFields,
                    allowedOrderByFields: allowedFields,
                    computedFields: Functions_1.COMPUTED_FIELDS,
                    functions: Functions_1.FUNCTIONS.filter(f => f.type === "function" && f.singleColArg),
                    isView: this.is_view,
                    columns: this.columns,
                });
                await sBuilder.parseUserSelect(returning);
                return sBuilder.select;
            }
            return result;
        };
        this.remove = this.delete;
        this.io_stats = {
            since: Date.now(),
            queries: 0,
            throttle_queries_per_sec: 500,
            batching: null
        };
        this.is_view = false;
        this.is_media = dboBuilder.prostgles.isMedia(this.name);
    }
    /* TO DO: Maybe finished query batching */
    willBatch(query) {
        const now = Date.now();
        if (this.io_stats.since < Date.now()) {
            this.io_stats.since = Date.now();
            this.io_stats.queries = 0;
        }
        else {
            this.io_stats.queries++;
        }
        if (this.io_stats.queries > this.io_stats.throttle_queries_per_sec) {
            return true;
        }
    }
    async updateBatch(data, params, tableRules, localParams) {
        try {
            const queries = await Promise.all(data.map(async ([filter, data]) => await this.update(filter, data, { ...(params || {}), returning: undefined }, tableRules, { ...(localParams || {}), returnQuery: true })));
            return this.db.tx(t => {
                const _queries = queries.map(q => t.none(q));
                return t.batch(_queries);
            }).catch(err => (0, DboBuilder_1.makeErrorFromPGError)(err, localParams, this, []));
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.update()`);
        }
    }
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }) {
        const synced_field = (tableRules ?? {})?.sync?.synced_field;
        /* Update synced_field if sync is on and missing */
        if (synced_field && !row[synced_field]) {
            row[synced_field] = Date.now();
        }
        const data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = (0, prostgles_types_1.getKeys)(data);
        dataKeys.map(col => {
            this.dboBuilder.prostgles?.tableConfigurator?.checkColVal({ table: this.name, col, value: data[col] });
            const colConfig = this.dboBuilder.prostgles?.tableConfigurator?.getColumnConfig(this.name, col);
            if (colConfig && (0, prostgles_types_1.isObject)(colConfig) && "isText" in colConfig && data[col]) {
                if (colConfig.lowerCased) {
                    data[col] = data[col].toString().toLowerCase();
                }
                if (colConfig.trimmed) {
                    data[col] = data[col].toString().trim();
                }
            }
        });
        return { data, allowedCols: this.columns.filter(c => dataKeys.includes(c.name)).map(c => c.name) };
    }
    async insert(rowOrRows, param2, param3_unused, tableRules, _localParams) {
        return insert_1.insert.bind(this)(rowOrRows, param2, param3_unused, tableRules, _localParams);
    }
    makeReturnQuery(items) {
        if (items?.length)
            return " RETURNING " + items.map(s => s.getQuery() + " AS " + (0, prostgles_types_1.asName)(s.alias)).join(", ");
        return "";
    }
    async delete(filter, params, param3_unused, table_rules, localParams) {
        return delete_1._delete.bind(this)(filter, params, param3_unused, table_rules, localParams);
    }
    remove(filter, params, param3_unused, tableRules, localParams) {
        return this.delete(filter, params, param3_unused, tableRules, localParams);
    }
    async upsert(filter, newData, params, table_rules, localParams) {
        try {
            const _upsert = async function (tblH) {
                return tblH.find(filter, { select: "", limit: 1 }, undefined, table_rules, localParams)
                    .then(exists => {
                    if (exists && exists.length) {
                        return tblH.update(filter, newData, params, table_rules, localParams);
                    }
                    else {
                        return tblH.insert({ ...newData, ...filter }, params, undefined, table_rules, localParams);
                    }
                });
            };
            /* Do it within a transaction to ensure consisency */
            if (!this.t) {
                return this.dboBuilder.getTX(dbTX => _upsert(dbTX[this.name]));
            }
            else {
                return _upsert(this);
            }
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.upsert()`);
        }
    }
    /* External request. Cannot sync from server */
    async sync(filter, params, param3_unused, table_rules, localParams) {
        if (!localParams)
            throw "Sync not allowed within the same server code";
        const { socket } = localParams;
        if (!socket)
            throw "INTERNAL ERROR: socket missing";
        if (!table_rules || !table_rules.sync || !table_rules.select)
            throw "INTERNAL ERROR: sync or select rules missing";
        if (this.t)
            throw "Sync not allowed within transactions";
        const ALLOWED_PARAMS = ["select"];
        const invalidParams = Object.keys(params || {}).filter(k => !ALLOWED_PARAMS.includes(k));
        if (invalidParams.length)
            throw "Invalid or dissallowed params found: " + invalidParams.join(", ");
        try {
            const { synced_field, allow_delete } = table_rules.sync;
            if (!table_rules.sync.id_fields.length || !synced_field) {
                const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
                console.error(err);
                throw err;
            }
            const id_fields = this.parseFieldFilter(table_rules.sync.id_fields, false);
            const syncFields = [...id_fields, synced_field];
            const allowedSelect = this.parseFieldFilter(table_rules?.select.fields ?? false);
            if (syncFields.find(f => !allowedSelect.includes(f))) {
                throw `INTERNAL ERROR: sync field missing from publish.${this.name}.select.fields`;
            }
            const select = this.getAllowedSelectFields(params?.select ?? "*", allowedSelect, false);
            if (!select.length)
                throw "Empty select not allowed";
            /* Add sync fields if missing */
            syncFields.map(sf => {
                if (!select.includes(sf))
                    select.push(sf);
            });
            /* Step 1: parse command and params */
            return this.find(filter, { select, limit: 0 }, undefined, table_rules, localParams)
                .then(async (_isValid) => {
                const { filterFields, forcedFilter } = table_rules?.select || {};
                const condition = (await this.prepareWhere({ filter, forcedFilter, filterFields, addKeywords: false, localParams, tableRule: table_rules })).where;
                // let final_filter = getFindFilter(filter, table_rules);
                const pubSubManager = await this.dboBuilder.getPubSubManager();
                return pubSubManager.addSync({
                    table_info: this.tableOrViewInfo,
                    condition,
                    id_fields, synced_field,
                    allow_delete,
                    socket,
                    table_rules,
                    filter: { ...filter },
                    params: { select }
                }).then(channelName => ({ channelName, id_fields, synced_field }));
            });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.sync()`);
        }
        /*
        REPLICATION
    
            1 Sync proccess (NO DELETES ALLOWED):
    
                Client sends:
                    "sync-request"
                    { min_id, max_id, count, max_synced }
    
                    Server sends:
                        "sync-pull"
                        { from_synced }
    
                    Client sends:
                        "sync-push"
                        { data } -> WHERE synced >= from_synced
    
                    Server upserts:
                        WHERE not exists synced = synced AND id = id
                        UNTIL
    
                    Server sends
                        "sync-push"
                        { data } -> WHERE synced >= from_synced
            */
    }
}
exports.TableHandler = TableHandler;
//# sourceMappingURL=TableHandler.js.map