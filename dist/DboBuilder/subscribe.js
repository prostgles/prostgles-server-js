"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
async function subscribe(filter, params, localFunc, table_rules, localParams) {
    try {
        // if (this.is_view) throw "Cannot subscribe to a view";
        if (this.t) {
            throw "subscribe not allowed within transactions";
        }
        if (!localParams && !localFunc) {
            throw " missing data. provide -> localFunc | localParams { socket } ";
        }
        if (localParams?.socket && localFunc) {
            console.error({ localParams, localFunc });
            throw " Cannot have localFunc AND socket ";
        }
        const { filterFields, forcedFilter } = table_rules?.select || {}, filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }), condition = filterOpts.where, throttle = params?.throttle || 0, selectParams = (0, PubSubManager_1.omitKeys)(params || {}, ["throttle"]);
        /** app_triggers condition field has an index which limits it's value.
         * TODO: use condition md5 hash
         * */
        const filterSize = JSON.stringify(filter || {}).length;
        if (filterSize * 4 > 2704) {
            throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead";
        }
        if (!localFunc) {
            if (!this.dboBuilder.prostgles.isSuperUser) {
                throw "Subscribe not possible. Must be superuser to add triggers 1856";
            }
            return await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams)
                .then(async (_isValid) => {
                let viewOptions = undefined;
                if (this.is_view) {
                    const viewName = this.name;
                    const viewNameEscaped = this.escapedName;
                    const { current_schema } = await this.db.oneOrNone("SELECT current_schema");
                    /** Get list of used columns and their parent tables */
                    let { def } = (await this.db.oneOrNone("SELECT pg_get_viewdef(${viewName}) as def", { viewName }));
                    def = def.trim();
                    if (def.endsWith(";")) {
                        def = def.slice(0, -1);
                    }
                    if (!def || typeof def !== "string") {
                        throw (0, DboBuilder_1.makeErrorFromPGError)("Could get view definition");
                    }
                    const { fields } = await this.dboBuilder.dbo.sql(`SELECT * FROM ( \n ${def} \n ) prostgles_subscribe_view_definition LIMIT 0`, {});
                    const tableColumns = fields.filter(f => f.tableName && f.columnName);
                    /** Create exists filters for each table */
                    const tableIds = Array.from(new Set(tableColumns.map(tc => tc.tableID.toString())));
                    viewOptions = {
                        viewName,
                        definition: def,
                        relatedTables: []
                    };
                    viewOptions.relatedTables = await Promise.all(tableIds.map(async (tableID) => {
                        const table = this.dboBuilder.USER_TABLES?.find(t => t.relid === +tableID);
                        let tableCols = tableColumns.filter(tc => tc.tableID.toString() === tableID);
                        /** If table has primary keys and they are all in this view then use only primary keys */
                        if (table?.pkey_columns?.every(pkey => tableCols.some(c => c.columnName === pkey))) {
                            tableCols = tableCols.filter(c => table?.pkey_columns?.includes(c.columnName));
                        }
                        else {
                            /** Exclude non comparable data types */
                            tableCols = tableCols.filter(c => !["json", "xml"].includes(c.udt_name));
                        }
                        const { relname: tableName, schemaname: tableSchema } = table;
                        if (tableCols.length) {
                            const tableNameEscaped = tableSchema === current_schema ? table.relname : [tableSchema, tableName].map(v => JSON.stringify(v)).join(".");
                            const fullCondition = `EXISTS (
                  SELECT 1
                  FROM ${viewNameEscaped}
                  WHERE ${tableCols.map(c => `${tableNameEscaped}.${JSON.stringify(c.columnName)} = ${viewNameEscaped}.${JSON.stringify(c.name)}`).join(" AND \n")}
                  AND ${condition || "TRUE"}
                )`;
                            try {
                                const { count } = await this.db.oneOrNone(`
                    WITH ${(0, prostgles_types_1.asName)(tableName)} AS (
                      SELECT * 
                      FROM ${(0, prostgles_types_1.asName)(tableName)}
                      LIMIT 0
                    )

                    SELECT COUNT(*) as count
                    FROM (
                      ${def}
                    ) prostgles_view_ref_table_test
                  `);
                                const relatedTableSubscription = {
                                    tableName: tableName,
                                    tableNameEscaped,
                                    condition: fullCondition,
                                };
                                if (count.toString() === '0') {
                                    return relatedTableSubscription;
                                }
                            }
                            catch (e) {
                                (0, PubSubManager_1.log)(`Could not not override subscribed view (${this.name}) table (${tableName}). Will not check condition`, e);
                            }
                        }
                        return {
                            tableName: tableName,
                            tableNameEscaped: JSON.stringify(tableName),
                            condition: "TRUE"
                        };
                    }));
                    /** Get list of remaining used inner tables */
                    const allUsedTables = await this.db.any("SELECT distinct table_name, table_schema FROM information_schema.view_column_usage WHERE view_name = ${viewName}", { viewName });
                    /** Remaining tables will have listeners on all records (condition = "TRUE") */
                    const remainingInnerTables = allUsedTables.filter(at => !tableColumns.some(dc => dc.tableName === at.table_name && dc.tableSchema === at.table_schema));
                    viewOptions.relatedTables = [
                        ...viewOptions.relatedTables,
                        ...remainingInnerTables.map(t => ({
                            tableName: t.table_name,
                            tableNameEscaped: [t.table_name, t.table_schema].map(v => JSON.stringify(v)).join("."),
                            condition: "TRUE"
                        }))
                    ];
                    if (!viewOptions.relatedTables.length) {
                        throw "Could not subscribe to this view: no related tables found";
                    }
                }
                const { socket } = localParams ?? {};
                const pubSubManager = await this.dboBuilder.getPubSubManager();
                return pubSubManager.addSub({
                    table_info: this.tableOrViewInfo,
                    socket,
                    table_rules,
                    table_name: this.name,
                    condition: condition,
                    viewOptions,
                    func: undefined,
                    filter: { ...filter },
                    params: { ...selectParams },
                    socket_id: socket?.id,
                    throttle,
                    last_throttled: 0,
                }).then(channelName => ({ channelName }));
            });
        }
        else {
            const pubSubManager = await this.dboBuilder.getPubSubManager();
            pubSubManager.addSub({
                table_info: this.tableOrViewInfo,
                socket: undefined,
                table_rules,
                condition,
                func: localFunc,
                filter: { ...filter },
                params: { ...selectParams },
                socket_id: undefined,
                table_name: this.name,
                throttle,
                last_throttled: 0,
            }).then(channelName => ({ channelName }));
            const unsubscribe = async () => {
                const pubSubManager = await this.dboBuilder.getPubSubManager();
                pubSubManager.removeLocalSub(this.name, condition, localFunc);
            };
            let res = Object.freeze({ unsubscribe });
            return res;
        }
    }
    catch (e) {
        if (localParams && localParams.testRule)
            throw e;
        throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.subscribe()`);
    }
}
exports.subscribe = subscribe;
async function _subscribe(localFunc, table_rules, localParams) {
    if (localFunc && !localParams) {
        return {
            unsubscribe: () => { }
        };
    }
    if (localParams) {
        return "";
    }
    return {
        unsubscribe: () => { }
    };
}
const d = async () => {
    const res = await _subscribe(() => { });
    const res2 = await _subscribe(undefined, {}, {});
};
//# sourceMappingURL=subscribe.js.map