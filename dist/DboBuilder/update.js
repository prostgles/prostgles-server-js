"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.update = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager");
const uploadFile_1 = require("./uploadFile");
async function update(filter, _newData, params, tableRules, localParams) {
    try {
        let oldFileDelete = () => { };
        let newData = _newData;
        if (this.is_media && (0, uploadFile_1.isFile)(newData) && (!tableRules || tableRules.insert)) {
            let existingMediaId = !(!filter || !(0, prostgles_types_1.isObject)(filter) || (0, prostgles_types_1.getKeys)(filter).join() !== "id" || typeof filter.id !== "string") ? filter.id : undefined;
            if (!existingMediaId) {
                throw new Error(`Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec"} `);
            }
            if (localParams?.testRule) {
                newData = {};
            }
            else {
                const fileManager = this.dboBuilder.prostgles.fileManager;
                if (!fileManager)
                    throw new Error("fileManager missing");
                const validate = tableRules?.update?.validate ? async (row) => {
                    return tableRules?.update?.validate({ update: row, filter });
                } : undefined;
                let existingFile = await (localParams?.dbTX?.[this.name] || this).findOne({ id: existingMediaId });
                if (!existingFile?.name)
                    throw new Error("Existing file record not found");
                // oldFileDelete = () => fileManager.deleteFile(existingFile!.name!)
                await fileManager.deleteFile(existingFile.name); //oldFileDelete();
                const newFile = await uploadFile_1.uploadFile.bind(this)(newData, validate, localParams, existingFile.id);
                newData = (0, PubSubManager_1.omitKeys)(newFile, ["id"]);
            }
        }
        else if (this.is_media && (0, prostgles_types_1.isObject)(newData) && typeof newData.name === "string") {
            throw new Error("Cannot update the 'name' field of the file. It is used in interacting with the file");
        }
        const parsedRules = await this.parseUpdateRules(filter, newData, params, tableRules, localParams);
        if (localParams?.testRule) {
            return parsedRules;
        }
        const { fields, validateRow, forcedData, finalUpdateFilter, returningFields, forcedFilter, filterFields } = parsedRules;
        let { returning, multi = true, onConflictDoNothing = false, fixIssues = false } = params || {};
        const { returnQuery = false } = localParams ?? {};
        if (params) {
            const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
            const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
            if (bad_params && bad_params.length)
                throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
        }
        const { data, allowedCols } = this.validateNewData({ row: newData, forcedData, allowedFields: fields, tableRules, fixIssues });
        /* Patch data */
        let patchedTextData = [];
        this.columns.map(c => {
            const d = data[c.name];
            if (c.data_type === "text" && d && (0, DboBuilder_1.isPlainObject)(d) && !["from", "to"].find(key => typeof d[key] !== "number")) {
                const unrecProps = Object.keys(d).filter(k => !["from", "to", "text", "md5"].includes(k));
                if (unrecProps.length)
                    throw "Unrecognised params in textPatch field: " + unrecProps.join(", ");
                patchedTextData.push({ ...d, fieldName: c.name });
            }
        });
        if (patchedTextData && patchedTextData.length) {
            if (tableRules && !tableRules.select)
                throw "Select needs to be permitted to patch data";
            const rows = await this.find(filter, { select: patchedTextData.reduce((a, v) => ({ ...a, [v.fieldName]: 1 }), {}) }, undefined, tableRules);
            if (rows.length !== 1) {
                throw "Cannot patch data within a filter that affects more/less than 1 row";
            }
            patchedTextData.map(p => {
                data[p.fieldName] = (0, prostgles_types_1.unpatchText)(rows[0][p.fieldName], p);
            });
            // https://w3resource.com/PostgreSQL/overlay-function.p hp
            //  overlay(coalesce(status, '') placing 'hom' from 2 for 0)
        }
        let nData = { ...data };
        let query = await this.colSet.getUpdateQuery(nData, allowedCols, validateRow);
        query += (await this.prepareWhere({
            filter,
            forcedFilter,
            filterFields,
            localParams,
            tableRule: tableRules
        })).where;
        if (onConflictDoNothing)
            query += " ON CONFLICT DO NOTHING ";
        let qType = "none";
        if (returning) {
            qType = multi ? "any" : "one";
            query += this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
        }
        if (returnQuery)
            return query;
        let result;
        if (this.t) {
            result = await (this.t)[qType](query).catch((err) => (0, DboBuilder_1.makeErr)(err, localParams, this, fields));
        }
        else {
            result = await this.db.tx(t => t[qType](query)).catch(err => (0, DboBuilder_1.makeErr)(err, localParams, this, fields));
        }
        /** TODO: Delete old file at the end in case new file update fails */
        // await oldFileDelete();
        return result;
    }
    catch (e) {
        if (localParams && localParams.testRule)
            throw e;
        throw { err: (0, DboBuilder_1.parseError)(e), msg: `Issue with dbo.${this.name}.update(${JSON.stringify(filter || {}, null, 2)}, ${Array.isArray(_newData) ? "...DATA[]" : "...DATA"}, ${JSON.stringify(params || {}, null, 2)})` };
    }
}
exports.update = update;
;
//# sourceMappingURL=update.js.map