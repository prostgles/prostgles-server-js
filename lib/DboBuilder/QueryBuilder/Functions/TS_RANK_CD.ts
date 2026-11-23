import { TextFilter_FullTextSearchFilterKeys } from "prostgles-types";
import { pgp } from "../../DboBuilderTypes";
import { asNameAlias } from "../../../utils/asNameAlias";
import { createFunc } from "./createFunc";

export const TS_RANK_CD = createFunc({
  name: "$ts_rank_cd",
  type: "function",
  description:
    "Rank a tsvector column using PostgreSQL cover-density ranking. Defaults: config=english, queryType=websearch_to_tsquery, normalization=0. Use the same config and query as the @@ filter; config must match the stored vector. Apply @@ for matching: a positive rank does not enforce query exclusions. Supports OR and quoted phrases with the default query type. Returns a numeric score, or null for a null vector. Select an alias to order matching rows by descending rank before applying limit.",
  argsSchema: {
    columnName: "string",
    searchTerm: "string",
    options: {
      optional: true,
      type: {
        config: { type: "string", optional: true },
        queryType: { enum: TextFilter_FullTextSearchFilterKeys, optional: true },
        normalization: { type: "integer", optional: true },
      },
    },
  },
  singleColArg: false,
  returnType: "float4",
  getFields: ({ columnName }) => [columnName],
  getQuery: ({ args: { columnName, searchTerm, options = {} }, tableAliasRaw, allColumns }) => {
    if (!searchTerm.trim()) {
      throw new Error("$ts_rank_cd requires a non-empty search term");
    }
    const { config = "english", queryType = "websearch_to_tsquery", normalization = 0 } = options;
    if (normalization < 0 || normalization > 63) {
      throw new Error("$ts_rank_cd normalization must be an integer between 0 and 63");
    }
    const columnInfo = allColumns.find((column) => column.name === columnName);
    if (columnInfo?.udt_name !== "tsvector") {
      throw new Error("$ts_rank_cd can only be used on tsvector columns");
    }
    const column = asNameAlias(columnName, tableAliasRaw);
    const query = pgp.as.format(`${queryType}($1::regconfig, $2)`, [config, searchTerm]);
    return `ts_rank_cd(${column}, ${query}, ${normalization})`;
  },
});
