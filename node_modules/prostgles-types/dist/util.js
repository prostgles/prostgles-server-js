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
exports.get = exports.isEmpty = exports.WAL = exports.unpatchText = exports.getTextPatch = exports.stableStringify = exports.asName = void 0;
const md5_1 = require("./md5");
function asName(str) {
    if (str === null || str === undefined || !str.toString || !str.toString())
        throw "Expecting a non empty string";
    return `"${str.toString().replace(/"/g, `""`)}"`;
}
exports.asName = asName;
function stableStringify(data, opts) {
    if (!opts)
        opts = {};
    if (typeof opts === 'function')
        opts = { cmp: opts };
    var cycles = (typeof opts.cycles === 'boolean') ? opts.cycles : false;
    var cmp = opts.cmp && (function (f) {
        return function (node) {
            return function (a, b) {
                var aobj = { key: a, value: node[a] };
                var bobj = { key: b, value: node[b] };
                return f(aobj, bobj);
            };
        };
    })(opts.cmp);
    var seen = [];
    return (function stringify(node) {
        if (node && node.toJSON && typeof node.toJSON === 'function') {
            node = node.toJSON();
        }
        if (node === undefined)
            return;
        if (typeof node == 'number')
            return isFinite(node) ? '' + node : 'null';
        if (typeof node !== 'object')
            return JSON.stringify(node);
        var i, out;
        if (Array.isArray(node)) {
            out = '[';
            for (i = 0; i < node.length; i++) {
                if (i)
                    out += ',';
                out += stringify(node[i]) || 'null';
            }
            return out + ']';
        }
        if (node === null)
            return 'null';
        if (seen.indexOf(node) !== -1) {
            if (cycles)
                return JSON.stringify('__cycle__');
            throw new TypeError('Converting circular structure to JSON');
        }
        var seenIndex = seen.push(node) - 1;
        var keys = Object.keys(node).sort(cmp && cmp(node));
        out = '';
        for (i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = stringify(node[key]);
            if (!value)
                continue;
            if (out)
                out += ',';
            out += JSON.stringify(key) + ':' + value;
        }
        seen.splice(seenIndex, 1);
        return '{' + out + '}';
    })(data);
}
exports.stableStringify = stableStringify;
;
function getTextPatch(oldStr, newStr) {
    if (!oldStr || !newStr || !oldStr.trim().length || !newStr.trim().length)
        return newStr;
    if (oldStr === newStr)
        return {
            from: 0,
            to: 0,
            text: "",
            md5: md5_1.md5(newStr)
        };
    function findLastIdx(direction = 1) {
        let idx = direction < 1 ? -1 : 0, found = false;
        while (!found && Math.abs(idx) <= newStr.length) {
            const args = direction < 1 ? [idx] : [0, idx];
            let os = oldStr.slice(...args), ns = newStr.slice(...args);
            if (os !== ns)
                found = true;
            else
                idx += Math.sign(direction) * 1;
        }
        return idx;
    }
    let from = findLastIdx() - 1, to = oldStr.length + findLastIdx(-1) + 1, toNew = newStr.length + findLastIdx(-1) + 1;
    return {
        from,
        to,
        text: newStr.slice(from, toNew),
        md5: md5_1.md5(newStr)
    };
}
exports.getTextPatch = getTextPatch;
function unpatchText(original, patch) {
    if (!patch || typeof patch === "string")
        return patch;
    const { from, to, text, md5: md5Hash } = patch;
    if (text === null || original === null)
        return text;
    let res = original.slice(0, from) + text + original.slice(to);
    if (md5Hash && md5_1.md5(res) !== md5Hash)
        throw "Patch text error: Could not match md5 hash: (original/result) \n" + original + "\n" + res;
    return res;
}
exports.unpatchText = unpatchText;
class WAL {
    constructor(args) {
        this.changed = {};
        this.sending = {};
        this.callbacks = [];
        this.sort = (a, b) => {
            const { orderBy } = this.options;
            return orderBy.map(ob => {
                if (!(ob.fieldName in a) || !(ob.fieldName in b)) {
                    throw `Replication error: \n   some orderBy fields missing from data`;
                }
                let v1 = ob.asc ? a[ob.fieldName] : b[ob.fieldName], v2 = ob.asc ? b[ob.fieldName] : a[ob.fieldName];
                let vNum = v1 - v2, vStr = v1 < v2 ? -1 : v1 == v2 ? 0 : 1;
                return isNaN(vNum) ? vStr : vNum;
            }).find(v => v);
        };
        this.addData = (data, cb) => {
            if (isEmpty(this.changed) && this.options.onSendStart)
                this.options.onSendStart();
            let callback = cb ? { cb, idStrs: [] } : null;
            data.map(d => {
                const { initial, current } = Object.assign({}, d);
                if (!current)
                    throw "Expecting { current: object, initial?: object }";
                const idStr = this.getIdStr(current);
                if (callback) {
                    callback.idStrs.push(idStr);
                }
                this.changed = this.changed || {};
                this.changed[idStr] = this.changed[idStr] || { initial, current };
                this.changed[idStr].current = Object.assign(Object.assign({}, this.changed[idStr].current), current);
            });
            this.sendItems();
        };
        this.isSendingTimeout = null;
        this.sendItems = () => __awaiter(this, void 0, void 0, function* () {
            const { synced_field, onSend, onSendEnd, batch_size, throttle } = this.options;
            if (this.isSendingTimeout || this.sending && !isEmpty(this.sending))
                return;
            if (!this.changed || isEmpty(this.changed))
                return;
            let batchItems = [], walBatch = [];
            Object.keys(this.changed)
                .sort((a, b) => this.sort(this.changed[a].current, this.changed[b].current))
                .slice(0, batch_size)
                .map(key => {
                let item = Object.assign({}, this.changed[key]);
                this.sending[key] = item;
                walBatch.push(Object.assign({}, item));
                delete this.changed[key];
            });
            batchItems = walBatch.map(d => d.current);
            this.isSendingTimeout = setTimeout(() => {
                this.isSendingTimeout = undefined;
                if (!isEmpty(this.changed)) {
                    this.sendItems();
                }
            }, throttle);
            let error;
            try {
                yield onSend(batchItems, walBatch);
            }
            catch (err) {
                error = err;
                console.error(err, batchItems, walBatch);
            }
            if (this.callbacks.length) {
                const ids = Object.keys(this.sending);
                this.callbacks.forEach((c, i) => {
                    c.idStrs = c.idStrs.filter(id => ids.includes(id));
                    if (!c.idStrs.length) {
                        c.cb(error);
                    }
                });
                this.callbacks = this.callbacks.filter(cb => cb.idStrs.length);
            }
            this.sending = {};
            if (!isEmpty(this.changed)) {
                this.sendItems();
            }
            else {
                if (onSendEnd)
                    onSendEnd(batchItems, walBatch, error);
            }
        });
        this.options = Object.assign({}, args);
        if (!this.options.orderBy) {
            const { synced_field, id_fields } = args;
            this.options.orderBy = [synced_field, ...id_fields.sort()]
                .map(fieldName => ({
                fieldName,
                asc: true
            }));
        }
    }
    isSending() {
        return !(isEmpty(this.sending) && isEmpty(this.changed));
    }
    getIdStr(d) {
        return this.options.id_fields.sort().map(key => `${d[key] || ""}`).join(".");
    }
    getIdObj(d) {
        let res = {};
        this.options.id_fields.sort().map(key => {
            res[key] = d[key];
        });
        return res;
    }
    getDeltaObj(d) {
        let res = {};
        Object.keys(d).map(key => {
            if (!this.options.id_fields.includes(key)) {
                res[key] = d[key];
            }
        });
        return res;
    }
}
exports.WAL = WAL;
;
function isEmpty(obj) {
    for (var v in obj)
        return false;
    return true;
}
exports.isEmpty = isEmpty;
function get(obj, propertyPath) {
    let p = propertyPath, o = obj;
    if (!obj)
        return obj;
    if (typeof p === "string")
        p = p.split(".");
    return p.reduce((xs, x) => {
        if (xs && xs[x]) {
            return xs[x];
        }
        else {
            return undefined;
        }
    }, o);
}
exports.get = get;
//# sourceMappingURL=util.js.map