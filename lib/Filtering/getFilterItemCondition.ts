import {
  GeomFilterKeys,
  GeomFilter_Funcs,
  TextFilterKeys,
  TextFilter_FullTextSearchFilterKeys,
  includes,
  isDefined,
  isObject,
} from "prostgles-types";
import { parseFilterRightValue } from "./parseFilterRightValue";
import { FILTER_OPERAND_TO_SQL_OPERAND, FILTER_OPERANDS } from "./Filtering";
import type { SelectItemValidated } from "../DboBuilder/QueryBuilder/QueryBuilder";
import { pgp } from "../DboBuilder/DboBuilderTypes";

export const getFilterItemCondition = ({
  selItem,
  leftQ,
  rightF,
}: {
  leftQ: string;
  selItem: SelectItemValidated;
  rightF: unknown;
}): string => {
  const asValue = (v: any) => pgp.as.format("$1", [v]);

  const parseRightVal = (val: any, expect?: "csv" | "array" | "json" | "jsonb") => {
    try {
      return parseFilterRightValue(val, { selectItem: selItem, expect });
    } catch (e: any) {
      throw new Error(e);
    }
  };

  /* Matching sel item */
  if (isObject(rightF)) {
    const filterKeys = Object.keys(rightF);
    let filterOperand = filterKeys[0] as (typeof FILTER_OPERANDS)[number];

    /** JSON cannot be compared so we'll cast it to TEXT */
    if (selItem.column_udt_type === "json" || includes(TextFilterKeys, filterOperand)) {
      leftQ += "::TEXT ";
    }

    /** It's an object key which means it's an equality comparison against a json object */
    if (selItem.column_udt_type?.startsWith("json") && !includes(FILTER_OPERANDS, filterOperand)) {
      return leftQ + " = " + parseRightVal(rightF);
    }

    let filterValue = rightF[filterOperand] as string | null | number | Date | any[];
    const ALLOWED_FUNCS = [...GeomFilter_Funcs, ...TextFilter_FullTextSearchFilterKeys] as const;
    let funcName: undefined | (typeof ALLOWED_FUNCS)[number];
    let funcArgs: undefined | any[];

    if (
      selItem.column_udt_type === "interval" &&
      isObject(rightF) &&
      Object.values(rightF).every((v) => Number.isFinite(v))
    ) {
      filterOperand = "=";
      filterValue = Object.entries(rightF)
        .map(([k, v]) => `${v}${k}`)
        .join(" ");
    } else if (
      (filterKeys.length !== 1 || !isDefined(filterOperand)) &&
      selItem.column_udt_type !== "jsonb"
    ) {
      throw new Error("Bad filter. Expecting one key only");
    } else if (isObject(filterValue) && !(filterValue instanceof Date)) {
      /**
       * Filter notation
       * geom && st_makeenvelope(funcArgs)
       */
      const filterValueKeys = Object.keys(filterValue);
      funcName = filterValueKeys[0] as any;
      if (includes(ALLOWED_FUNCS, funcName)) {
        funcArgs = filterValue[funcName as any];
      } else {
        funcName = undefined;
      }
    }

    /** st_makeenvelope */
    if (
      includes(GeomFilterKeys, filterOperand) &&
      funcName &&
      includes(GeomFilter_Funcs, funcName)
    ) {
      /**
       * If leftQ is geography then:
       * - err can happen: 'Antipodal (180 degrees long) edge detected!'
       * - inacurrate results at large envelopes due to the curvature of the earth
       * https://gis.stackexchange.com/questions/78816/maximum-size-on-the-bounding-box-with-st-makeenvelope-and-and-geography-colum
       */
      if (funcName.toLowerCase() === "st_makeenvelope") {
        leftQ += "::geometry";
      }

      return `${leftQ} ${filterOperand} ${funcName}${parseRightVal(funcArgs, "csv")}`;
    } else if (["=", "$eq"].includes(filterOperand) && !funcName) {
      if (filterValue === null) return leftQ + " IS NULL ";
      return leftQ + " = " + parseRightVal(filterValue);
    } else if (["<>", "$ne"].includes(filterOperand)) {
      if (filterValue === null) return leftQ + " IS NOT NULL ";
      return leftQ + " <> " + parseRightVal(filterValue);
    } else if ([">", "$gt"].includes(filterOperand)) {
      return leftQ + " > " + parseRightVal(filterValue);
    } else if (["<", "$lt"].includes(filterOperand)) {
      return leftQ + " < " + parseRightVal(filterValue);
    } else if ([">=", "$gte"].includes(filterOperand)) {
      return leftQ + " >=  " + parseRightVal(filterValue);
    } else if (["<=", "$lte"].includes(filterOperand)) {
      return leftQ + " <= " + parseRightVal(filterValue);
    } else if (["$in", "$nin"].includes(filterOperand)) {
      const isIn = filterOperand === "$in";
      if (filterValue !== null && !Array.isArray(filterValue)) {
        throw new Error("In filter expects an array");
      }
      if (!filterValue?.length) {
        return isIn ? " FALSE " : " TRUE ";
      }

      const nonNullFilterValues = filterValue.filter((v) => v !== null);
      const conditions: string[] = [];
      if (nonNullFilterValues.length) {
        conditions.push(
          leftQ + (isIn ? " IN " : " NOT IN ") + parseRightVal(nonNullFilterValues, "csv"),
        );
      }
      if (filterValue.includes(null)) {
        const comparator = isIn ? " IS NULL " : " IS NOT NULL ";
        conditions.push(` ${leftQ} ${comparator} `);
      }
      const joinedConditions = conditions.join(isIn ? " OR " : " AND ");
      return conditions.length > 1 ? `(${joinedConditions})` : joinedConditions;
    } else if (["$between"].includes(filterOperand)) {
      if (!Array.isArray(filterValue) || filterValue.length !== 2) {
        throw new Error("Between filter expects an array of two values");
      }
      return leftQ + " BETWEEN " + asValue(filterValue[0]) + " AND " + asValue(filterValue[1]);
    } else if (["$ilike"].includes(filterOperand)) {
      return leftQ + " ILIKE " + asValue(filterValue);
    } else if (["$like"].includes(filterOperand)) {
      return leftQ + " LIKE " + asValue(filterValue);
    } else if (["$nilike"].includes(filterOperand)) {
      return leftQ + " NOT ILIKE " + asValue(filterValue);
    } else if (["$nlike"].includes(filterOperand)) {
      return leftQ + " NOT LIKE " + asValue(filterValue);
    } else if (filterOperand === "$isDistinctFrom" || filterOperand === "$isNotDistinctFrom") {
      const operator = FILTER_OPERAND_TO_SQL_OPERAND[filterOperand];
      return leftQ + ` ${operator} ` + asValue(filterValue);

      /* MAYBE TEXT OR MAYBE ARRAY */
    } else if (
      ["@>", "<@", "$contains", "$containedBy", "$overlaps", "&&", "@@"].includes(filterOperand)
    ) {
      const operand =
        filterOperand === "@@" ? "@@"
        : ["@>", "$contains"].includes(filterOperand) ? "@>"
        : ["&&", "$overlaps"].includes(filterOperand) ? "&&"
        : "<@";

      if (operand === "<@" || operand === "@>") {
        if (selItem.column_udt_type === "jsonb") {
          const filterValueAsString =
            typeof filterValue === "string" ? filterValue : JSON.stringify(filterValue);
          return leftQ + operand + parseRightVal(filterValueAsString);
        }
      }

      /* Array for sure */
      if (Array.isArray(filterValue)) {
        return leftQ + operand + parseRightVal(filterValue, "array");

        /* FTSQuery */
      } else if (
        ["@@"].includes(filterOperand) &&
        includes(TextFilter_FullTextSearchFilterKeys, funcName)
      ) {
        let lq = `to_tsvector(${leftQ}::text)`;
        if (selItem.columnPGDataType === "tsvector") lq = leftQ!;

        const res = `${lq} ${operand} ` + `${funcName}${parseRightVal(funcArgs, "csv")}`;

        return res;
      } else {
        throw new Error("Unrecognised filter operand: " + filterOperand + " ");
      }
    } else {
      throw new Error("Unrecognised filter operand: " + filterOperand + " ");
    }
  }
  /* Is an equal filter */
  if (rightF === null) {
    return leftQ + " IS NULL ";
  }

  /**
   * Ensure that when comparing an array to a json column, the array is cast to json
   */
  let valueStr = asValue(rightF);
  if (selItem.column_udt_type?.startsWith("json") && Array.isArray(rightF)) {
    valueStr = pgp.as.format(`$1::jsonb`, [JSON.stringify(rightF)]);
  }
  return `${leftQ} = ${valueStr}`;
};
