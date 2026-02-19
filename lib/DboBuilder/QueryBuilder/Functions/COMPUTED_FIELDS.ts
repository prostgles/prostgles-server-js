import { asNameAlias } from "../../../utils/asNameAlias";
import type { FieldSpec } from "./Functions";
/* The difference between a function and computed field is that the computed field does not require any arguments */
export const COMPUTED_FIELDS: FieldSpec[] = [
  /**
   * Used instead of row id. Must be used as a last resort. Use all non pseudo or domain data type columns first!
   */
  {
    name: "$rowhash",
    type: "computed",
    // description: ` order hash of row content  `,
    getQuery: ({ allowedFields, tableAliasRaw: tableAlias, ctidField }) => {
      return (
        "md5(" +
        allowedFields

          /* CTID not available in AFTER trigger */
          // .concat(ctidField? [ctidField] : [])
          .sort()
          .map((f) => asNameAlias(f, tableAlias))
          .map((f) => `md5(coalesce(${f}::text, 'dd'))`)
          .join(" || ") +
        `)`
      );
    },
  },
  // ,{
  //   name: "ctid",
  //   type: "computed",
  //   // description: ` order hash of row content  `,
  //   getQuery: ({ allowedFields, tableAlias, ctidField }) => {
  //     return asNameAlias("ctid", tableAlias);
  //   }
  // }
];
