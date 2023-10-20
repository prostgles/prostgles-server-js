import pgPromise from "pg-promise";
import { AnyObject, asName, DeleteParams, FieldFilter, getKeys, InsertParams, isObject, Select, UpdateParams } from "prostgles-types";
import { DboBuilder, Filter, LocalParams, parseError, TableHandlers, TableSchema } from "../../DboBuilder";
import { DB } from "../../Prostgles";
import { SyncRule, TableRule } from "../../PublishParser";
import { _delete } from "../delete";
import { parseUpdateRules } from "../parseUpdateRules";
import { COMPUTED_FIELDS, FUNCTIONS } from "../QueryBuilder/Functions";
import { SelectItem, SelectItemBuilder } from "../QueryBuilder/QueryBuilder";
import { JoinPaths, ViewHandler } from "../ViewHandler/ViewHandler";
import { insert } from "./insert";
import { update } from "./update";
import { updateBatch } from "./updateBatch";


type ValidatedParams = {
  row: AnyObject;
  forcedData?: AnyObject;
  allowedFields?: FieldFilter;
  tableRules?: TableRule;
  fixIssues: boolean;
}

export class TableHandler extends ViewHandler { 

  constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, tx?: {t: pgPromise.ITask<{}>, dbTX: TableHandlers}, joinPaths?: JoinPaths) {
    super(db, tableOrViewInfo, dboBuilder, tx, joinPaths);

    this.remove = this.delete;

    this.is_view = false;
    this.is_media = dboBuilder.prostgles.isMedia(this.name)
  }

  getFinalDBtx = (localParams: LocalParams | undefined) => {
    return localParams?.tx?.dbTX ?? this.tx?.dbTX;
  }
  getFinalDbo = (localParams: LocalParams | undefined) => {
    return this.getFinalDBtx(localParams) ?? this.dboBuilder.dbo;
  }


  parseUpdateRules = parseUpdateRules.bind(this);
  
  update = update.bind(this);
  updateBatch = updateBatch.bind(this);

  validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }: ValidatedParams) {
    const synced_field = (tableRules ?? {})?.sync?.synced_field;

    /* Update synced_field if sync is on and missing */
    if (synced_field && !row[synced_field]) {
      row[synced_field] = Date.now();
    }

    const data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
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
  
  async insert(
    rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, 
    param3_unused?: undefined, tableRules?: TableRule, _localParams?: LocalParams
  ): Promise<any | any[] | boolean> {
    return insert.bind(this)(rowOrRows, param2, param3_unused, tableRules, _localParams)
  }

  prepareReturning = async (returning: Select | undefined, allowedFields: string[]): Promise<SelectItem[]> => {
    const result: SelectItem[] = [];
    if (returning) {
      const sBuilder = new SelectItemBuilder({
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
    if (items?.length) return " RETURNING " + getSelectItemQuery(items);
    return "";
  }

  async delete(filter?: Filter, params?: DeleteParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
    return _delete.bind(this)(filter, params, param3_unused, table_rules, localParams);
  } 

  remove(filter: Filter, params?: UpdateParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams) {
    return this.delete(filter, params, param3_unused, tableRules, localParams);
  }

  async upsert(filter: Filter, newData: AnyObject, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
    try {
      await this._log({ command: "upsert", localParams, data: { filter, newData, params } });
      const _upsert = async function (tblH: TableHandler) {
        return tblH.find(filter, { select: "", limit: 1 }, undefined, table_rules, localParams)
          .then(exists => {
            if (exists && exists.length) {
              return tblH.update(filter, newData, params, table_rules, localParams);
            } else {
              return tblH.insert({ ...newData, ...filter }, params, undefined, table_rules, localParams);
            }
          });
      }

      /* Do it within a transaction to ensure consisency */
      if (!this.tx) {
        return this.dboBuilder.getTX(dbTX => _upsert(dbTX[this.name] as TableHandler))
      } else {
        return _upsert(this);
      }

    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.upsert()`);
    }
  } 

  /* External request. Cannot sync from server */
  async sync(filter: Filter, params: { select?: FieldFilter }, param3_unused: undefined, table_rules: TableRule, localParams: LocalParams) {

    try {
      await this._log({ command: "sync", localParams, data: { filter, params } });
      
      if (!localParams) throw "Sync not allowed within the server code";
      const { socket } = localParams;
      if (!socket) throw "socket missing";
  
  
      if (!table_rules || !table_rules.sync || !table_rules.select) throw "sync or select table rules missing";
  
      if (this.tx) throw "Sync not allowed within transactions";
  
      const ALLOWED_PARAMS = ["select"];
      const invalidParams = Object.keys(params || {}).filter(k => !ALLOWED_PARAMS.includes(k));
      if (invalidParams.length) throw "Invalid or dissallowed params found: " + invalidParams.join(", ");
  

      const { synced_field, allow_delete }: SyncRule = table_rules.sync;

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
      const select = this.getAllowedSelectFields(
        params?.select ?? "*",
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
        .then(async _isValid => {

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

export const getSelectItemQuery = (items: SelectItem[]) => items.map(s => s.getQuery() + " AS " + asName(s.alias)).join(", ")