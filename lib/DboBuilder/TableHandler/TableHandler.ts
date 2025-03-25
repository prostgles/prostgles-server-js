import pgPromise from "pg-promise";
import {
  AnyObject,
  asName,
  DeleteParams,
  FieldFilter,
  InsertParams,
  Select,
  UpdateParams,
} from "prostgles-types";
import { DB } from "../../Prostgles";
import { SyncRule, TableRule } from "../../PublishParser/PublishParser";
import TableConfigurator from "../../TableConfig/TableConfig";
import {
  DboBuilder,
  Filter,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  LocalParams,
  TableHandlers,
} from "../DboBuilder";
import type { TableSchema } from "../DboBuilderTypes";
import { parseUpdateRules } from "../parseUpdateRules";
import { COMPUTED_FIELDS, FUNCTIONS } from "../QueryBuilder/Functions";
import { SelectItem, SelectItemBuilder } from "../QueryBuilder/QueryBuilder";
import { JoinPaths, ViewHandler } from "../ViewHandler/ViewHandler";
import { DataValidator } from "./DataValidator";
import { _delete } from "./delete";
import { insert } from "./insert/insert";
import { update } from "./update";
import { updateBatch } from "./updateBatch";
import { upsert } from "./upsert";

export type ValidatedParams = {
  row: AnyObject;
  forcedData?: AnyObject;
  allowedFields?: FieldFilter;
  tableRules?: TableRule;
  removeDisallowedFields: boolean;
  tableConfigurator: TableConfigurator | undefined;
  tableHandler: TableHandler;
};

export class TableHandler extends ViewHandler {
  dataValidator: DataValidator;
  constructor(
    db: DB,
    tableOrViewInfo: TableSchema,
    dboBuilder: DboBuilder,
    tx?: { t: pgPromise.ITask<{}>; dbTX: TableHandlers },
    joinPaths?: JoinPaths
  ) {
    super(db, tableOrViewInfo, dboBuilder, tx, joinPaths);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.remove = this.delete;

    this.dataValidator = new DataValidator(this);
    this.is_view = false;
    this.is_media = dboBuilder.prostgles.isMedia(this.name);
  }

  getFinalDBtx = (localParams: LocalParams | undefined) => {
    return localParams?.tx?.dbTX ?? this.tx?.dbTX;
  };
  getFinalDbo = (localParams: LocalParams | undefined) => {
    return this.getFinalDBtx(localParams) ?? this.dboBuilder.dbo;
  };

  parseUpdateRules = parseUpdateRules.bind(this);

  update = update.bind(this);
  updateBatch = updateBatch.bind(this);

  async insert(
    rowOrRows: AnyObject | AnyObject[],
    param2?: InsertParams,
    param3_unused?: undefined,
    tableRules?: TableRule,
    _localParams?: LocalParams
  ): Promise<any> {
    return insert.bind(this)(rowOrRows, param2, param3_unused, tableRules, _localParams);
  }

  prepareReturning = async (
    returning: Select | undefined,
    allowedFields: string[]
  ): Promise<SelectItem[]> => {
    const result: SelectItem[] = [];
    if (returning) {
      const sBuilder = new SelectItemBuilder({
        allFields: this.column_names.slice(0),
        allowedFields,
        allowedOrderByFields: allowedFields,
        computedFields: COMPUTED_FIELDS,
        functions: FUNCTIONS.filter((f) => f.type === "function" && f.singleColArg),
        isView: this.is_view,
        columns: this.columns,
      });
      await sBuilder.parseUserSelect(returning);

      return sBuilder.select;
    }

    return result;
  };

  makeReturnQuery(items?: SelectItem[]) {
    if (items?.length) return " RETURNING " + getSelectItemQuery(items);
    return "";
  }

  async delete(
    filter?: Filter,
    params?: DeleteParams,
    param3_unused?: undefined,
    table_rules?: TableRule,
    localParams?: LocalParams
  ): Promise<any> {
    return _delete.bind(this)(filter, params, param3_unused, table_rules, localParams);
  }

  remove(
    filter: Filter,
    params?: UpdateParams,
    param3_unused?: undefined,
    tableRules?: TableRule,
    localParams?: LocalParams
  ) {
    return this.delete(filter, params, param3_unused, tableRules, localParams);
  }

  upsert = upsert.bind(this);

  /* External request. Cannot sync from server */
  async sync(
    filter: Filter,
    params: { select?: FieldFilter },
    param3_unused: undefined,
    table_rules: TableRule,
    localParams: LocalParams
  ) {
    const start = Date.now();
    try {
      if (!this.dboBuilder.canSubscribe) {
        throw "Cannot subscribe. PubSubManager not initiated";
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!localParams.clientReq) throw "Sync not allowed within the server code";
      const { socket } = localParams.clientReq;
      if (!socket) throw "socket missing";

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!table_rules || !table_rules.sync || !table_rules.select)
        throw "sync or select table rules missing";

      if (this.tx) throw "Sync not allowed within transactions";

      const ALLOWED_PARAMS = ["select"];
      const invalidParams = Object.keys(params).filter((k) => !ALLOWED_PARAMS.includes(k));
      if (invalidParams.length)
        throw "Invalid or dissallowed params found: " + invalidParams.join(", ");

      const { synced_field }: SyncRule = table_rules.sync;

      if (!table_rules.sync.id_fields.length || !synced_field) {
        const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
        console.error(err);
        throw err;
      }

      const id_fields = this.parseFieldFilter(table_rules.sync.id_fields, false);
      const syncFields = [...id_fields, synced_field];

      const allowedSelect = this.parseFieldFilter(table_rules.select.fields);
      if (syncFields.find((f) => !allowedSelect.includes(f))) {
        throw `INTERNAL ERROR: sync field missing from publish.${this.name}.select.fields`;
      }
      const select = this.getAllowedSelectFields(params.select ?? "*", allowedSelect, false);
      if (!select.length) throw "Empty select not allowed";

      /* Add sync fields if missing */
      syncFields.map((sf) => {
        if (!select.includes(sf)) select.push(sf);
      });

      /* Step 1: parse command and params */
      const result = await this.find(
        filter,
        { select, limit: 0 },
        undefined,
        table_rules,
        localParams
      ).then(async (_isValid) => {
        const { filterFields, forcedFilter } = table_rules.select || {};
        const condition = (
          await this.prepareWhere({
            select: undefined,
            filter,
            forcedFilter,
            filterFields,
            addWhere: false,
            localParams,
            tableRule: table_rules,
          })
        ).where;

        const pubSubManager = await this.dboBuilder.getPubSubManager();
        return pubSubManager
          .addSync({
            table_info: this.tableOrViewInfo,
            condition,
            id_fields,
            synced_field,
            socket,
            table_rules,
            filter: { ...filter },
            params: { select },
          })
          .then(({ channelName }) => ({ channelName, id_fields, synced_field }));
      });
      await this._log({
        command: "sync",
        localParams,
        data: { filter, params },
        duration: Date.now() - start,
      });
      return result;
    } catch (e) {
      await this._log({
        command: "sync",
        localParams,
        data: { filter, params },
        duration: Date.now() - start,
        error: getErrorAsObject(e),
      });
      throw getSerializedClientErrorFromPGError(e, {
        type: "tableMethod",
        localParams,
        view: this,
      });
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

export const getSelectItemQuery = (items: SelectItem[]) =>
  items.map((s) => s.getQuery() + " AS " + asName(s.alias)).join(", ");
