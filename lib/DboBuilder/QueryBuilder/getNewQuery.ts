import { DetailedJoinSelect, JoinPath, JoinSelect, RawJoinPath, SelectParams, SimpleJoinSelect, getKeys } from "prostgles-types";
import { Filter, LocalParams, ValidatedTableRules } from "../DboBuilder";
import { TableRule } from "../../PublishParser/PublishParser";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";
import { prepareSortItems } from "../ViewHandler/prepareSortItems";
import { COMPUTED_FIELDS, FUNCTIONS } from "./Functions";
import { NewQuery, NewQueryJoin, SelectItemBuilder } from "./QueryBuilder";
import { prepareHaving } from "./prepareHaving";

const JOIN_KEYS = ["$innerJoin", "$leftJoin"] as const;
const JOIN_PARAM_KEYS = getKeys({ 
  $condition: 1, 
  filter: 1, 
  having: 1, 
  limit: 1, 
  offset: 1, 
  orderBy: 1, 
  select: 1 
} satisfies Record<keyof Omit<DetailedJoinSelect, typeof JOIN_KEYS[number]>, 1>);

type ParsedJoin = 
| { type: "detailed"; params: DetailedJoinSelect & { table: DetailedJoinSelect["$leftJoin"]; path: RawJoinPath } } 
| { type: "simple"; params: SimpleJoinSelect; }
| { type?: undefined; error: string; };

const parseJoinSelect = (joinParams: string | JoinSelect): ParsedJoin => {
  if(!joinParams){
    return {
      error: "Empty join params"
    }
  }
  if(typeof joinParams === "string"){
    if(joinParams !== "*"){
      throw "Join select can be * or { field: 1 }"
    }
    return {
      type: "simple",
      params: joinParams
    }
  }
  const [joinKey, ...otherKeys] = getKeys(joinParams).filter(k => JOIN_KEYS.includes(k as any));
  if(otherKeys.length) {
    return {
      error: "Cannot specify more than one join type ( $innerJoin OR $leftJoin )"
    }
  } else if(joinKey) {

    /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
    const invalidParams = Object.keys(joinParams).filter(k => ![ ...JOIN_PARAM_KEYS, ...JOIN_KEYS ].includes(k as any));
    if(invalidParams.length) {
      throw "Invalid join params: " + invalidParams.join(", ");
    }
    const path = joinParams[joinKey] as string | JoinPath[];
    if(Array.isArray(path) && !path.length){
      throw `Cannot have an empty join path/tableName ${joinKey}`
    }
    return { 
      type: "detailed",
      params: {
        ...(joinParams as DetailedJoinSelect),
        path,
        table: typeof path === "string"? path : path.at(-1)!.table,
      },
    };
  }

  return {
    type: "simple",
    params: joinParams as SimpleJoinSelect
  }
}

