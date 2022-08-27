"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports._delete = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager");
async function _delete(filter, params, param3_unused, table_rules, localParams) {
    try {
        const { returning } = params || {};
        filter = filter || {};
        this.checkFilter(filter);
        // table_rules = table_rules || {};
        let forcedFilter = {}, filterFields = "*", returningFields = "*", validate;
        const { testRule = false, returnQuery = false } = localParams || {};
        if (table_rules) {
            if (!table_rules.delete)
                throw "delete rules missing";
            forcedFilter = table_rules.delete.forcedFilter;
            filterFields = table_rules.delete.filterFields;
            returningFields = table_rules.delete.returningFields;
            validate = table_rules.delete.validate;
            if (!returningFields)
                returningFields = table_rules?.select?.fields;
            if (!returningFields)
                returningFields = table_rules?.delete?.filterFields;
            if (!filterFields)
                throw ` Invalid delete rule for ${this.name}. filterFields missing `;
            /* Safely test publish rules */
            if (testRule) {
                await this.validateViewRules({ filterFields, returningFields, forcedFilter, rule: "delete" });
                return true;
            }
        }
        if (params) {
            const good_params = ["returning"];
            const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
            if (bad_params && bad_params.length)
                throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
        }
        let queryType = 'none';
        let _query = "DELETE FROM " + this.escapedName;
        const filterOpts = (await this.prepareWhere({
            filter,
            forcedFilter,
            filterFields,
            localParams,
            tableRule: table_rules
        }));
        _query += filterOpts.where;
        if (validate) {
            const _filter = filterOpts.filter;
            await validate(_filter);
        }
        let returningQuery = "";
        if (returning) {
            queryType = "any";
            if (!returningFields) {
                throw "Returning dissallowed";
            }
            returningQuery = this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
            _query += returningQuery;
        }
        if (returnQuery)
            return _query;
        /**
         * Delete file
         */
        const dbHandler = (this.t || this.db);
        if (this.is_media) {
            if (!this.dboBuilder.prostgles.fileManager)
                throw new Error("fileManager missing");
            if (this.dboBuilder.prostgles.opts.fileTable?.delayedDelete) {
                return dbHandler[queryType](`UPDATE ${(0, prostgles_types_1.asName)(this.name)} SET deleted = now() ${filterOpts.where} ${returningQuery};`);
            }
            else {
                const txDelete = async (tbl) => {
                    if (!tbl.t)
                        throw new Error("Missing transaction object t");
                    const files = await tbl.find(filterOpts.filter);
                    const fileManager = tbl.dboBuilder.prostgles.fileManager;
                    if (!fileManager)
                        throw new Error("fileManager missing");
                    for await (const file of files) {
                        await tbl.t?.any(`DELETE FROM ${(0, prostgles_types_1.asName)(this.name)} WHERE id = ` + "${id}", file);
                    }
                    /** If any table delete fails then do not delete files */
                    for await (const file of files) {
                        await fileManager.deleteFile(file.name);
                        /** TODO: Keep track of deleted files in case of failure */
                        // await tbl.t?.any(`UPDATE ${asName(this.name)} SET deleted = NOW(), deleted_from_storage = NOW()  WHERE id = ` + "${id}", file);
                    }
                    if (returning) {
                        return files.map(f => (0, PubSubManager_1.pickKeys)(f, ["id", "name"]));
                    }
                    return undefined;
                };
                if (localParams?.tx?.dbTX) {
                    return txDelete(localParams.tx.dbTX[this.name]);
                }
                else if (this.t) {
                    return txDelete(this);
                }
                else {
                    return this.dboBuilder.getTX(tx => {
                        return txDelete(tx[this.name]);
                    });
                }
            }
        }
        return dbHandler[queryType](_query).catch((err) => (0, DboBuilder_1.makeErr)(err, localParams));
    }
    catch (e) {
        // console.trace(e)
        if (localParams && localParams.testRule)
            throw e;
        throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.delete(${JSON.stringify(filter || {}, null, 2)}, ${JSON.stringify(params || {}, null, 2)})`);
    }
}
exports._delete = _delete;
;
//# sourceMappingURL=delete.js.map