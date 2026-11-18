import pgPromise from "pg-promise";
import { asNameAlias } from "../../../utils/asNameAlias";
import { createFunc } from "./createFunc";

const pgp = pgPromise();

export const ARRAY_SEARCH = createFunc({
  name: "$array_search",
  type: "function",
  description: `Search a text array for non-overlapping literal matches per term. Accepts a string or a non-empty array of OR terms. Identical occurrences are returned once, with longer matches first at the same offset. Returns [{ index, offset, match, snippet }] in page/offset order. Index is the PostgreSQL array index (normally 1-based); offset is a 0-based character offset within that page, not a UTF-16 offset. Defaults: matchCase=false, contextChars=80 on each side, limit=20 per row. No matches or a null array returns [].`,
  argsSchema: {
    columnName: "string",
    searchTerm: { oneOf: ["string", "string[]"] },
    options: {
      optional: true,
      type: {
        matchCase: { type: "boolean", optional: true },
        contextChars: { type: "integer", optional: true },
        limit: { type: "integer", optional: true },
      },
    },
  },
  singleColArg: false,
  returnType: "jsonb",
  getFields: ({ columnName }) => [columnName],
  getQuery: ({ args: { columnName, searchTerm, options = {} }, tableAliasRaw, allColumns }) => {
    const searchTerms = Array.isArray(searchTerm) ? searchTerm : [searchTerm];
    if (!searchTerms.length || searchTerms.some((term) => !term.length)) {
      throw new Error(
        "$array_search search_term must be a non-empty string or array of non-empty strings",
      );
    }
    const { matchCase = false, contextChars = 80, limit = 20 } = options;
    if (contextChars < 0 || contextChars > 10000) {
      throw new Error("$array_search contextChars must be an integer between 0 and 10000");
    }
    if (limit < 1 || limit > 1000) {
      throw new Error("$array_search limit must be an integer between 1 and 1000");
    }

    const columnInfo = allColumns.find((col) => col.name === columnName);
    if (columnInfo?.udt_name !== ("_text" as "text")) {
      throw new Error("$array_search can only be used on text arrays");
    }
    const column = asNameAlias(columnName, tableAliasRaw);
    const terms = pgp.as.format("$1::text[]", [[...new Set(searchTerms)]]);
    /* The q flag treats each search term literally, including regex metacharacters. */
    const flags = matchCase ? "q" : "iq";
    return `(
      SELECT COALESCE(jsonb_agg(matches.result ORDER BY matches.page_index, matches.match_offset, matches.match_length DESC), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (page_index, match_offset, match_length)
          page_index, 
          match_offset, 
          length(search_term) AS match_length,
          jsonb_build_object(
            'index', page_index,
            'offset', match_offset,
            'match', substr(page_text, match_offset + 1, length(search_term)),
            'snippet', substr(page_text, greatest(1, match_offset + 1 - ${contextChars}),
              least(match_offset, ${contextChars}) + length(search_term) + ${contextChars})
          ) AS result
        FROM (SELECT ${column} AS pages) AS source
        /* Read the page texts sequentially and retain the array's actual subscripts. */
        CROSS JOIN LATERAL ROWS FROM (unnest(pages), generate_subscripts(pages, 1)) AS page(page_text, page_index)
        CROSS JOIN unnest(${terms}) AS terms(search_term)
        CROSS JOIN LATERAL (
          SELECT (sum(length(part) + length(search_term)) OVER (ORDER BY part_index)
            - length(search_term))::integer AS match_offset,
            lead(part_index) OVER (ORDER BY part_index) AS next_part
          FROM regexp_split_to_table(page_text, search_term, '${flags}')
            WITH ORDINALITY AS parts(part, part_index)
        ) AS offsets
        WHERE array_ndims(pages) = 1 AND next_part IS NOT NULL
        ORDER BY page_index, match_offset, match_length DESC
        LIMIT ${limit}
      ) AS matches
    )`;
  },
});
