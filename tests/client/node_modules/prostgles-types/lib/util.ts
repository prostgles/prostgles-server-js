import { md5 } from "./md5";

export function asName(str: string){
    if(str === null || str === undefined || !str.toString || !str.toString()) throw "Expecting a non empty string";

    return `"${str.toString().replace(/"/g, `""`)}"`;
}

export function stableStringify (data, opts) {
  if (!opts) opts = {};
  if (typeof opts === 'function') opts = { cmp: opts };
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
  return (function stringify (node) {
      if (node && node.toJSON && typeof node.toJSON === 'function') {
          node = node.toJSON();
      }

      if (node === undefined) return;
      if (typeof node == 'number') return isFinite(node) ? '' + node : 'null';
      if (typeof node !== 'object') return JSON.stringify(node);

      var i, out;
      if (Array.isArray(node)) {
          out = '[';
          for (i = 0; i < node.length; i++) {
              if (i) out += ',';
              out += stringify(node[i]) || 'null';
          }
          return out + ']';
      }

      if (node === null) return 'null';

      if (seen.indexOf(node) !== -1) {
          if (cycles) return JSON.stringify('__cycle__');
          throw new TypeError('Converting circular structure to JSON');
      }

      var seenIndex = seen.push(node) - 1;
      var keys = Object.keys(node).sort(cmp && cmp(node));
      out = '';
      for (i = 0; i < keys.length; i++) {
          var key = keys[i];
          var value = stringify(node[key]);

          if (!value) continue;
          if (out) out += ',';
          out += JSON.stringify(key) + ':' + value;
      }
      seen.splice(seenIndex, 1);
      return '{' + out + '}';
  })(data);
};


export type TextPatch = {
    from: number;
    to: number;
    text: string;
    md5: string;
}

export function getTextPatch(oldStr: string, newStr: string): TextPatch | string {

    /* Big change, no point getting diff */
    if(!oldStr || !newStr || !oldStr.trim().length || !newStr.trim().length) return newStr;

    /* Return no change if matching */
    if(oldStr === newStr) return {
        from: 0,
        to: 0,
        text: "",
        md5: md5(newStr)
    }

    function findLastIdx(direction = 1){

        let idx = direction < 1? -1 : 0, found = false;
        while(!found && Math.abs(idx) <= newStr.length){
            const args = direction < 1? [idx] : [0, idx];

            let os = oldStr.slice(...args),
                ns = newStr.slice(...args);

            if(os !== ns) found = true;
            else idx += Math.sign(direction) * 1;
        }

        return idx;
    }

    let from = findLastIdx() - 1,
        to = oldStr.length + findLastIdx(-1) + 1,
        toNew = newStr.length + findLastIdx(-1) + 1;
    return {
        from,
        to,
        text: newStr.slice(from, toNew),
        md5: md5(newStr)
    }
}


export function unpatchText(original: string, patch: TextPatch): string {
    if(!patch || typeof patch === "string") return (patch as unknown as string);
    const { from, to, text, md5: md5Hash } = patch;
    if(text === null || original === null) return text;
    let res = original.slice(0, from) + text + original.slice(to);
    if(md5Hash && md5(res) !== md5Hash) throw "Patch text error: Could not match md5 hash: (original/result) \n" + original + "\n" + res;
    return res;
}


/* Replication */
export type SyncTableInfo = { 
    id_fields: string[];
    synced_field: string;
    throttle: number;
    batch_size: number;
};

export type BasicOrderBy = {
    fieldName: string;
    asc: boolean;
}[];

export type WALConfig = SyncTableInfo & {
    /**
     * Fired when new data is added and there is no sending in progress
     */
    onSendStart?: () => any; 
    /**
     * Fired on each data send batch
     */
    onSend: (items: any[], fullItems: WALItem[]) => Promise<any>;
    /**
     * Fired after all data was sent or when a batch error is thrown
     */
    onSendEnd?: (batch: any[], fullItems: WALItem[], error?: any) => any;

    /**
     * Order by which the items will be synced. Defaults to [synced_field, ...id_fields.sort()]
     */
    orderBy?: BasicOrderBy
};
export type WALItem = {
    initial?: any;
    current: any;
};
export type WALItemsObj = { [key: string]: WALItem  };

/**
 * Used to throttle and combine updates sent to server
 * This allows a high rate of optimistic updates on the client
 */
export class WAL {
    private changed: WALItemsObj = {};
    private sending: WALItemsObj = {};
    private options: WALConfig;
    private callbacks: { cb: Function, idStrs: string[] }[] = [];
    
