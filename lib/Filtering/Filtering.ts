import type { FullFilter } from "prostgles-types";
import {
  BetweenFilterKeys,
  CompareFilterKeys,
  CompareInFilterKeys,
  JsonbFilterKeys,
  TextFilterKeys,
  isDefined,
  isEmpty,
} from "prostgles-types";
import { pgp } from "../DboBuilder/DboBuilderTypes";
import { type SelectItemValidated } from "../DboBuilder/QueryBuilder/QueryBuilder";
import { getFilterItemCondition } from "./getFilterItemCondition";

export const FILTER_OPERANDS = [
  ...TextFilterKeys,
  ...JsonbFilterKeys,
  ...CompareFilterKeys,
  ...BetweenFilterKeys,
  ...CompareInFilterKeys,
] as const;

export const FILTER_OPERAND_TO_SQL_OPERAND = Object.fromEntries(
  FILTER_OPERANDS.map((filterOperand) => {
    let sqlOperand = filterOperand as string;
    if (filterOperand === "$eq") sqlOperand = "=";
    else if (filterOperand === "$gt") sqlOperand = ">";
    else if (filterOperand === "$gte") sqlOperand = ">=";
    else if (filterOperand === "$lt") sqlOperand = "<";
    else if (filterOperand === "$lte") sqlOperand = "<=";
    else if (filterOperand === "$ne") sqlOperand = "<>";
    else if (filterOperand === "$like") sqlOperand = "LIKE";
    else if (filterOperand === "$ilike") sqlOperand = "ILIKE";
    else if (filterOperand === "$nlike") sqlOperand = "NOT LIKE";
    else if (filterOperand === "$nilike") sqlOperand = "NOT ILIKE";
    else if (filterOperand === "$in") sqlOperand = "IN";
    else if (filterOperand === "$nin") sqlOperand = "NOT IN";
    else if (filterOperand === "$between") sqlOperand = "BETWEEN";
    else if (filterOperand === "$notBetween") sqlOperand = "NOT BETWEEN";
    else if (filterOperand === "$isDistinctFrom") sqlOperand = "IS DISTINCT FROM";
    else if (filterOperand === "$isNotDistinctFrom") sqlOperand = "IS NOT DISTINCT FROM";
    return [filterOperand, sqlOperand];
  }),
) as Record<(typeof FILTER_OPERANDS)[number], string>;

/**
 * Parse a single filter
 * Ensure only single key objects reach this point
 */
type ParseFilterItemArgs = {
  filter: FullFilter<void, void> | undefined;
  select: SelectItemValidated[] | undefined;
  tableAliasRaw: string | undefined;
  allowedColumnNames: string[];
};

