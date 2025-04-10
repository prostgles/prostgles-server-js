import { pickKeys } from "prostgles-types";
import { parseFilterItem } from "../Filtering";
import { ParsedTableRule } from "../PublishParser/PublishParser";
import { ExistsFilterConfig, LocalParams, pgp } from "./DboBuilder";
import { FUNCTIONS } from "./QueryBuilder/Functions";
import { SelectItem, type SelectItemValidated } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler/ViewHandler";
import { getExistsCondition } from "./ViewHandler/getExistsCondition";
import { getExistsFilters } from "./ViewHandler/getExistsFilters";
import { parseComplexFilter } from "./ViewHandler/parseComplexFilter";

const FILTER_FUNCS = FUNCTIONS.filter((f) => f.canBeUsedForFilter);

/**
 * parses a single filter
 * @example
 *  { fff: 2 } => "fff" = 2
 *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
 */
export async function getCondition(
  this: ViewHandler,
  params: {
    filter: any;
    select: SelectItemValidated[] | undefined;
    allowed_colnames: string[];
    tableAlias?: string;
    localParams?: LocalParams;
    tableRules?: ParsedTableRule;
    isHaving?: boolean;
  }
): Promise<{ exists: ExistsFilterConfig[]; condition: string }> {
  const {
    filter: rawFilter,
    select,
    allowed_colnames,
    tableAlias,
    localParams,
    tableRules,
    isHaving,
  } = params;

  const filter = { ...rawFilter };

  const existsConfigs = getExistsFilters(filter, this);

  const funcConds: string[] = [];
  const funcFilter = FILTER_FUNCS.filter((f) => f.name in filter);

  funcFilter.map((f) => {
    const funcArgs = filter[f.name];
    if (!Array.isArray(funcArgs)) {
      throw `A function filter must contain an array. E.g: { $funcFilterName: ["col1"] } \n but got: ${JSON.stringify(pickKeys(filter, [f.name]))} `;
    }
    const fields = this.parseFieldFilter(f.getFields(funcArgs), true, allowed_colnames);

    const dissallowedCols = fields.filter((fname) => !allowed_colnames.includes(fname));
    if (dissallowedCols.length) {
      throw `Invalid/disallowed columns found in function filter: ${dissallowedCols}`;
    }
    funcConds.push(
      f.getQuery({
        args: funcArgs,
        allColumns: this.columns,
        allowedFields: allowed_colnames,
        tableAlias,
      })
    );
  });

  let existsCond = "";
  if (existsConfigs.length) {
    existsCond = (
      await Promise.all(
        existsConfigs.map(
          async (existsConfig) => await getExistsCondition.bind(this)(existsConfig, localParams)
        )
      )
    ).join(" AND ");
  }

  /* Computed field queries ($rowhash) */
  const p = this.getValidatedRules(tableRules, localParams);
  const computedFields = p.allColumns.filter((c) => c.type === "computed");
  const computedColConditions: string[] = [];
  Object.keys(filter || {}).map((key) => {
    const compCol = computedFields.find((cf) => cf.name === key);
    if (compCol) {
      if (!p.select) throw new Error("Computed column filter requires p.select.fields");
      computedColConditions.push(
        compCol.getQuery({
          tableAlias,
          allowedFields: p.select.fields,
          allColumns: this.columns,

          /* CTID not available in AFTER trigger */
          // ctidField: this.is_view? undefined : "ctid"

          ctidField: undefined,
        }) + ` = ${pgp.as.format("$1", [filter[key]])}`
      );
      delete filter[key];
    }
  });

  let allowedSelect: SelectItemValidated[] = [];
  /* Select aliases take precedence over col names. This is to ensure filters work correctly even on computed cols*/
  if (select) {
    /* Allow filtering by selected fields/funcs */
    allowedSelect = select.filter((s) => {
      if (
        ["function", "computed", "column"].includes(s.type) ||
        (isHaving && s.type === "aggregation")
      ) {
        /** Selected computed cols are allowed for filtering without checking. Why not allow all?! */
        if (s.type !== "column" || allowed_colnames.includes(s.alias)) {
          return true;
        }
      }
      return false;
    });
  }

  /* Add remaining allowed fields */
  const remainingNonSelectedColumns: SelectItemValidated[] = p.allColumns
    .filter(
      (c) => allowed_colnames.includes(c.name) && !allowedSelect.find((s) => s.alias === c.name)
    )
    .map(
      (f) =>
        ({
          alias: f.name,
          ...(f.type === "column" ?
            {
              type: f.type,
              columnName: f.name,
            }
          : {
              type: f.type,
              columnName: undefined,
            }),
          fields: [f.name],
          getQuery: (tableAlias) =>
            f.getQuery({
              tableAlias,
              allColumns: this.columns,
              allowedFields: allowed_colnames,
            }),
          selected: false,
          column_udt_type:
            f.type === "column" ? this.columns.find((c) => c.name === f.name)?.udt_name : undefined,
        }) satisfies SelectItemValidated
    );
  allowedSelect = allowedSelect.concat(remainingNonSelectedColumns);
  const complexFilters: string[] = [];
  const complexFilterKey = "$filter";
  if (complexFilterKey in filter) {
    const complexFilterCondition = parseComplexFilter({
      filter,
      complexFilterKey,
      tableAlias,
      allowed_colnames,
      columns: this.columns,
    });
    complexFilters.push(complexFilterCondition);
  }

  /* Parse join filters
      { $joinFilter: { $ST_DWithin: [table.col, foreignTable.col, distance] } 
      will make an exists filter
  */

  const filterKeys = Object.keys(filter).filter(
    (k) =>
      k !== complexFilterKey &&
      !funcFilter.find((ek) => ek.name === k) &&
      !computedFields.find((cf) => cf.name === k) &&
      !existsConfigs.find((ek) => ek.existType === k)
  );

  const validFieldNames = allowedSelect.map((s) => s.alias);
  const invalidColumn = filterKeys.find(
    (fName) =>
      !validFieldNames.find(
        (c) =>
          c === fName ||
          (fName.startsWith(c) &&
            (fName.slice(c.length).includes("->") || fName.slice(c.length).includes(".")))
      )
  );

  if (invalidColumn) {
    const selItem = select?.find((s) => s.alias === invalidColumn);
    let isComplexFilter = false;
    if (selItem?.type === "aggregation") {
      if (!params.isHaving) {
        throw new Error(
          `Filtering by ${this.name}.${invalidColumn} is not allowed. Aggregations cannot be filtered. Use HAVING clause instead.`
        );
      } else {
        isComplexFilter = true;
      }
    }

    if (!isComplexFilter) {
      const allowedCols = allowedSelect
        .map((s) => (s.type === "column" ? s.getQuery() : s.alias))
        .join(", ");
      const errMessage = `${this.name}.${invalidColumn} is invalid/disallowed for filtering. Allowed columns: ${allowedCols}`;
      throw errMessage;
    }
  }

  /* TODO: Allow filter funcs */
  // see isComplexFilter above where they are allowed
  // const singleFuncs = FUNCTIONS.filter(f => f.singleColArg);

  const f = pickKeys(filter, filterKeys);
  const q = parseFilterItem({
    filter: f,
    tableAlias,
    select: allowedSelect,
    allowedColumnNames:
      !tableRules ?
        this.column_names.slice(0)
      : this.parseFieldFilter(tableRules.select?.filterFields ?? tableRules.select?.fields),
  });

  let templates: string[] = [q].filter((q) => q);

  if (existsCond) templates.push(existsCond);
  templates = templates.concat(funcConds);
  templates = templates.concat(computedColConditions);
  templates = templates.concat(complexFilters);

  /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
  return {
    exists: existsConfigs,
    condition: templates.sort().join(" AND \n"),
  };
}
