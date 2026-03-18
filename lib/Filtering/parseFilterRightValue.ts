import { pgp } from "../DboBuilder/DboBuilderTypes";
import { type SelectItemValidated } from "../DboBuilder/QueryBuilder/QueryBuilder";

type ParseRightValOpts = {
  expect?: "csv" | "array" | "json" | "jsonb";
  selectItem: SelectItemValidated | undefined;
};
export const parseFilterRightValue = (val: any, { expect, selectItem }: ParseRightValOpts) => {
  const asValue = (v: any) => pgp.as.format("$1", [v]);
  const checkIfArr = () => {
    if (!Array.isArray(val)) {
      throw "This type of filter/column expects an Array of items";
    }
  };
  if (expect === "csv" || expect?.startsWith("json")) {
    checkIfArr();
    return pgp.as.format(`($1:${expect})`, [val]);
  } else if (expect === "array" || selectItem?.columnPGDataType === "ARRAY") {
    checkIfArr();
    return pgp.as.format(" ARRAY[$1:csv]", [val]);
  }

  return asValue(val);
};
