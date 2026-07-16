import type { AnyObject, FieldFilter, InsertParams, UpdateParams } from "prostgles-types";
import { asName } from "prostgles-types";
import type { InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import type { LocalParams } from "../DboBuilder";
import { rejectWithPGClientError, withUserRLS } from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { getSelectItemQuery } from "./TableHandler";
import { executeHooksCheckAndPostValidation } from "./executeHooksCheckAndPostValidation";

type RunInsertUpdateQueryArgs = {
  tableHandler: TableHandler;
  queryWithoutUserRLS: string;
  localParams: LocalParams | undefined;
  fields: FieldFilter | undefined;
  returningFields: FieldFilter | undefined;
} & (
  | {
      command: "insert";
      params: InsertParams | undefined;
      rule: InsertRule | undefined;
      data: AnyObject | AnyObject[];
      isMultiInsert: boolean;
      nestedInsertsResultsObj?: undefined;
    }
  | {
      command: "update";
      nestedInsertsResultsObj: Record<string, any>;
      params: UpdateParams | undefined;
      rule: UpdateRule | undefined;
      data: Record<string, any>;
    }
);

export const runInsertUpdateQuery = async (args: RunInsertUpdateQueryArgs) => {
  const {
    tableHandler,
    queryWithoutUserRLS,
    rule,
    localParams,
    fields,
    returningFields,
    params,
    nestedInsertsResultsObj,
    data,
    command,
  } = args;
  const { name } = tableHandler;

  const returningSelectItems = await tableHandler.prepareReturning(
    params?.returning,
    tableHandler.parseFieldFilter(returningFields),
  );
  const { checkFilter } = rule ?? {};
  let checkCondition = "WHERE FALSE";
  if (checkFilter) {
    const checkCond = await tableHandler.prepareWhere({
      select: undefined,
      localParams: undefined,
      tableRule: undefined,
      filter: checkFilter,
      addWhere: false,
    });
    checkCondition = `WHERE NOT (${checkCond.where})`;
  }
  const hasReturning = !!returningSelectItems.length;
  const userRLS = withUserRLS(localParams, "");
  const escapedTableName = asName(name);
  const query = ` 
    ${userRLS}
    WITH ${escapedTableName} AS (
      ${queryWithoutUserRLS}
      RETURNING *
    )
    SELECT 
      count(*) as row_count, 
      EXISTS (
        SELECT *
        FROM ${escapedTableName}
        ${checkCondition} 
      ) AS failed_check,
      (
        SELECT json_agg(item)
        FROM (
          SELECT *
          FROM ${escapedTableName}
        ) item
      ) as modified,
      (
        SELECT json_agg(item)
        FROM (
          SELECT ${!hasReturning ? "1" : getSelectItemQuery(returningSelectItems)}
          FROM ${escapedTableName}
          WHERE ${hasReturning ? "TRUE" : "FALSE"}
        ) item
      ) as modified_returning
    FROM ${escapedTableName}
  `;

  const allowedFieldKeys = tableHandler.parseFieldFilter(fields);

  const queryType = "one";

  const tx = tableHandler.getTransaction(localParams)?.t;
  const queryPromise: Promise<{
    row_count: number | null;
    modified: AnyObject[] | null;
    failed_check: boolean | null;
    modified_returning: AnyObject[] | null;
  }> = tx ? tx[queryType](query) : tableHandler.db.tx((t) => t[queryType](query));

  const result = await queryPromise.catch((err: unknown) =>
    rejectWithPGClientError(err, {
      type: "tableMethod",
      localParams,
      view: tableHandler,
      allowedKeys: allowedFieldKeys,
      prostgles: tableHandler.dboBuilder.prostgles,
    }),
  );

  if (checkFilter && result.failed_check) {
    throw new Error(
      `Insert ${name} records failed the check condition: ${JSON.stringify(checkFilter, null, 2)}`,
    );
  }

  const rows = result.modified ?? [];

  await executeHooksCheckAndPostValidation({
    tableHandler,
    operation: command === "insert" ? { name: "insert", rule } : { name: "update", rule },
    localParams,
    rows,
    data,
  });

  let returnMany = false;
  if (args.command === "update") {
    const { multi = true } = args.params || {};
    if (!multi && result.row_count && +result.row_count > 1) {
      throw `More than 1 row modified: ${result.row_count} rows affected`;
    }

    if (hasReturning) {
      returnMany = multi;
    }
  } else {
    returnMany = args.isMultiInsert;
  }

  if (!hasReturning) return undefined;

  const modified_returning = result.modified_returning?.map((d) => ({
    ...d,
    ...nestedInsertsResultsObj,
  }));

  return returnMany ? modified_returning : modified_returning?.[0];
};
