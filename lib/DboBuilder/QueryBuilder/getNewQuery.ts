import { get } from "../../utils";
import { TableHandler } from "../TableHandler";
import { TableRule } from "../../PublishParser";
import { Filter, LocalParams } from "../../DboBuilder";
import { SelectParams, ColumnInfo, getKeys, DetailedJoinSelect, SimpleJoinSelect, JoinPath, JoinSelect } from "prostgles-types";
import { COMPUTED_FIELDS, FUNCTIONS } from "./Functions";
import { NewQuery, NewQueryJoin, SelectItemBuilder } from "./QueryBuilder";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";

const JOIN_KEYS = ["$innerJoin", "$leftJoin"] as const;
type ParsedJoin = 
| { type: "detailed"; params: DetailedJoinSelect & { table: DetailedJoinSelect["$leftJoin"] } } 
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
    const JOIN_PARAMS = ["select", "filter", "$path", "$condition", "offset", "limit", "orderBy"] as const;
    const invalidParams = Object.keys(joinParams).filter(k => ![ ...JOIN_PARAMS, ...JOIN_KEYS ].includes(k as any));
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
  _this: TableHandler,
  filter: Filter, 
  selectParams: (SelectParams & { alias?: string })  = {}, 
  param3_unused = null, 
  tableRules: TableRule | undefined, 
  localParams: LocalParams | undefined,
  columns: ColumnInfo[],
): Promise<NewQuery> {

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
        j_alias: string | undefined,
        j_tableRules: TableRule | undefined;
        // j_table: string | undefined;

    const parsedJoin = parseJoinSelect(_joinParams);

    if(!parsedJoin.type){
      throwErr(parsedJoin.error);
      return;
    }
    const j_path = parseJoinPath({ 
      rawPath: parsedJoin.type === "simple"? fTable : parsedJoin.params.table,
      rootTable: _this.name,
      viewHandler: _this,
      allowMultiOrJoin: true,
      addShortestJoinIfMissing: true,
    })
    if(parsedJoin.params === "*"){
        j_selectParams.select = "*";
        j_alias = fTable;
    } else if(parsedJoin.type === "detailed") {
      const joinParams = parsedJoin.params;

      j_isLeftJoin = !!joinParams.$leftJoin;
      j_alias = fTable;
      
      j_selectParams.select = joinParams.select || "*";
      j_filter = joinParams.filter || {};
      j_selectParams.limit = joinParams.limit;
      j_selectParams.offset = joinParams.offset;
      j_selectParams.orderBy = joinParams.orderBy;
    } else {
      j_selectParams.select = parsedJoin.params;
      j_alias = fTable;
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
    
    if(isLocal || j_tableRules){

      const joinQuery: NewQuery = await getNewQuery(
          _thisJoinedTable,
          j_filter, 
          { ...j_selectParams, alias: j_alias }, 
          param3_unused, 
          j_tableRules, 
          localParams,
          columns
        );
      joinQuery.isLeftJoin = j_isLeftJoin;
      joinQuery.tableAlias = j_alias;
      joinQueries.push({
        ...joinQuery,
        joinPath: j_path
      });
    }
  })

  /**
   * Add non selected columns
   * This ensures all fields are available for orderBy in case of nested select
   * */
  Array.from(new Set([...allowedSelectFields, ...allowedOrderByFields])).map(key => {
    if(!sBuilder.select.find(s => s.alias === key && s.type === "column")){
      sBuilder.addColumn(key, false);
    }
  });

  const select = sBuilder.select;
  // const validatedAggAliases = select
  //   .filter(s => s.type !== "joinedColumn")
  //   .map(s => s.alias);
    
  const filterOpts = await _this.prepareWhere({
    filter, 
    select, 
    forcedFilter: get(tableRules, "select.forcedFilter"), 
    filterFields: get(tableRules, "select.filterFields"), 
    tableAlias: selectParams.alias, 
    localParams,
    tableRule: tableRules
  });
  const where = filterOpts.where;
  const p = _this.getValidatedRules(tableRules, localParams);

  const resQuery: NewQuery = {
    /** Why was this the case? */
    // allFields: allowedSelectFields,

    allFields: _this.column_names.slice(0),
    select,
    table: _this.name,
    joins: joinQueries,
    where,
    whereOpts: filterOpts,
    having: "",
    isLeftJoin: false,
    // having: cond.having,
    limit: _this.prepareLimitQuery(selectParams.limit, p),
    orderByItems: _this.prepareSortItems(selectParams.orderBy, allowedOrderByFields, selectParams.alias, select),
    offset: _this.prepareOffsetQuery(selectParams.offset)
  };

  // console.log(resQuery);
  // console.log(buildJoinQuery(_this, resQuery));
  return resQuery;
}
