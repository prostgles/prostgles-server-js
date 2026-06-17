import * as pgPromise from "pg-promise";
import { asNameAlias } from "../../../utils/asNameAlias";
import type { FunctionSpec } from "./Functions";

const pgp = pgPromise();

const MAX_COL_NUM = 1600;

export const HASHING_FUNCTIONS: FunctionSpec[] = [
  // Hashing
  {
    name: "$md5_multi",
    description: ` :[...column_names] -> md5 hash of the column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "md5(" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )")
            .join(" || ") +
          ")",
      );
      return q;
    },
  },
  {
    name: "$md5_multi_agg",
    description: ` :[...column_names] -> md5 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "md5(string_agg(" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )")
            .join(" || ") +
          ", ','))",
      );
      return q;
    },
  },

  {
    name: "$sha256_multi",
    description: ` :[...column_names] -> sha256 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha256((" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )")
            .join(" || ") +
          ")::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha256_multi_agg",
    description: ` :[...column_names] -> sha256 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha256(string_agg(" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )")
            .join(" || ") +
          ", ',')::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha512_multi",
    description: ` :[...column_names] -> sha512 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha512((" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )")
            .join(" || ") +
          ")::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha512_multi_agg",
    description: ` :[...column_names] -> sha512 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAliasRaw: tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha512(string_agg(" +
          args
            .map((fname) => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )")
            .join(" || ") +
          ", ',')::text::bytea), 'hex')",
      );
      return q;
    },
  },
];
