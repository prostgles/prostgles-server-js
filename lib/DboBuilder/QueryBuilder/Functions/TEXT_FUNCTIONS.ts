import { isEmpty, postgresToTsType } from "prostgles-types";
import { asValue } from "../../../PubSubManager/PubSubManagerUtils";
import { parseFieldFilter } from "../../ViewHandler/parseFieldFilter";
import { asFunction } from "./utils";
import type { FunctionSpec } from "./Functions";
import * as pgPromise from "pg-promise";
import { asNameAlias } from "../../../utils/asNameAlias";
const pgp = pgPromise();

export const TEXT_FUNCTIONS: FunctionSpec[] = [
  {
    name: "$left",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
      return pgp.as.format("LEFT(" + asNameAlias(args[0], tableAlias) + ", $1)", [args[1]]);
    },
  },
  {
    name: "$column",
    description: ` :[column_name] -> Returns the column value as is`,
    type: "function",
    numArgs: 1,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
      const aliasedColumnName = args[0];
      if (!aliasedColumnName) {
        throw `$column: column_name is required`;
      }
      return pgp.as.format(asNameAlias(aliasedColumnName, tableAlias));
    },
  },
  {
    name: "$unnest_words",
    description: ` :[column_name] -> Splits string at spaces`,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
      return pgp.as.format(
        "unnest(string_to_array(" + asNameAlias(args[0], tableAlias) + "::TEXT , ' '))",
      ); //, [args[1]]
    },
  } satisfies FunctionSpec,
  {
    name: "$right",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
      return pgp.as.format("RIGHT(" + asNameAlias(args[0], tableAlias) + ", $1)", [args[1]]);
    },
  },

  {
    name: "$to_char",
    type: "function",
    description: ` :[column_name, format<string>] -> format dates and strings. Eg: [current_timestamp, 'HH12:MI:SS']`,
    singleColArg: false,
    numArgs: 2,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
      if (args.length === 3) {
        return pgp.as.format("to_char(" + asNameAlias(args[0], tableAlias) + ", $2, $3)", [
          args[0],
          args[1],
          args[2],
        ]);
      }
      return pgp.as.format("to_char(" + asNameAlias(args[0], tableAlias) + ", $2)", [
        args[0],
        args[1],
      ]);
    },
  },

  /* Text col and value funcs */
  ...["position", "position_lower"].map((funcName) =>
    asFunction({
      name: "$" + funcName,
      type: "function",
      numArgs: 1,
      singleColArg: false,
      getFields: (args: any[]) => [args[1]],
      getQuery: ({ args, tableAliasRaw: tableAlias }) => {
        let a1 = asValue(args[0]),
          a2 = asNameAlias(args[1], tableAlias);
        if (funcName === "position_lower") {
          a1 = `LOWER(${a1}::text)`;
          a2 = `LOWER(${a2}::text)`;
        }
        return `position( ${a1} IN ${a2} )`;
      },
    }),
  ),
  ...["template_string"].map((funcName) =>
    asFunction({
      name: "$" + funcName,
      type: "function",
      numArgs: 1,
      minCols: 0,
      singleColArg: false,
      getFields: (args: any[]) => [] as string[], // Fields not validated because we'll use the allowed ones anyway
      getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias }) => {
        if (typeof args[0] !== "string")
          throw "First argument must be a string. E.g.: '{col1} ..text {col2} ...' ";

        const rawValue = args[0];
        let finalValue = rawValue;
        const usedColumns = allowedFields.filter((fName) => rawValue.includes(`{${fName}}`));
        usedColumns.forEach((colName, idx) => {
          finalValue = finalValue.split(`{${colName}}`).join(`%${idx + 1}$s`);
        });
        finalValue = asValue(finalValue);

        if (usedColumns.length) {
          return `format(${finalValue}, ${usedColumns.map((c) => `${asNameAlias(c, tableAlias)}::TEXT`).join(", ")})`;
        }

        return `format(${finalValue})`;
      },
    }),
  ),

  /** Custom highlight -> myterm => ['some text and', ['myterm'], ' and some other text']
   * (fields: "*" | string[], term: string, { edgeTruncate: number = -1; noFields: boolean = false }) => string | (string | [string])[]
   * edgeTruncate = maximum extra characters left and right of matches
   * noFields = exclude field names in search
   * */
  asFunction({
    name: "$term_highlight" /* */,
    description: ` :[column_names<string[] | "*">, search_term<string>, opts?<{ returnIndex?: number; edgeTruncate?: number; noFields?: boolean }>] -> get case-insensitive text match highlight`,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    canBeUsedForFilter: true,
    getFields: (args: any[]) => args[0],
    getQuery: ({ allowedFields, args, tableAliasRaw: tableAlias, allColumns }) => {
      const cols = parseFieldFilter(args[0], false, allowedFields);
      let term = args[1];
      const rawTerm = args[1];
      const { edgeTruncate, noFields = false, returnType, matchCase = false } = args[2] || {};
      if (!isEmpty(args[2])) {
        const keys = Object.keys(args[2]);
        const validKeys = ["edgeTruncate", "noFields", "returnType", "matchCase"];
        const bad_keys = keys.filter((k) => !validKeys.includes(k));
        if (bad_keys.length)
          throw (
            "Invalid options provided for $term_highlight. Expecting one of: " +
            validKeys.join(", ")
          );
      }
      if (!cols.length) throw "Cols are empty/invalid";
      if (typeof term !== "string") throw "Non string term provided: " + term;
      if (edgeTruncate !== undefined && (!Number.isInteger(edgeTruncate) || edgeTruncate < -1))
        throw "Invalid edgeTruncate. expecting a positive integer";
      if (typeof noFields !== "boolean") throw "Invalid noFields. expecting boolean";
      const RETURN_TYPES = ["index", "boolean", "object"];
      if (returnType && !RETURN_TYPES.includes(returnType)) {
        throw `returnType can only be one of: ${RETURN_TYPES}`;
      }

      const makeTextMatcherArray = (rawText: string, _term: string) => {
        let matchText = rawText,
          term = _term;
        if (!matchCase) {
          matchText = `LOWER(${rawText})`;
          term = `LOWER(${term})`;
        }
        let leftStr = `substr(${rawText}, 1, position(${term} IN ${matchText}) - 1 )`,
          rightStr = `substr(${rawText}, position(${term} IN ${matchText}) + length(${term}) )`;
        if (edgeTruncate) {
          leftStr = `RIGHT(${leftStr}, ${asValue(edgeTruncate)})`;
          rightStr = `LEFT(${rightStr}, ${asValue(edgeTruncate)})`;
        }
        return `
          CASE WHEN position(${term} IN ${matchText}) > 0 AND ${term} <> '' 
            THEN array_to_json(ARRAY[
                to_json( ${leftStr}::TEXT ), 
                array_to_json(
                  ARRAY[substr(${rawText}, position(${term} IN ${matchText}), length(${term}) )::TEXT ]
                ),
                to_json(${rightStr}::TEXT ) 
              ]) 
            ELSE 
              array_to_json(ARRAY[(${rawText})::TEXT]) 
          END
        `;
      };

      const colRaw =
        "( " +
        cols
          .map(
            (c) =>
              `${noFields ? "" : asValue(c + ": ") + " || "} COALESCE(${asNameAlias(c, tableAlias)}::TEXT, '')`,
          )
          .join(" || ', ' || ") +
        " )";
      let col = colRaw;
      term = asValue(term);
      if (!matchCase) {
        col = "LOWER" + col;
        term = `LOWER(${term})`;
      }

      let leftStr = `substr(${colRaw}, 1, position(${term} IN ${col}) - 1 )`,
        rightStr = `substr(${colRaw}, position(${term} IN ${col}) + length(${term}) )`;
      if (edgeTruncate) {
        leftStr = `RIGHT(${leftStr}, ${asValue(edgeTruncate)})`;
        rightStr = `LEFT(${rightStr}, ${asValue(edgeTruncate)})`;
      }

      // console.log(col);
      let res = "";
      if (returnType === "index") {
        res = `CASE WHEN position(${term} IN ${col}) > 0 THEN position(${term} IN ${col}) - 1 ELSE -1 END`;

        // } else if(returnType === "boolean"){
        //   res = `CASE WHEN position(${term} IN ${col}) > 0 THEN TRUE ELSE FALSE END`;
      } else if (returnType === "object" || returnType === "boolean") {
        const hasChars = Boolean(rawTerm && /[a-z]/i.test(rawTerm));
        const validCols = cols
          .map((c) => {
            const colInfo = allColumns.find((ac) => ac.name === c);
            return {
              key: c,
              colInfo,
            };
          })
          .filter((c) => c.colInfo && c.colInfo.udt_name !== "bytea");

        const _cols = validCols.filter(
          (c) =>
            /** Exclude numeric columns when the search tern contains a character */
            !hasChars || postgresToTsType(c.colInfo!.udt_name) !== "number",
        );

        /** This will break GROUP BY (non-integer constant in GROUP BY) */
        if (!_cols.length) {
          if (validCols.length && hasChars)
            throw `You're searching the impossible: characters in numeric fields. Use this to prevent making such a request in future: /[a-z]/i.test(your_term) `;
          return returnType === "boolean" ? "FALSE" : "NULL";
        }
        res = `CASE 
          ${_cols
            .map((c) => {
              const colNameEscaped = asNameAlias(c.key, tableAlias);
              let colSelect = `${colNameEscaped}::TEXT`;
              const isTstamp = c.colInfo?.udt_name.startsWith("timestamp");
              if (isTstamp || c.colInfo?.udt_name === "date") {
                colSelect = `( CASE WHEN ${colNameEscaped} IS NULL THEN '' 
              ELSE concat_ws(' ', 
                trim(to_char(${colNameEscaped}, 'YYYY-MM-DD HH24:MI:SS')), 
                trim(to_char(${colNameEscaped}, 'Day Month')), 
                'Q' || trim(to_char(${colNameEscaped}, 'Q')),
                'WK' || trim(to_char(${colNameEscaped}, 'WW'))
              ) END)`;
              }
              const colTxt = `COALESCE(${colSelect}, '')`; //  position(${term} IN ${colTxt}) > 0
              if (returnType === "boolean") {
                return ` 
                WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue("%" + rawTerm + "%")}
                  THEN TRUE
                `;
              }
              return ` 
              WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue("%" + rawTerm + "%")}
                THEN json_build_object(
                  ${asValue(c.key)}, 
                  ${makeTextMatcherArray(colTxt, term)}
                )::jsonb
              `;
            })
            .join(" ")}
          ELSE ${returnType === "boolean" ? "FALSE" : "NULL"}

        END`;

        // console.log(res)
      } else {
        /* If no match or empty search THEN return full row as string within first array element  */
        res = `CASE WHEN position(${term} IN ${col}) > 0 AND ${term} <> '' THEN array_to_json(ARRAY[
          to_json( ${leftStr}::TEXT ), 
          array_to_json(
            ARRAY[substr(${colRaw}, position(${term} IN ${col}), length(${term}) )::TEXT ]
          ),
          to_json(${rightStr}::TEXT ) 
        ]) ELSE array_to_json(ARRAY[(${colRaw})::TEXT]) END`;
      }

      return res;
    },
  } satisfies FunctionSpec),
];
