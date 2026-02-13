import type {
  DetailedJoinSelect,
  JoinPath,
  JoinSelect,
  RawJoinPath,
  SelectParams,
  SimpleJoinSelect,
} from "prostgles-types";
import { getKeys, includes, isEmpty, omitKeys } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams, ValidatedTableRules } from "../DboBuilder";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";
import { prepareSortItems } from "../ViewHandler/prepareSortItems";
import type { PrepareWhereParams } from "../ViewHandler/prepareWhere";
import { COMPUTED_FIELDS } from "./Functions/COMPUTED_FIELDS";
import { FUNCTIONS } from "./Functions/Functions";
import type { NewQuery, NewQueryJoin } from "./QueryBuilder";
import { SelectItemBuilder } from "./QueryBuilder";

const JOIN_KEYS = ["$innerJoin", "$leftJoin"] as const;
const JOIN_PARAM_KEYS = getKeys({
  $condition: 1,
  filter: 1,
  having: 1,
  limit: 1,
  offset: 1,
  orderBy: 1,
  select: 1,
} satisfies Record<keyof Omit<DetailedJoinSelect, (typeof JOIN_KEYS)[number]>, 1>);

type ParsedJoin =
  | {
      type: "detailed";
      params: DetailedJoinSelect & {
        table: DetailedJoinSelect["$leftJoin"];
        path: RawJoinPath;
      };
    }
  | { type: "simple"; params: SimpleJoinSelect }
  | { type?: undefined; error: string };

const parseJoinSelect = (joinParams: JoinSelect): ParsedJoin => {
  if (!(joinParams as string)) {
    return {
      error: "Empty join params",
    };
  }
  if (typeof joinParams === "string") {
    if ((joinParams as string) !== "*") {
      throw "Join select can be * or { field: 1 }";
    }
    return {
      type: "simple",
      params: joinParams,
    };
  }
  const [joinKey, ...otherKeys] = getKeys(joinParams).filter((k) => includes(JOIN_KEYS, k));
  if (otherKeys.length) {
    return {
      error: "Cannot specify more than one join type ( $innerJoin OR $leftJoin )",
    };
  } else if (joinKey) {
    /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
    const invalidParams = Object.keys(joinParams).filter(
      (k) => !includes([...JOIN_PARAM_KEYS, ...JOIN_KEYS], k),
    );
    if (invalidParams.length) {
      throw "Invalid join params: " + invalidParams.join(", ");
    }
    const path = joinParams[joinKey] as string | JoinPath[];
    if (Array.isArray(path) && !path.length) {
      throw `Cannot have an empty join path/tableName ${joinKey}`;
    }
    return {
      type: "detailed",
      params: {
        ...(joinParams as DetailedJoinSelect),
        path,
        table: typeof path === "string" ? path : path.at(-1)!.table,
      },
    };
  }

  return {
    type: "simple",
    params: joinParams as SimpleJoinSelect,
  };
};

