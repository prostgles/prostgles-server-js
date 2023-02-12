"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCreateTables = exports.canRunSQL = exports.runSQL = void 0;
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager");
const { ParameterizedQuery: PQ } = require('pg-promise');
async function runSQL(query, params, options, localParams) {
    if (query?.replace(/\s\s+/g, ' ').toLowerCase().includes("create extension pg_stat_statements")) {
        const { shared_preload_libraries } = await this.db.oneOrNone('SHOW shared_preload_libraries');
        if (!(shared_preload_libraries || "").includes("pg_stat_statements")) {
            throw "This query will crash the server (pg_stat_statements must be loaded via shared_preload_libraries). Need to: \n ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements' \n" +
                " AND restart server: \n    (linux) sudo service postgresql restart\n   (mac) brew services restart postgres\n ";
        }
    }
    /** Cache types */
    this.DATA_TYPES ?? (this.DATA_TYPES = await this.db.any("SELECT oid, typname FROM pg_type") ?? []);
    this.USER_TABLES ?? (this.USER_TABLES = await this.db.any(`
    SELECT relid, relname, schemaname, array_to_json(array_agg(c.column_name) FILTER (WHERE c.column_name IS NOT NULL)) as pkey_columns
    FROM pg_catalog.pg_statio_user_tables t
    LEFT JOIN (
      SELECT a.attname as column_name, i.indrelid as table_oid
      FROM   pg_index i
      JOIN   pg_attribute a ON a.attrelid = i.indrelid
        AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary
    ) c
    ON t.relid = c.table_oid
    GROUP BY relid, relname, schemaname
  `) ?? []);
    this.USER_TABLE_COLUMNS ?? (this.USER_TABLE_COLUMNS = await this.db.any(`
    SELECT t.relid, t.schemaname,t.relname, c.column_name, c.udt_name, c.ordinal_position
    FROM information_schema.columns c
    INNER JOIN pg_catalog.pg_statio_user_tables t
    ON  c.table_schema = t.schemaname AND c.table_name = t.relname 
  `));
    if (!(await (0, exports.canRunSQL)(this.prostgles, localParams)))
        throw "Not allowed to run SQL";
    const { returnType, allowListen, hasParams = true } = options || {};
    const { socket } = localParams || {};
    const db = localParams?.tx?.t || this.db;
    if (returnType === "noticeSubscription") {
        if (!socket)
            throw "Only allowed with client socket";
        return await this.prostgles.dbEventsManager?.addNotice(socket);
    }
    else if (returnType === "statement") {
        try {
            return DboBuilder_1.pgp.as.format(query, params);
        }
        catch (err) {
            throw err.toString();
        }
    }
    else if (db) {
        let finalQuery = query + "";
        if (returnType === "arrayMode" && !["listen ", "notify "].find(c => query.toLowerCase().trim().startsWith(c))) {
            finalQuery = new PQ({ text: hasParams ? DboBuilder_1.pgp.as.format(query, params) : query, rowMode: "array" });
        }
        let _qres = await db.result(finalQuery, hasParams ? params : undefined);
        const { fields, rows, command } = _qres;
        /**
         * Fallback for watchSchema in case not superuser and cannot add db event listener
         */
        const { watchSchema, watchSchemaType } = this.prostgles?.opts || {};
        if (watchSchema &&
            (!this.prostgles.isSuperUser || watchSchemaType === "prostgles_queries")) {
            if (["CREATE", "ALTER", "DROP"].includes(command)) {
                this.prostgles.onSchemaChange({ command, query });
            }
            else if (query) {
                const cleanedQuery = query.toLowerCase().replace(/\s\s+/g, ' ');
                if (PubSubManager_1.PubSubManager.SCHEMA_ALTERING_QUERIES.some(q => cleanedQuery.includes(q.toLowerCase()))) {
                    this.prostgles.onSchemaChange({ command, query });
                }
            }
        }
        if (command === "LISTEN") {
            if (!allowListen)
                throw new Error(`Your query contains a LISTEN command. Set { allowListen: true } to get subscription hooks. Or ignore this message`);
            if (!socket)
                throw "Only allowed with client socket";
            return await this.prostgles.dbEventsManager?.addNotify(query, socket);
        }
        else if (returnType === "rows") {
            return rows;
        }
        else if (returnType === "row") {
            return rows[0];
        }
        else if (returnType === "value") {
            return Object.values(rows?.[0] || {})?.[0];
        }
        else if (returnType === "values") {
            return rows.map(r => Object.values(r[0]));
        }
        else {
            let qres = {
                duration: 0,
                ..._qres,
                fields: fields?.map(f => {
                    const dataType = this.DATA_TYPES.find(dt => +dt.oid === +f.dataTypeID)?.typname ?? "text", table = this.USER_TABLES.find(t => +t.relid === +f.tableID), column = this.USER_TABLE_COLUMNS.find(c => +c.relid === +f.tableID && c.ordinal_position === f.columnID), tsDataType = (0, DboBuilder_1.postgresToTsType)(dataType);
                    return {
                        ...f,
                        tsDataType,
                        dataType,
                        udt_name: dataType,
                        tableName: table?.relname,
                        tableSchema: table?.schemaname,
                        columnName: column?.column_name
                    };
                }) ?? []
            };
            return qres;
        }
    }
    else
        console.error("db missing");
}
exports.runSQL = runSQL;
const canRunSQL = async (prostgles, localParams) => {
    if (!localParams?.socket || !localParams?.httpReq)
        return true;
    const { socket } = localParams;
    const publishParams = await prostgles.publishParser.getPublishParams({ socket });
    let res = await prostgles.opts.publishRawSQL?.(publishParams);
    return Boolean(res && typeof res === "boolean" || res === "*");
};
exports.canRunSQL = canRunSQL;
const canCreateTables = async (db) => {
    return db.any(`SELECT has_database_privilege(current_database(), 'create') as yes`).then(rows => rows?.[0].yes === true);
};
exports.canCreateTables = canCreateTables;
//# sourceMappingURL=runSQL.js.map