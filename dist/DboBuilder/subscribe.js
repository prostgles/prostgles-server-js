"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribe = void 0;
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const getSubscribeRelatedTables_1 = require("./getSubscribeRelatedTables");
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
        if (!this.dboBuilder.prostgles.isSuperUser) {
            throw "Subscribe not possible. Must be superuser to add triggers 1856";
        }
        /** Ensure request is valid */
        await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams);
        const viewOptions = await getSubscribeRelatedTables_1.getSubscribeRelatedTables.bind(this)({ filter, selectParams, table_rules, localParams, condition, filterOpts });
        const commonSubOpts = {
            table_info: this.tableOrViewInfo,
            viewOptions,
            table_rules,
            condition,
            table_name: this.name,
            filter: { ...filter },
            params: { ...selectParams },
            throttle,
            last_throttled: 0,
        };
        if (!localFunc) {
            const { socket } = localParams ?? {};
            const pubSubManager = await this.dboBuilder.getPubSubManager();
            return pubSubManager.addSub({
                ...commonSubOpts,
                socket,
                func: undefined,
                socket_id: socket?.id,
            }).then(channelName => ({ channelName }));
        }
        else {
            const pubSubManager = await this.dboBuilder.getPubSubManager();
            pubSubManager.addSub({
                ...commonSubOpts,
                socket: undefined,
                func: localFunc,
                socket_id: undefined,
            }).then(channelName => ({ channelName }));
            const unsubscribe = async () => {
                const pubSubManager = await this.dboBuilder.getPubSubManager();
                pubSubManager.removeLocalSub(this.name, condition, localFunc);
            };
            const res = Object.freeze({ unsubscribe });
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
//# sourceMappingURL=subscribe.js.map