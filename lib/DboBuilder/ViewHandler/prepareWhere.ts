import type { AnyObject, FieldFilter } from "prostgles-types/dist";
import { getKeys, isDefined, isObject } from "prostgles-types/dist";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { ExistsFilterConfig, Filter, LocalParams, PGIdentifier } from "../DboBuilder";
import { getCondition } from "../getCondition";
import { type SelectItemValidated } from "../QueryBuilder/QueryBuilder";
import type { ViewHandler } from "./ViewHandler";

export type PrepareWhereParams = {
  filter?: Filter;
  select: SelectItemValidated[] | undefined;
  forcedFilter?: AnyObject;
  filterFields?: FieldFilter;
  addWhere?: boolean;
  tableAlias?: PGIdentifier;
  localParams: LocalParams | undefined;
  tableRule: ParsedTableRule | undefined;
  isHaving?: boolean;
};

export async function prepareWhere(
  this: ViewHandler,
  params: PrepareWhereParams,
): Promise<{
  columnsUsed: string[];
  condition: string;
  where: string;
  filter: AnyObject;
  exists: ExistsFilterConfig[];
}> {
  const {
    filter,
    select,
    forcedFilter,
    filterFields: ff,
    addWhere: addKeywords = true,
    tableAlias,
    localParams,
    tableRule,
  } = params;
  const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;

  let filterFields = ff;
  /* Local update allow all. TODO -> FIX THIS */
  if (!ff && !tableRule) filterFields = "*";

  const exists: ExistsFilterConfig[] = [];

  type FilterItemResult = { condition: string; columnsUsed: string[] };
  const parseFullFilter = async (
    f: any,
    parentFilter: AnyObject | null = null,
    isForcedFilterBypass: boolean,
  ): Promise<FilterItemResult> => {
    if (!f) throw "Invalid/missing group filter provided";
    if (!isObject(f)) throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(f);
    const result = { condition: "", columnsUsed: [] as string[] };
    const keys = getKeys(f);
    if (!keys.length) {
      return result;
    }
    if (keys.includes($and_key) || keys.includes($or_key)) {
      if (keys.length > 1)
        throw `\ngroup filter must contain only one array property. e.g.: { ${$and_key}: [...] } OR { ${$or_key}: [...] } `;
      if (parentFilter && Object.keys(parentFilter).includes(""))
        throw "group filter ($and/$or) can only be placed at the root or within another group filter";
    }

    const { [$and_key]: $and, [$or_key]: $or } = f,
      group: AnyObject[] | undefined = $and || $or;

    if (group && group.length) {
      const operand = $and ? " AND " : " OR ";
      const conditionItems = (
        await Promise.all(
          group.map(async (gf) => await parseFullFilter(gf, group, isForcedFilterBypass)),
        )
      ).filter((c) => c.condition);

      if (conditionItems.length) {
        const conditions = conditionItems.map((c) => c.condition);
        const columnsUsed = conditionItems.map((c) => c.columnsUsed).flat();
        if (conditions.length === 1) return { columnsUsed, condition: conditions.join(operand) };
        else return { columnsUsed, condition: ` ( ${conditions.sort().join(operand)} ) ` };
      }
    } else if (!group) {
      /** forcedFilters do not get checked against publish and are treated as server-side requests */
      const { condition, exists, columnsUsed } = await getCondition.bind(this)({
        filter: { ...f },
        select,
        allowed_colnames:
          isForcedFilterBypass ? this.column_names.slice(0) : this.parseFieldFilter(filterFields),
        tableAlias,
        localParams: isForcedFilterBypass ? undefined : localParams,
        tableRules: isForcedFilterBypass ? undefined : tableRule,
        isHaving: params.isHaving,
      });
      result.condition = condition;
      result.columnsUsed = columnsUsed;
      exists.push(...exists);
    }
    return result;
  };

  /* A forced filter condition will not check if the existsJoined filter tables have been published */
  const forcedFilterCond =
    forcedFilter ? await parseFullFilter(forcedFilter, null, true) : undefined;
  const filterCond = await parseFullFilter(filter, null, false);
  let combinedConditions = [forcedFilterCond, filterCond]
    .map((c) => (c?.condition ? c.condition : undefined))
    .filter(isDefined)
    .join(" AND ");

  const combinedColumnsUsed = [...(forcedFilterCond?.columnsUsed ?? []), ...filterCond.columnsUsed];
  const finalFilter =
    forcedFilter ?
      {
        [$and_key]: [forcedFilter, filter].filter(isDefined),
      }
    : { ...filter };

  const condition = combinedConditions;
  if (combinedConditions && addKeywords) {
    combinedConditions = `WHERE ${combinedConditions}`;
  }
  return {
    columnsUsed: combinedColumnsUsed,
    condition,
    where: combinedConditions || "",
    filter: finalFilter,
    exists,
  };
}