export const parseFilterItem = (
  args: ParseFilterItemArgs,
): { condition: string; columnsUsed: string[] } | undefined => {
  const { filter: filterItem, select, tableAliasRaw, allowedColumnNames } = args;

  if (!filterItem || isEmpty(filterItem)) return;

  const makeError = (msg: string): never => {
    throw `${msg}: ${JSON.stringify(filterItem, null, 2)}`;
  };
  const asValue = (v: any) => pgp.as.format("$1", [v]);

  const filterEntries = Object.entries(filterItem);
  const [firstFilterEntry, ...otherFilterEnties] = filterEntries;
  if (!firstFilterEntry) {
    return;

    /**
     * { field1: cond1, field2: cond2 }
     */
  } else if (otherFilterEnties.length) {
    const items = filterEntries
      .map(([filterKey, filterValue]) =>
        parseFilterItem({
          filter: { [filterKey]: filterValue },
          select,
          tableAliasRaw,
          allowedColumnNames,
        }),
      )
      .filter(isDefined);

    const condition = items
      .map((i) => i.condition)
      .sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
      .join(" AND ");
    const columnsUsed = items.map((i) => i.columnsUsed).flat();

    return { condition, columnsUsed };
  }

  // const fKey: string = filterKeys[0]!;
  const [firstFilterKey, firstFilterValue] = firstFilterEntry;
  let selItem: SelectItemValidated | undefined;
  if (select) {
    selItem = select.find((s) => firstFilterKey === s.alias);
  }
  let rightF = firstFilterValue;

  const validateSelectedItemFilter = (selectedItem: SelectItemValidated | undefined) => {
    const fields = selectedItem?.fields;
    if (Array.isArray(fields) && fields.length) {
      const dissallowedFields = fields.filter((fname) => !allowedColumnNames.includes(fname));
      if (dissallowedFields.length) {
        throw new Error(
          `Invalid/disallowed columns found in filter: ${dissallowedFields.join(", ")}`,
        );
      }
    }
  };
  const getLeftQ = (selItm: SelectItemValidated) => {
    validateSelectedItemFilter(selItem);
    if (selItm.type === "function" || selItm.type === "aggregation") return selItm.getQuery();
    return selItm.getQuery(tableAliasRaw);
  };

  /**
   * Parsed left side of the query
   */
  let leftQ: string | undefined; // = asName(selItem.alias);

  /* 
    Select item not found. 
    Check if dot/json notation. Build obj if necessary 
    */
  const dot_notation_delims = ["->", "."];
  if (!selItem) {
    /* See if dot notation. Pick the best matching starting string */
    if (select) {
      selItem = select.find((s) =>
        dot_notation_delims.find((delimiter) => firstFilterKey.startsWith(s.alias + delimiter)),
      );
      validateSelectedItemFilter(selItem);
    }
    if (!selItem) {
      return makeError(
        "Bad filter. Could not match to a column or alias or dot notation" +
          select?.map((s) => s.alias).join(", "),
      );
    }

    let remainingStr = firstFilterKey.slice(selItem.alias.length);

    /* Is json path spec */
    if (remainingStr.startsWith("->")) {
      /** Has shorthand operand 'col->>key.<>'  */
      const matchingOperand = CompareFilterKeys.find((operand) =>
        remainingStr.endsWith(`.${operand}`),
      );
      if (matchingOperand) {
        remainingStr = remainingStr.slice(0, -matchingOperand.length - 1);
        rightF = { [matchingOperand]: rightF };
      }

      leftQ = getLeftQ(selItem);

      /**
       * get json path separators. Expecting -> to come first
       */
      type GetSepRes = { idx: number; sep: string } | undefined;
      const getSep = (fromIdx = 0): GetSepRes => {
        const strPart = remainingStr.slice(fromIdx);
        let idx = strPart.indexOf("->");
        const idxx = strPart.indexOf("->>");
        if (idx > -1) {
          /* if -> matches then check if it's the last separator */
          if (idx === idxx) return { idx: idx + fromIdx, sep: "->>" };
          return { idx: idx + fromIdx, sep: "->" };
        }
        idx = strPart.indexOf("->>");
        if (idx > -1) {
          return { idx: idx + fromIdx, sep: "->>" };
        }

        return undefined;
      };

      let currSep = getSep();
      while (currSep) {
        let nextSep = getSep(currSep.idx + currSep.sep.length);

        let nextIdx = nextSep ? nextSep.idx : remainingStr.length;

        /* If ending in set then add set as well into key */
        if (nextSep && nextIdx + nextSep.sep.length === remainingStr.length) {
          nextIdx = remainingStr.length;
          nextSep = undefined;
        }

        leftQ +=
          currSep.sep + asValue(remainingStr.slice(currSep.idx + currSep.sep.length, nextIdx));
        currSep = nextSep;
      }

      /* 
      Is collapsed filter spec  e.g. { "col.$ilike": 'text' } 
      will transform into { col: { $ilike: ['text'] } }
    */
    } else if (remainingStr.startsWith(".")) {
      leftQ = getLeftQ(selItem);

      const getSep = (fromIdx = 0) => {
        const idx = remainingStr.slice(fromIdx).indexOf(".");
        if (idx > -1) return fromIdx + idx;
        return idx;
      };
      let currIdx = getSep();
      const res: any = {};
      let curObj = res;

      while (currIdx > -1) {
        let nextIdx = getSep(currIdx + 1);
        let nIdx = nextIdx > -1 ? nextIdx : remainingStr.length;

        /* If ending in dot then add dot as well into key */
        if (nextIdx + 1 === remainingStr.length) {
          nIdx = remainingStr.length;
          nextIdx = -1;
        }

        const key = remainingStr.slice(currIdx + 1, nIdx);
        curObj[key] = nextIdx > -1 ? {} : firstFilterValue;
        curObj = curObj[key];

        currIdx = nextIdx;
      }

      rightF = res;
    } else {
      // console.trace(141, select, selItem, remainingStr)
      makeError("Bad filter. Could not find the valid col name or alias or col json path");
    }
  } else {
    leftQ = getLeftQ(selItem);
  }

  if (!leftQ) {
    makeError("Internal error: leftQ missing?!");
    return;
  }

  try {
    const condition = getFilterItemCondition({
      selItem,
      leftQ,
      rightF,
    });
    return {
      condition,
      columnsUsed: selItem.fields,
    };
  } catch (e) {
    return makeError((e as Error).message);
  }
};

// ensure pgp is not NULL!!!
// const asValue = v => v;// pgp.as.value;

// const filters: FilterSpec[] = [
//   ...(["ilike", "like"].map(op => ({
//     operands: ["$" + op],
//     tsDataTypes: ["any"] as TSDataType[],
//     tsDefinition: ` { $${op}: string } `,
//     // data_types:
//     getQuery: (leftQuery: string, rightVal: any) => {
//       return `${leftQuery}::text ${op.toUpperCase()} ${asValue(rightVal)}::text`
//     }
//   }))),
//   {
//     operands: ["", "="],
//     tsDataTypes: ["any"],
//     tsDefinition: ` { "=": any } | any `,
//     // data_types:
//     getQuery: (leftQuery: string, rightVal: any) => {
//       if(rightVal === null) return`${leftQuery} IS NULL `;
//       return `${leftQuery} = ${asValue(rightVal)}`;
//     }
//   }
// ];
