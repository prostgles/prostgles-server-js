import pgPromise from "pg-promise";
import { AnyObject, asName, DeleteParams, FieldFilter, getKeys, InsertParams, isDefined, isObject, Select, SelectParams, SubscribeParams, UpdateParams } from "prostgles-types";
import { DboBuilder, Filter, LocalParams, makeErr, parseError, TableHandlers, TableSchema } from "../DboBuilder";
import { DB } from "../Prostgles";
import { SyncRule, TableRule, UpdateRule, ValidateRow, ValidateUpdateRow } from "../PublishParser";
import { omitKeys } from "../PubSubManager";
import { _delete } from "./delete";
import { insert } from "./insert";
import { insertDataParse } from "./insertDataParse";
import { SelectItem, SelectItemBuilder } from "./QueryBuilder/QueryBuilder";
import { update } from "./update";
import { JoinPaths, ViewHandler } from "./ViewHandler";
import { parseUpdateRules } from "./parseUpdateRules";
import { COMPUTED_FIELDS, FUNCTIONS } from "./QueryBuilder/Functions";


type ValidatedParams = {
  row: AnyObject;
  forcedData?: AnyObject;
  allowedFields?: FieldFilter;
  tableRules?: TableRule;
  fixIssues: boolean;
}

export class TableHandler extends ViewHandler {
  io_stats: {
    throttle_queries_per_sec: number;
    since: number,
    queries: number,
    batching: string[] | null
  }

  constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TableHandlers, joinPaths?: JoinPaths) {
    super(db, tableOrViewInfo, dboBuilder, t, dbTX, joinPaths);

    this.remove = this.delete;

    this.io_stats = {
      since: Date.now(),
      queries: 0,
      throttle_queries_per_sec: 500,
      batching: null
    };
    this.is_view = false;
    this.is_media = dboBuilder.prostgles.isMedia(this.name)
  }

  /* TO DO: Maybe finished query batching */
  willBatch(query: string) {
    const now = Date.now();
    if (this.io_stats.since < Date.now()) {
      this.io_stats.since = Date.now();
      this.io_stats.queries = 0;
    } else {
      this.io_stats.queries++;
    }

    if (this.io_stats.queries > this.io_stats.throttle_queries_per_sec) {

      return true;
    }
  }

  async subscribe(filter: Filter, params: SubscribeParams, localFunc: (items: AnyObject[]) => any): Promise<{ unsubscribe: () => any }>
  async subscribe(filter: Filter, params: SubscribeParams, localFunc?: (items: AnyObject[]) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>
  async subscribe(filter: Filter, params: SubscribeParams = {}, localFunc?: (items: AnyObject[]) => any, table_rules?: TableRule, localParams?: LocalParams):
    Promise<string | { unsubscribe: () => any }> {
    try {
      if (this.is_view) throw "Cannot subscribe to a view";
      if (this.t) throw "subscribe not allowed within transactions";
      if (!localParams && !localFunc) throw " missing data. provide -> localFunc | localParams { socket } ";
      if (localParams && localParams.socket && localFunc) {
        console.error({ localParams, localFunc })
        throw " Cannot have localFunc AND socket ";
      }

      const { filterFields, forcedFilter } = table_rules?.select || {},
        filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }),
        condition = filterOpts.where,
        throttle = params?.throttle || 0,
        selectParams = omitKeys(params || {}, ["throttle"]);
 
      /** app_triggers condition field has an index which limits it's value */
      const filterSize = JSON.stringify(filter || {}).length;
      if (filterSize * 4 > 2704) {
        throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead"
      }

      if (!localFunc) {
        if (!this.dboBuilder.prostgles.isSuperUser) throw "Subscribe not possible. Must be superuser to add triggers 1856";
        return await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams)
          .then(async isValid => {

            const { socket } = localParams ?? {};
            const pubSubManager = await this.dboBuilder.getPubSubManager();
            return pubSubManager.addSub({
              table_info: this.tableOrViewInfo,
              socket,
              table_rules,
              condition: condition,
              func: undefined,
              filter: { ...filter },
              params: { ...selectParams },
              socket_id: socket?.id,
              table_name: this.name,
              throttle,
              last_throttled: 0, 
            }).then(channelName => ({ channelName }));
          }) as string;
      } else {
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
          pubSubManager.removeLocalSub(this.name, condition, localFunc)
        };
        let res: { unsubscribe: () => any } = Object.freeze({ unsubscribe })
        return res;
      }
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.subscribe()`);
    }
  }

  /* This should only be called from server */
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any): Promise<{ unsubscribe: () => any }>
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>
  subscribeOne(filter: Filter, params: SubscribeParams = {}, localFunc: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams):
    Promise<string | { unsubscribe: () => any }> {
    let func = localParams ? undefined : (rows: AnyObject[]) => localFunc(rows[0]);
    return this.subscribe(filter, { ...params, limit: 2 }, func, table_rules, localParams);
  }


  async updateBatch(data: [Filter, AnyObject][], params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any> {
    try {
      const queries = await Promise.all(
        data.map(async ([filter, data]) =>
          await this.update(
            filter,
            data,
            { ...(params || {}), returning: undefined },
            tableRules,
            { ...(localParams || {}), returnQuery: true }
          )
        )
      );
      const keys = (data && data.length) ? Object.keys(data[0]) : [];
      return this.db.tx(t => {
        const _queries = queries.map(q => t.none(q as unknown as string))
        return t.batch(_queries)
      }).catch(err => makeErr(err, localParams, this, keys));
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.update()`);
    }
  }

  parseUpdateRules = parseUpdateRules.bind(this);
  
  update = update.bind(this);

  validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }: ValidatedParams): { data: any; allowedCols: string[] } {
    const synced_field = (tableRules ?? {})?.sync?.synced_field;

    /* Update synced_field if sync is on and missing */
    if (synced_field && !row[synced_field]) {
      row[synced_field] = Date.now();
    }

    let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
    const dataKeys = getKeys(data);

    dataKeys.map(col => {
      this.dboBuilder.prostgles?.tableConfigurator?.checkColVal({ table: this.name, col, value: data[col] });
      const colConfig = this.dboBuilder.prostgles?.tableConfigurator?.getColumnConfig(this.name, col);
      if (colConfig && isObject(colConfig) && "isText" in colConfig && data[col]) {
        if (colConfig.lowerCased) {
          data[col] = data[col].toString().toLowerCase()
        }
        if (colConfig.trimmed) {
          data[col] = data[col].toString().trim()
        }
      }
    })

    return { data, allowedCols: this.columns.filter(c => dataKeys.includes(c.name)).map(c => c.name) }
  }

  insertDataParse = insertDataParse;
  async insert(rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, _localParams?: LocalParams): Promise<any | any[] | boolean> {
    return insert.bind(this)(rowOrRows, param2, param3_unused, tableRules, _localParams)
  }

  prepareReturning = async (returning: Select | undefined, allowedFields: string[]): Promise<SelectItem[]> => {
    let result: SelectItem[] = [];
    if (returning) {
      let sBuilder = new SelectItemBuilder({
        allFields: this.column_names.slice(0),
        allowedFields,
        allowedOrderByFields: allowedFields,
        computedFields: COMPUTED_FIELDS,
        functions: FUNCTIONS.filter(f => f.type === "function" && f.singleColArg),
        isView: this.is_view,
        columns: this.columns,
      });
      await sBuilder.parseUserSelect(returning);

      return sBuilder.select;
    }

    return result;
  }

  makeReturnQuery(items?: SelectItem[]) {
    if (items?.length) return " RETURNING " + items.map(s => s.getQuery() + " AS " + asName(s.alias)).join(", ");
    return "";
  }

  async delete(filter?: Filter, params?: DeleteParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
    return _delete.bind(this)(filter, params, param3_unused, table_rules, localParams);
  };

  remove(filter: Filter, params?: UpdateParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams) {
    return this.delete(filter, params, param3_unused, tableRules, localParams);
  }

  async upsert(filter: Filter, newData: AnyObject, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
    try {
      /* Do it within a transaction to ensure consisency */
      if (!this.t) {
        return this.dboBuilder.getTX(dbTX => _upsert(dbTX[this.name] as TableHandler))
      } else {
        return _upsert(this);
      }

      async function _upsert(tblH: TableHandler) {
        return tblH.find(filter, { select: "", limit: 1 }, undefined, table_rules, localParams)
          .then(exists => {
            if (exists && exists.length) {
              return tblH.update(filter, newData, params, table_rules, localParams);
            } else {
              return tblH.insert({ ...newData, ...filter }, params, undefined, table_rules, localParams);
            }
          });
      }
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.upsert()`);
    }
  };

  /* External request. Cannot sync from server */
  async sync(filter: Filter, params: SelectParams, param3_unused: undefined, table_rules: TableRule, localParams: LocalParams) {
    if (!localParams) throw "Sync not allowed within the same server code";
    const { socket } = localParams;
    if (!socket) throw "INTERNAL ERROR: socket missing";


    if (!table_rules || !table_rules.sync || !table_rules.select) throw "INTERNAL ERROR: sync or select rules missing";

    if (this.t) throw "Sync not allowed within transactions";

    const ALLOWED_PARAMS = ["select"];
    const invalidParams = Object.keys(params || {}).filter(k => !ALLOWED_PARAMS.includes(k));
    if (invalidParams.length) throw "Invalid or dissallowed params found: " + invalidParams.join(", ");

    try {


      let { id_fields, synced_field, allow_delete }: SyncRule = table_rules.sync;
      const syncFields = [...id_fields, synced_field];

      if (!id_fields || !synced_field) {
        const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
        console.error(err);
        throw err;
      }

      id_fields = this.parseFieldFilter(id_fields, false);

      let allowedSelect = this.parseFieldFilter(table_rules?.select.fields ?? false);
      if (syncFields.find(f => !allowedSelect.includes(f))) {
        throw `INTERNAL ERROR: sync field missing from publish.${this.name}.select.fields`;
      }
      let select = this.getAllowedSelectFields(
        (params || {})?.select || "*",
        allowedSelect,
        false
      );
      if (!select.length) throw "Empty select not allowed";

      /* Add sync fields if missing */
      syncFields.map(sf => {
        if (!select.includes(sf)) select.push(sf);
      });

      /* Step 1: parse command and params */
      return this.find(filter, { select, limit: 0 }, undefined, table_rules, localParams)
        .then(async isValid => {

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

    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.sync()`);
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