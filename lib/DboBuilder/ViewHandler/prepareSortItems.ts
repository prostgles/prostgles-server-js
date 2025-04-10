import { OrderBy, asName, isDefined, isEmpty, isObject } from "prostgles-types/dist";
import { SortItem } from "../DboBuilder";
import { NewQueryJoin, SelectItemValidated, asNameAlias } from "../QueryBuilder/QueryBuilder";
import {
  getJSONBObjectSchemaValidationError,
  validateJSONBObjectAgainstSchema,
} from "../../JSONBValidation/JSONBValidation";

/* This relates only to SELECT */
export const prepareSortItems = (
  rawOrderBy: OrderBy | undefined,
  allowed_cols: string[],
  tableAlias: string | undefined,
  select: SelectItemValidated[],
  joinQueries: NewQueryJoin[]
): SortItem[] => {
  if (!rawOrderBy) return [];

  let orderBy: {
    key: string;
    asc: boolean;
    nulls?: "first" | "last";
    nullEmpty?: boolean;
  }[] = [];
  if (isObject(rawOrderBy)) {
    orderBy = parseOrderObj(rawOrderBy);
  } else if (typeof rawOrderBy === "string") {
    /* string */
    orderBy = [{ key: rawOrderBy, asc: true }];
  } else if (Array.isArray(rawOrderBy)) {
    /* Order by is formed of a list of ascending field names */
    const _orderBy = rawOrderBy as any[];
    if (!_orderBy.find((v) => typeof v !== "string")) {
      /* [string] */
      orderBy = _orderBy.map((key) => ({ key, asc: true }));
    } else if (_orderBy.find((v) => isObject(v) && !isEmpty(v))) {
      orderBy = _orderBy.map((v) => parseOrderObj(v, true)[0]!);
    } else return throwErr(rawOrderBy);
  } else return throwErr(rawOrderBy);

  if (!orderBy.length) return [];

  const validatedAggAliases = select
    .filter(
      (s) =>
        s.type !== "joinedColumn" &&
        (!s.fields.length || s.fields.every((f) => allowed_cols.includes(f)))
    )
    .map((s) => s.alias);

  const sortableNestedColumns = joinQueries.flatMap((jq) =>
    jq.select.map((selectItem) => {
      const joinAlias = jq.tableAlias ?? jq.table;
      return {
        ...jq,
        selectItem,
        joinAlias,
        key: `${joinAlias}.${selectItem.alias}`,
      };
    })
  );
  const bad_param = orderBy.find(
    ({ key }) =>
      !sortableNestedColumns.some((v) => v.key === key) &&
      !validatedAggAliases.includes(key) &&
      !allowed_cols.includes(key)
  );
  if (bad_param) {
    throw "Invalid/disallowed orderBy fields or params: " + bad_param.key;
  }

  const selectedAliases = select.filter((s) => s.selected).map((s) => s.alias);

  const result: SortItem[] = orderBy.map(({ key, asc, nulls, nullEmpty = false }) => {
    const nestedField = sortableNestedColumns.find((f) => f.key === key);
    if (nestedField) {
      const { table, selectItem, joinAlias } = nestedField;

      const comparableDataTypeCast =
        ["uuid", "xml"].includes(selectItem.column_udt_type ?? "") ? "::TEXT" : "";
      const sortItemAlias = asName(`prostgles_nested_sort_${selectItem.alias}`);

      return {
        key,
        type: "query",
        asc,
        nulls,
        nullEmpty,
        nested: {
          table,
          joinAlias,
          selectItemAlias: selectItem.alias,
          isNumeric: selectItem.tsDataType === "number",
          wrapperQuerySortItem: `${asc ? "MIN" : "MAX"}(${asNameAlias(selectItem.alias, joinAlias)}${comparableDataTypeCast}) as ${sortItemAlias}`,
        },
        fieldQuery: `${asName(joinAlias)}.${sortItemAlias + (asc ? "" : " DESC")} ${nulls ? `NULLS ${nulls === "last" ? "LAST" : "FIRST"}` : ""}`,
      };
    }
    /* Order by column index when possible to bypass name collision when ordering by a computed column. 
        (Postgres will sort by existing columns wheundefined possible) 
    */

    const index = selectedAliases.indexOf(key) + 1;
    let colKey =
      index > 0 && !nullEmpty ? index : [tableAlias, key].filter(isDefined).map(asName).join(".");
    if (nullEmpty) {
      colKey = `nullif(trim(${colKey}::text), '')`;
    }

    if (typeof colKey === "number") {
      return {
        key,
        type: "position",
        asc,
        nulls,
        nullEmpty,
        fieldPosition: colKey,
      };
    }

    return {
      key,
      type: "query",
      fieldQuery: colKey,
      nulls,
      nullEmpty,
      asc,
    };
  });

  return result;
};

const throwErr = (rawOrderBy: any) => {
  throw (
    "\nInvalid orderBy option -> " +
    JSON.stringify(rawOrderBy) +
    "Expecting: \
        { key2: false, \"nested.key2\": false, key1: true } \
        { key1: 1, key2: -1 } \
        [{ key1: true }, { key2: false }] \
        { key: 'colName', asc: true, nulls: 'first', nullEmpty: true } \
        [{ key: 'colName', asc: true, nulls: 'first', nullEmpty: true }]"
  );
};

const parseOrderObj = (
  orderBy: any,
  expectOne = false
): {
  key: string;
  asc: boolean;
  nulls?: "first" | "last";
  nullEmpty?: boolean;
}[] => {
  if (!isObject(orderBy)) {
    return throwErr(orderBy);
  }

  const keys = Object.keys(orderBy);
  if (typeof orderBy.key === "string") {
    const { error, data } = getJSONBObjectSchemaValidationError(
      {
        key: "string",
        asc: { enum: [1, -1, false, true, null], optional: true },
        nulls: { enum: ["first", "last", null], optional: true },
        nullEmpty: { enum: [false, true, null], optional: true },
      } as const,
      orderBy,
      "orderBy"
    );
    if (data) {
      const { key, asc = true, nulls, nullEmpty = false } = data;
      return [
        {
          key,
          asc: asc === true || asc === 1,
          nulls: nulls || undefined,
          nullEmpty: nullEmpty || undefined,
        },
      ];
    } else {
      throw [
        error,
        `Invalid orderBy option (${JSON.stringify(orderBy, null, 2)})`,
        `Expecting { key: string, asc?: boolean, nulls?: 'first' | 'last' | null | undefined, nullEmpty?: boolean }`,
      ].join("\n");
    }
  }

  if (expectOne && keys.length > 1) {
    throw (
      "\nInvalid orderBy " +
      JSON.stringify(orderBy) +
      "\nEach orderBy array element cannot have more than one key"
    );
  }
  /* { key2: true, key1: false } */
  if (!Object.values(orderBy).find((v) => ![true, false].includes(v))) {
    return keys.map((key) => ({ key, asc: Boolean(orderBy[key]) }));

    /* { key2: -1, key1: 1 } */
  } else if (!Object.values(orderBy).find((v) => ![-1, 1].includes(v))) {
    return keys.map((key) => ({ key, asc: orderBy[key] === 1 }));

    /* { key2: "asc", key1: "desc" } */
  } else if (!Object.values(orderBy).find((v) => !["asc", "desc"].includes(v))) {
    return keys.map((key) => ({ key, asc: orderBy[key] === "asc" }));
  } else return throwErr(orderBy);
};