    constructor(args: WALConfig){
        this.options = { ...args };
        if(!this.options.orderBy){
            const { synced_field, id_fields } = args;
            this.options.orderBy = [synced_field, ...id_fields.sort()]
                .map(fieldName => ({
                    fieldName,
                    asc: true 
                }));
        }
    }

    sort = (a, b) => {
        const { orderBy } = this.options;
        return orderBy.map(ob => {
            /* TODO: add fullData to changed items + ensure orderBy is in select */
            if(!(ob.fieldName in a) || !(ob.fieldName in b)) {
                throw `Replication error: \n   some orderBy fields missing from data`;
            }
            let v1 = ob.asc? a[ob.fieldName] : b[ob.fieldName],
                v2 = ob.asc? b[ob.fieldName] : a[ob.fieldName];

            let vNum = v1 - v2,
                vStr = v1 < v2? -1 : v1 == v2? 0 : 1;
            return isNaN(vNum)? vStr : vNum
        }).find(v => v);
    }

    isSending(): boolean {
        return !(isEmpty(this.sending) && isEmpty(this.changed))
    }

    getIdStr(d: any){
        return this.options.id_fields.sort().map(key => `${d[key] || ""}`).join(".");
    }
    getIdObj(d: any){
        let res: any = {};
        this.options.id_fields.sort().map(key => {
            res[key] = d[key];
        });
        return res;
    }
    getDeltaObj(d: any){
        let res: any = {};
        Object.keys(d).map(key => {
            if(!this.options.id_fields.includes(key)){
                res[key] = d[key];
            }
        });
        return res;
    }

    addData = (data: WALItem[], cb?: (err: any) => any) => {
        if(isEmpty(this.changed) && this.options.onSendStart) this.options.onSendStart();
        let callback = cb? { cb, idStrs: [] } : null;
        data.map(d => {
            const { initial, current } = { ...d };
            if(!current) throw "Expecting { current: object, initial?: object }";
            const idStr = this.getIdStr(current);
            if(callback){
                callback.idStrs.push(idStr);
            }

            this.changed = this.changed || {};
            this.changed[idStr] = this.changed[idStr] || { initial, current };
            this.changed[idStr].current = {
                ...this.changed[idStr].current,
                ...current
            };
        });
        this.sendItems();
    }
    
    isSendingTimeout?: any = null;
    private sendItems = async () => {
        const { synced_field, onSend, onSendEnd, batch_size, throttle } = this.options;
        
        // Sending data. stop here
        if(this.isSendingTimeout || this.sending && !isEmpty(this.sending)) return;

        // Nothing to send. stop here
        if(!this.changed || isEmpty(this.changed)) return;
        
        // Prepare batch to send
        let batchItems: any[] = [], walBatch: WALItem[] = [];
        Object.keys(this.changed)
            .sort((a, b) => this.sort(this.changed[a].current, this.changed[b].current))
            .slice(0, batch_size)
            .map(key => {
                let item = { ...this.changed[key] };
                this.sending[key] = item;
                walBatch.push({ ...item })
                delete this.changed[key];
            });
            batchItems = walBatch.map(d => d.current)

        // Throttle next data send
        this.isSendingTimeout = setTimeout(() => {
            this.isSendingTimeout = undefined;
            if(!isEmpty(this.changed)){
                this.sendItems();
            }
        }, throttle);

        let error: any;
        try {
            /* Deleted data should be sent normally through await db.table.delete(...) */
            await onSend(batchItems, walBatch);//, deletedData);
            
        } catch(err) {
            error = err;
            console.error(err, batchItems, walBatch)
        }

        /* Fire any callbacks */
        if(this.callbacks.length){
            const ids = Object.keys(this.sending);
            this.callbacks.forEach((c, i)=> {
                c.idStrs = c.idStrs.filter(id => ids.includes(id));
                if(!c.idStrs.length){
                    c.cb(error);
                }
            });
            this.callbacks = this.callbacks.filter(cb => cb.idStrs.length)
        }

        this.sending = {};
        if(!isEmpty(this.changed)){
            this.sendItems();
        } else {
            if(onSendEnd) onSendEnd(batchItems, walBatch, error);
        }
    };
};

export function isEmpty(obj?: any): boolean {
    for(var v in obj) return false;
    return true;
}


/* Get nested property from an object */
export function get(obj: any, propertyPath: string | string[]): any{

    let p = propertyPath,
        o = obj;
  
    if(!obj) return obj;
    if(typeof p === "string") p = p.split(".");
    return p.reduce((xs, x) =>{ 
        if(xs && xs[x]) { 
            return xs[x] 
        } else {
            return undefined; 
        } 
    }, o);
  }