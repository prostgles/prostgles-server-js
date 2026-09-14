import type { SelectParams } from "prostgles-types";
import { asName, isEmpty, omitKeys } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams, PGIdentifier, ValidatedTableRules } from "../DboBuilder";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";
import { prepareSortItems } from "../ViewHandler/prepareSortItems";
import { prepareWhere, type PrepareWhereParams } from "../ViewHandler/prepareWhere";
import { COMPUTED_FIELDS } from "./Functions/COMPUTED_FIELDS";
import { FUNCTIONS } from "./Functions/Functions";
import type { NewQuery, NewQueryJoin } from "./QueryBuilder";
import { SelectItemBuilder } from "./QueryBuilder";
import { ROOT_TABLE_ALIAS } from "./getSelectQuery";

export const getNewQuery = async (
  viewHandler: ViewHandler,
  filter: Filter,
  selectParams: SelectParams & { joinExpressionAlias?: PGIdentifier } = {},
  tableRules: ParsedTableRule | undefined,
  localParams: LocalParams | undefined,
): Promise<NewQuery> => {
  const { columns } = viewHandler;

  if (localParams?.isRemoteRequest && !tableRules?.select?.fields) {
    throw `INTERNAL ERROR: publish.${viewHandler.name}.select.fields rule missing`;
  }

  const allowedOrderByFields =
    !tableRules ?
      viewHandler.column_names.slice(0)
    : viewHandler.parseFieldFilter(tableRules.select?.orderByFields ?? tableRules.select?.fields);
  const allowedSelectFields =
    !tableRules ?
      viewHandler.column_names.slice(0)
    : viewHandler.parseFieldFilter(tableRules.select?.fields);

  const joinQueries: NewQueryJoin[] = [];

  const { select: userSelect = "*" } = selectParams;

  const selectItemBuilder = new SelectItemBuilder({
    allowedFields: allowedSelectFields,
    allowedOrderByFields,
    computedFields: COMPUTED_FIELDS,
    isView: viewHandler.isView,
    functions: FUNCTIONS,
    allFields: viewHandler.column_names.slice(0),
    columns,
  });

  await selectItemBuilder.parseUserSelectWithJoins(
    userSelect,
    async (joinColumnName, parsedJoin) => {
      const j_selectParams: SelectParams = {};
      let j_filter: Filter = {},
        j_isLeftJoin = true;

      const joinExpressionAlias = { raw: joinColumnName, escaped: asName(joinColumnName) };
      const j_path = parseJoinPath({
        rawPath: parsedJoin.type === "simple" ? joinColumnName : parsedJoin.params.path,
        rootTable: viewHandler.name,
        viewHandler: viewHandler,
        allowMultiOrJoin: true,
        addShortestJoinIfMissing: true,
      });

      if (parsedJoin.params === "*") {
        j_selectParams.select = "*";
      } else if (parsedJoin.type === "detailed") {
        const joinParams = parsedJoin.params;

        j_isLeftJoin = !!joinParams.$leftJoin;

        j_filter = joinParams.filter || {};
        j_selectParams.select = joinParams.select || "*";
        j_selectParams.limit = joinParams.limit;
        j_selectParams.offset = joinParams.offset;
        j_selectParams.orderBy = joinParams.orderBy;
        j_selectParams.having = joinParams.having;
      } else {
        j_selectParams.select = parsedJoin.params;
      }

      const joinTableName =
        parsedJoin.type === "simple" ? joinColumnName
        : typeof j_path === "string" ? j_path
        : j_path.at(-1)?.table;
      if (!joinTableName) {
        throw "jTable missing";
      }
      const joinTableHandler = viewHandler.dboBuilder.dboMap.get(joinTableName);
      if (!joinTableHandler) {
        throw `Joined table ${JSON.stringify(joinTableName)} is disallowed or inexistent \nOr you forgot to put the function arguments into an array`;
      }

      let joinTableRules: ParsedTableRule | undefined;
      let isLocal = true;
      if (localParams && localParams.clientReq) {
        isLocal = false;
        joinTableRules = await viewHandler.dboBuilder.publishParser?.getValidatedRequestRuleWusr(
          {
            tableName: joinTableName,
            command: "find",
            clientReq: localParams.clientReq,
          },
          localParams.scope,
        );
      }

      const isAllowedAccessToTable = isLocal || joinTableRules?.select;
      if (!isAllowedAccessToTable) {
        throw `Join select for ${JSON.stringify(joinTableName)} is invalid or not allowed`;
      }
      const joinQuery: NewQuery = await getNewQuery(
        joinTableHandler,
        j_filter,
        { ...j_selectParams, joinExpressionAlias },
        joinTableRules,
        localParams,
      );
      joinQuery.isLeftJoin = j_isLeftJoin;
      joinQueries.push({
        ...joinQuery,
        joinPath: j_path,
        joinAlias: joinQuery.tableAlias ?? joinQuery.table,
      });
    },
  );

  const select = selectItemBuilder.select;

  const commonWhereParams: PrepareWhereParams = {
    filter,
    select,
    forcedFilter: tableRules?.select?.forcedFilter,
    filterFields: tableRules?.select?.filterFields,
    tableAlias: selectParams.joinExpressionAlias,
    localParams,
    tableRule: tableRules,
    isHaving: false,
    selectParams,
  };
  const filterOpts = await prepareWhere(viewHandler, {
    ...commonWhereParams,
    isHaving: false,
  });
  const { source } = filterOpts;
  const havingOpts =
    isEmpty(selectParams.having) ? undefined : (
      await prepareWhere(viewHandler, {
        ...omitKeys(commonWhereParams, ["forcedFilter", "selectParams"]),
        filter: selectParams.having,
        tableAlias:
          selectParams.joinExpressionAlias ? source.alias : (
            { raw: ROOT_TABLE_ALIAS, escaped: ROOT_TABLE_ALIAS }
          ),
        isHaving: true,
      })
    );
  const validatedRules = viewHandler.getValidatedRules(tableRules, localParams);

  const newQuery: NewQuery = {
    allFields: viewHandler.column_names.slice(0),
    select,
    table: { raw: viewHandler.name, escaped: viewHandler.name },
    tableAlias: selectParams.joinExpressionAlias,
    source,
    joins: joinQueries,
    where: filterOpts.where,
    whereOpts: filterOpts,
    having: havingOpts?.condition ?? "",
    isLeftJoin: false,
    limit: prepareLimitQuery(selectParams.limit, validatedRules),
    orderByItems: prepareSortItems(
      selectParams.orderBy,
      allowedOrderByFields,
      selectParams.joinExpressionAlias,
      select,
      joinQueries,
    ),
    offset: prepareOffsetQuery(selectParams.offset),
  };

  if (newQuery.select.some((s) => s.type === "aggregation") && newQuery.joins?.length) {
    throw new Error(`Root query aggregation AND nested joins not allowed`);
  }

  return newQuery;
};

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