export async function getNewQuery(
  _this: ViewHandler,
  filter: Filter, 
  selectParams: (SelectParams & { alias?: string })  = {}, 
  param3_unused = null, 
  tableRules: TableRule | undefined, 
  localParams: LocalParams | undefined,
): Promise<NewQuery> {
  const { columns } = _this;

  if(localParams?.isRemoteRequest && !tableRules?.select?.fields){
    throw `INTERNAL ERROR: publish.${_this.name}.select.fields rule missing`;
  }

  const allowedOrderByFields = !tableRules? _this.column_names.slice(0) : _this.parseFieldFilter(tableRules?.select?.orderByFields ?? tableRules?.select?.fields);
  const allowedSelectFields = !tableRules? _this.column_names.slice(0) :  _this.parseFieldFilter(tableRules?.select?.fields);

  const joinQueries: NewQueryJoin[] = [];

  const { select: userSelect = "*" } = selectParams,
    sBuilder = new SelectItemBuilder({ 
      allowedFields: allowedSelectFields, 
      allowedOrderByFields,
      computedFields: COMPUTED_FIELDS, 
      isView: _this.is_view, 
      functions: FUNCTIONS, 
      allFields: _this.column_names.slice(0), 
      columns 
    });

 
  await sBuilder.parseUserSelect(userSelect, async (fTable, _joinParams, throwErr) => {

    const j_selectParams: SelectParams = {};
    let j_filter: Filter = {},
        j_isLeftJoin = true,
        j_tableRules: TableRule | undefined;
    const j_alias = fTable;

    const parsedJoin = parseJoinSelect(_joinParams);

    if(!parsedJoin.type){
      throwErr(parsedJoin.error);
      return;
    }
    const j_path = parseJoinPath({ 
      rawPath: parsedJoin.type === "simple"? fTable : parsedJoin.params.path,
      rootTable: _this.name,
      viewHandler: _this,
      allowMultiOrJoin: true,
      addShortestJoinIfMissing: true,
    });

    if(parsedJoin.params === "*"){
        j_selectParams.select = "*";
    } else if(parsedJoin.type === "detailed") {
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
    
    const jTable = parsedJoin.type === "simple"? fTable : (typeof j_path === "string"? j_path : j_path?.at(-1)?.table);
    if(!jTable) {
      throw "jTable missing";
    }
    const _thisJoinedTable: any = _this.dboBuilder.dbo[jTable];
    if(!_thisJoinedTable) {
      throw `Joined table ${JSON.stringify(jTable)} is disallowed or inexistent \nOr you've forgot to put the function arguments into an array`;
    }

    let isLocal = true;
    if(localParams && (localParams.socket || localParams.httpReq)){
      isLocal = false;
      j_tableRules = await _this.dboBuilder.publishParser?.getValidatedRequestRuleWusr({ tableName: jTable, command: "find", localParams });
    }
    
    const isAllowedAccessToTable = isLocal || j_tableRules;
    if(isAllowedAccessToTable){

      const joinQuery: NewQuery = await getNewQuery(
          _thisJoinedTable,
          j_filter, 
          { ...j_selectParams, alias: j_alias }, 
          param3_unused, 
          j_tableRules, 
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
  })

  /**
   * Is this still needed?!!!
   * Add non selected columns
   * This ensures all fields are available for orderBy in case of nested select
   * */
  Array.from(new Set([...allowedSelectFields, ...allowedOrderByFields])).map(key => {
    if(!sBuilder.select.find(s => s.alias === key && s.type === "column")){
      sBuilder.addColumn(key, false);
    }
  });

  const select = sBuilder.select;
    
  const tableAlias = selectParams.alias;
  const filterOpts = await _this.prepareWhere({
    filter, 
    select, 
    forcedFilter: tableRules?.select?.forcedFilter, 
    filterFields: tableRules?.select?.filterFields, 
    tableAlias, 
    localParams,
    tableRule: tableRules
  });
  const where = filterOpts.where;
  const validatedRules = _this.getValidatedRules(tableRules, localParams);

  const resQuery: NewQuery = {
    allFields: _this.column_names.slice(0),
    select,
    table: _this.name,
    joins: joinQueries,
    where,
    whereOpts: filterOpts,
    having: prepareHaving({ 
      having: selectParams.having, 
      select, 
      tableAlias,
      filterFieldNames: tableRules ? _this.parseFieldFilter(tableRules?.select?.filterFields) : _this.column_names.slice(0),
    }),
    isLeftJoin: false,
    limit: prepareLimitQuery(selectParams.limit, validatedRules),
    orderByItems: prepareSortItems(
      selectParams.orderBy, 
      allowedOrderByFields, 
      selectParams.alias, 
      select, 
      joinQueries
    ),
    offset: prepareOffsetQuery(selectParams.offset)
  };

  if(resQuery.select.some(s => s.type === "aggregation") && resQuery.joins?.length){
    throw new Error(`Root query aggregation AND nested joins not allowed`);
  }

  return resQuery;
}

const prepareOffsetQuery = (offset?: number) => {
  if (Number.isInteger(offset)) {
    return offset!;
  }

  return 0;
}

const prepareLimitQuery = (limit: number | null | undefined = null, p: ValidatedTableRules): number | null => {

  if (limit !== undefined && limit !== null && !Number.isInteger(limit)) {
    throw "Unexpected LIMIT. Must be null or an integer";
  }

  let _limit = limit;
  /* If no limit then set as the lesser of (100, maxLimit) */
  if (_limit !== null && !Number.isInteger(_limit) && p.select.maxLimit !== null) {
    _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0]!;
  } else {

    /* If a limit higher than maxLimit specified throw error */
    if (Number.isInteger(p.select.maxLimit) && _limit !== null && _limit > p.select.maxLimit!) {
      throw `Unexpected LIMIT ${_limit}. Must be less than the published maxLimit: ` + p.select.maxLimit;
    }
  }


  return _limit;
}