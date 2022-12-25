"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getColumns = exports.isTableHandler = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const isTableHandler = (v) => "parseUpdateRules" in v;
exports.isTableHandler = isTableHandler;
async function getColumns(lang, params, _param3, tableRules, localParams) {
    try {
        const p = this.getValidatedRules(tableRules, localParams);
        if (!p.getColumns)
            throw "Not allowed";
        // console.log("getColumns", this.name, this.columns.map(c => c.name))
        let dynamicUpdateFields;
        if (params && tableRules && (0, exports.isTableHandler)(this)) {
            if (!(0, DboBuilder_1.isPlainObject)(params) ||
                (params.data && !(0, DboBuilder_1.isPlainObject)(params.data)) ||
                !(0, DboBuilder_1.isPlainObject)(params.filter) ||
                params.rule !== "update") {
                throw "params must be { rule: 'update', filter: object, data?: object } but got: " + JSON.stringify(params);
            }
            if (!tableRules?.update) {
                dynamicUpdateFields = [];
            }
            else {
                const { data, filter } = params;
                const updateRules = await this.parseUpdateRules(filter, data, undefined, tableRules, { ...localParams, testRule: true });
                dynamicUpdateFields = updateRules.fields;
            }
        }
        const columns = this.columns
            .filter(c => {
            const { insert, select, update } = p || {};
            return [
                ...(insert?.fields || []),
                ...(select?.fields || []),
                ...(update?.fields || []),
            ].includes(c.name);
        })
            .map(_c => {
            let c = { ..._c };
            let label = c.comment || capitalizeFirstLetter(c.name, " ");
            let select = c.privileges.some(p => p.privilege_type === "SELECT"), insert = c.privileges.some(p => p.privilege_type === "INSERT"), update = c.privileges.some(p => p.privilege_type === "UPDATE"), _delete = this.tableOrViewInfo.privileges.delete; // c.privileges.some(p => p.privilege_type === "DELETE");
            delete c.privileges;
            const prostgles = this.dboBuilder?.prostgles;
            const fileConfig = prostgles.fileManager?.getColInfo({ colName: c.name, tableName: this.name });
            /** Do not allow updates to file table unless it's to delete fields */
            if (prostgles.fileManager?.config && prostgles.fileManager.tableName === this.name) {
                update = false;
            }
            const nonOrderableUD_Types = [...prostgles_types_1._PG_geometric, "xml"];
            let result = {
                ...c,
                label,
                tsDataType: (0, DboBuilder_1.postgresToTsType)(c.udt_name),
                insert: insert && Boolean(p.insert?.fields?.includes(c.name)) && tableRules?.insert?.forcedData?.[c.name] === undefined,
                select: select && Boolean(p.select?.fields?.includes(c.name)),
                orderBy: select && Boolean(p.select?.fields && p.select.orderByFields.includes(c.name)) && !nonOrderableUD_Types.includes(c.udt_name),
                filter: Boolean(p.select?.filterFields?.includes(c.name)),
                update: update && Boolean(p.update?.fields?.includes(c.name)) && tableRules?.update?.forcedData?.[c.name] === undefined,
                delete: _delete && Boolean(p.delete && p.delete.filterFields && p.delete.filterFields.includes(c.name)),
                ...(prostgles?.tableConfigurator?.getColInfo({ table: this.name, col: c.name, lang }) || {}),
                ...(fileConfig && { file: fileConfig })
            };
            if (dynamicUpdateFields) {
                result.update = dynamicUpdateFields.includes(c.name);
            }
            return result;
        }).filter(c => c.select || c.update || c.delete || c.insert);
        //.sort((a, b) => a.ordinal_position - b.ordinal_position);
        // const tblInfo = await this.getInfo();
        // if(tblInfo && tblInfo.media_table_name && tblInfo.has_media){
        //     const mediaRules = this.dboBuilder.dbo[tblInfo.media_table_name]?.
        //     return columns.concat({
        //         comment: "",
        //         data_type: "file",
        //         delete: false,
        //     });
        // }
        return columns;
    }
    catch (e) {
        throw (0, DboBuilder_1.parseError)(e, `db.${this.name}.getColumns()`);
        // throw "Something went wrong in " + `db.${this.name}.getColumns()`;
    }
}
exports.getColumns = getColumns;
function replaceNonAlphaNumeric(string, replacement = "_") {
    return string.replace(/[\W_]+/g, replacement);
}
function capitalizeFirstLetter(string, nonalpha_replacement) {
    const str = replaceNonAlphaNumeric(string, nonalpha_replacement);
    return str.charAt(0).toUpperCase() + str.slice(1);
}
//# sourceMappingURL=getColumns.js.map