export async function getNewQuery(
  _this: ViewHandler,
  filter: Filter,
  selectParams: SelectParams & { alias?: string } = {},
  param3_unused = null,
  tableRules: ParsedTableRule | undefined,
  localParams: LocalParams | undefined,
): Promise<NewQuery> {
  const { columns } = _this;

  if (localParams?.isRemoteRequest && !tableRules?.select?.fields) {
    throw `INTERNAL ERROR: publish.${_this.name}.select.fields rule missing`;
  }

  const allowedOrderByFields =
    !tableRules ?
      _this.column_names.slice(0)
    : _this.parseFieldFilter(tableRules.select?.orderByFields ?? tableRules.select?.fields);
  const allowedSelectFields =
    !tableRules ? _this.column_names.slice(0) : _this.parseFieldFilter(tableRules.select?.fields);

  const joinQueries: NewQueryJoin[] = [];

  const { select: userSelect = "*" } = selectParams,
    sBuilder = new SelectItemBuilder({
      allowedFields: allowedSelectFields,
      allowedOrderByFields,
      computedFields: COMPUTED_FIELDS,
      isView: _this.is_view,
      functions: FUNCTIONS,
      allFields: _this.column_names.slice(0),
      columns,
    });

  await sBuilder.parseUserSelect(userSelect, async (fTable, _joinParams, throwErr) => {
    const j_selectParams: SelectParams = {};
    let j_filter: Filter = {},
      j_isLeftJoin = true;
    const j_alias = fTable;

    const parsedJoin = parseJoinSelect(_joinParams);

    if (!parsedJoin.type) {
      throwErr(parsedJoin.error);
      return;
    }
    const j_path = parseJoinPath({
      rawPath: parsedJoin.type === "simple" ? fTable : parsedJoin.params.path,
      rootTable: _this.name,
      viewHandler: _this,
      allowMultiOrJoin: true,
      addShortestJoinIfMissing: true,
    });

    if (parsedJoin.params === "*") {
      j_selectParams.select = "*";
    } else if (parsedJoin.type === "detailed") {
      const joinParams = parsedJoin.params;

      j_isLeftJoin = !!joinParams.$leftJoin;

      j_selectParams.select = joinParams.select || "*";
      j_filter = joinParams.filter || {};
      j_selectParams.limit = joinParams.limit;
      j_selectParams.offset = joinParams.offset;
      j_selectParams.orderBy = joinParams.orderBy;
      j_selectParams.having = joinParams.having;
    } else {
      j_selectParams.select = parsedJoin.params;
    }

    const joinTableName =
      parsedJoin.type === "simple" ? fTable
      : typeof j_path === "string" ? j_path
      : j_path.at(-1)?.table;
    if (!joinTableName) {
      throw "jTable missing";
    }
    const joinTableHandler = _this.dboBuilder.dbo[joinTableName] as ViewHandler | undefined;
    if (!joinTableHandler) {
      throw `Joined table ${JSON.stringify(joinTableName)} is disallowed or inexistent \nOr you forgot to put the function arguments into an array`;
    }

    let joinTableRules: ParsedTableRule | undefined;
    let isLocal = true;
    if (localParams && localParams.clientReq) {
      isLocal = false;
      joinTableRules = await _this.dboBuilder.publishParser?.getValidatedRequestRuleWusr(
        {
          tableName: joinTableName,
          command: "find",
          clientReq: localParams.clientReq,
        },
        localParams.scope,
      );
    }

    const isAllowedAccessToTable = isLocal || joinTableRules;
    if (isAllowedAccessToTable) {
      const joinQuery: NewQuery = await getNewQuery(
        joinTableHandler,
        j_filter,
        { ...j_selectParams, alias: j_alias },
        param3_unused,
        joinTableRules,
        localParams,
      );
      joinQuery.isLeftJoin = j_isLeftJoin;
      joinQuery.tableAlias = j_alias;
      joinQueries.push({
        ...joinQuery,
        joinPath: j_path,
        joinAlias: joinQuery.tableAlias ?? joinQuery.table,
      });
    }
  });

  /**
   * Is this still needed?!!!
   * Add non selected columns
   * This ensures all fields are available for orderBy in case of nested select
   * */
  Array.from(new Set([...allowedSelectFields, ...allowedOrderByFields])).map((key) => {
    if (!sBuilder.select.find((s) => s.alias === key && s.type === "column")) {
      sBuilder.addColumn(key, false);
    }
  });

  const select = sBuilder.select;

  const tableAlias = selectParams.alias;
  const commonWhereParams: PrepareWhereParams = {
    filter,
    select,
    forcedFilter: tableRules?.select?.forcedFilter,
    filterFields: tableRules?.select?.filterFields,
    tableAlias,
    localParams,
    tableRule: tableRules,
    isHaving: false,
  };
  const filterOpts = await _this.prepareWhere({
    ...commonWhereParams,
    isHaving: false,
  });
  const havingOpts =
    !isEmpty(selectParams.having) ?
      await _this.prepareWhere({
        ...omitKeys(commonWhereParams, ["forcedFilter"]),
        filter: selectParams.having,
        isHaving: true,
      })
    : undefined;
  const where = filterOpts.where;
  const validatedRules = _this.getValidatedRules(tableRules, localParams);

  const resQuery: NewQuery = {
    allFields: _this.column_names.slice(0),
    select,
    table: _this.name,
    joins: joinQueries,
    where,
    whereOpts: filterOpts,
    having: havingOpts?.condition ?? "",
    isLeftJoin: false,
    limit: prepareLimitQuery(selectParams.limit, validatedRules),
    orderByItems: prepareSortItems(
      selectParams.orderBy,
      allowedOrderByFields,
      selectParams.alias,
      select,
      joinQueries,
    ),
    offset: prepareOffsetQuery(selectParams.offset),
  };

  if (resQuery.select.some((s) => s.type === "aggregation") && resQuery.joins?.length) {
    throw new Error(`Root query aggregation AND nested joins not allowed`);
  }

  return resQuery;
}

const prepareOffsetQuery = (offset?: number) => {
  if (Number.isInteger(offset)) {
    return offset!;
  }

  return 0;
};

const prepareLimitQuery = (
  limit: number | null | undefined = null,
  p: ValidatedTableRules,
): number | null => {
  if (limit !== null && !Number.isInteger(limit)) {
    throw "Unexpected LIMIT. Must be null or an integer";
  }

  if (!p.select) {
    throw "select missing";
  }

  let _limit = limit;
  /* If no limit then set as the lesser of (100, maxLimit) */
  if (_limit !== null && !Number.isInteger(_limit) && p.select.maxLimit !== null) {
    _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0]!;
  } else {
    /* If a limit higher than maxLimit specified throw error */
    if (Number.isInteger(p.select.maxLimit) && _limit !== null && _limit > p.select.maxLimit!) {
      throw (
        `Unexpected LIMIT ${_limit}. Must be less than the published maxLimit: ` + p.select.maxLimit
      );
    }
  }

  return _limit;
};
