import { getEntries, TextFilter_FullTextSearchFilterKeys } from "prostgles-types";
import { pgp } from "../../DboBuilderTypes";
import { asNameAlias } from "../../../utils/asNameAlias";
import { createFunc } from "./createFunc";

export const TS_HEADLINE = createFunc({
  name: "$ts_headline",
  type: "function",
  description:
    "Return passages with matching words marked. lang accepts any installed PostgreSQL text search configuration and defaults to the database setting. queryType defaults to websearch_to_tsquery. Use the same language and parser as the full-text filter. Set maxFragments to choose how many matching passages to return.",
  argsSchema: {
    columnName: "string",
    searchText: "string",
    options: {
      optional: true,
      type: {
        lang: { type: "string", optional: true },
        queryType: { enum: TextFilter_FullTextSearchFilterKeys, optional: true },
        maxFragments: { type: "integer", optional: true },
        minWords: { type: "integer", optional: true },
        maxWords: { type: "integer", optional: true },
        shortWord: { type: "integer", optional: true },
        highlightAll: { type: "boolean", optional: true },
        startSel: { type: "string", optional: true },
        stopSel: { type: "string", optional: true },
        fragmentDelimiter: { type: "string", optional: true },
      },
    },
  },
  singleColArg: false,
  returnType: "text",
  getFields: ({ columnName }) => [columnName],
  getQuery: ({ args: { columnName, searchText, options = {} }, tableAliasRaw }) => {
    const { lang, queryType = "websearch_to_tsquery", shortWord = 1, ...passageOptions } = options;
    const configSQL =
      lang === undefined ? "get_current_ts_config()" : pgp.as.format("$1::regconfig", [lang]);
    const document = asNameAlias(columnName, tableAliasRaw);
    const searchQuery = `${queryType}(${configSQL}, ${pgp.as.text(searchText)})`;
    const headlineOptions = getEntries({ shortWord, ...passageOptions })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        /* PostgreSQL headline options use doubled quotes inside quoted values. */
        const escaped = typeof value === "string" ? `"${value.replaceAll('"', '""')}"` : value;
        return `${key}=${escaped}`;
      })
      .join(", ");
    return `ts_headline(${configSQL}, ${document}::text, ${searchQuery}, ${pgp.as.text(headlineOptions)})`;
  },
});
