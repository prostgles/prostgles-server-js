import { AnyObject, FieldFilter, getKeys, isDefined, isObject } from "prostgles-types/dist";
import { ParsedTableRule } from "../../PublishParser/PublishParser";
import { ExistsFilterConfig, Filter, LocalParams } from "../DboBuilder";
import { getCondition } from "../getCondition";
import { type SelectItemValidated } from "../QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler";

export type PrepareWhereParams = {
  filter?: Filter;
  select: SelectItemValidated[] | undefined;
  forcedFilter?: AnyObject;
  filterFields?: FieldFilter;
  addWhere?: boolean;
  tableAlias?: string;
  localParams: LocalParams | undefined;
  tableRule: ParsedTableRule | undefined;
  isHaving?: boolean;
};

export async function prepareWhere(
  this: ViewHandler,
  params: PrepareWhereParams
): Promise<{
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

  const parseFullFilter = async (
    f: any,
    parentFilter: any = null,
    isForcedFilterBypass: boolean
  ): Promise<string> => {
    if (!f) throw "Invalid/missing group filter provided";
    if (!isObject(f)) throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(f);
    let result = "";
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
      const conditions = (
        await Promise.all(
          group.map(async (gf) => await parseFullFilter(gf, group, isForcedFilterBypass))
        )
      ).filter((c) => c);

      if (conditions.length) {
        if (conditions.length === 1) return conditions.join(operand);
        else return ` ( ${conditions.sort().join(operand)} ) `;
      }
    } else if (!group) {
      /** forcedFilters do not get checked against publish and are treated as server-side requests */
      const cond = await getCondition.bind(this)({
        filter: { ...f },
        select,
        allowed_colnames:
          isForcedFilterBypass ? this.column_names.slice(0) : this.parseFieldFilter(filterFields),
        tableAlias,
        localParams: isForcedFilterBypass ? undefined : localParams,
        tableRules: isForcedFilterBypass ? undefined : tableRule,
        isHaving: params.isHaving,
      });
      result = cond.condition;
      exists.push(...cond.exists);
    }
    return result;
  };

  /* A forced filter condition will not check if the existsJoined filter tables have been published */
  const forcedFilterCond =
    forcedFilter ? await parseFullFilter(forcedFilter, null, true) : undefined;
  const filterCond = await parseFullFilter(filter, null, false);
  let cond = [forcedFilterCond, filterCond].filter((c) => c).join(" AND ");

  const finalFilter =
    forcedFilter ?
      {
        [$and_key]: [forcedFilter, filter].filter(isDefined),
      }
    : { ...filter };

  const condition = cond;
  if (cond && addKeywords) {
    cond = `WHERE ${cond}`;
  }
  return { condition, where: cond || "", filter: finalFilter, exists };
}
