import { isEmpty } from "prostgles-types";
import type { Filter } from "../DboBuilderTypes";
import type { SelectItemValidated } from "./QueryBuilder";
import { parseFilterItem } from "../../Filtering";

type Args = {
  having: Filter | undefined;
  select: SelectItemValidated[];
  tableAlias: string | undefined;
  filterFieldNames: string[];
};
export const prepareHaving = ({
  having,
  select,
  tableAlias,
  filterFieldNames,
}: Args) => {
  if (!having || isEmpty(having)) return "";

  const havingStr = parseFilterItem({
    filter: having,
    select,
    tableAlias,
    allowedColumnNames: filterFieldNames,
  });
  return havingStr;
};
