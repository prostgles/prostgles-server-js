import { AnyObject, asName, FieldFilter, InsertParams, UpdateParams } from "prostgles-types";
import { InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import { getClientErrorFromPGError, LocalParams, withUserRLS } from "../DboBuilder";
import { getSelectItemQuery, TableHandler } from "./TableHandler";

type RunInsertUpdateQueryArgs = {
  tableHandler: TableHandler;
  queryWithoutUserRLS: string;
  localParams: LocalParams | undefined;
  fields: FieldFilter | undefined;
  returningFields: FieldFilter | undefined;
} & (
  | {
      type: "insert";
      params: InsertParams | undefined;
      rule: InsertRule | undefined;
      data: AnyObject | AnyObject[];
      isMultiInsert: boolean;
      nestedInsertsResultsObj?: undefined;
    }
  | {
      type: "update";
      nestedInsertsResultsObj: Record<string, any>;
      params: UpdateParams | undefined;
      rule: UpdateRule | undefined;
      data: undefined;
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
  } = args;
  const { name } = tableHandler;

  const returningSelectItems = await tableHandler.prepareReturning(
    params?.returning,
    tableHandler.parseFieldFilter(returningFields)
  );
  const { checkFilter, postValidate } = rule ?? {};
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
      ) as modified_returning,
      ( 
        SELECT json_agg(item)
        FROM (
          SELECT *
          FROM ${escapedTableName}
          ${checkCondition}
          LIMIT 5
        ) item
      ) AS failed_check
    FROM ${escapedTableName}
  `;

  const allowedFieldKeys = tableHandler.parseFieldFilter(fields);
  let result: {
    row_count: number | null;
    modified: AnyObject[] | null;
    failed_check: AnyObject[] | null;
    modified_returning: AnyObject[] | null;
  };

  const queryType = "one";

  const tx = localParams?.tx?.t || tableHandler.tx?.t;
  if (tx) {
    result = await tx[queryType](query).catch((err: any) =>
      getClientErrorFromPGError(err, {
        type: "tableMethod",
        localParams,
        view: tableHandler,
        allowedKeys: allowedFieldKeys,
      })
    );
  } else {
    result = await tableHandler.db
      .tx((t) => (t as any)[queryType](query))
      .catch((err) =>
        getClientErrorFromPGError(err, {
          type: "tableMethod",
          localParams,
          view: tableHandler,
          allowedKeys: allowedFieldKeys,
        })
      );
  }

  if (checkFilter && result.failed_check?.length) {
    throw new Error(
      `Insert ${name} records failed the check condition: ${JSON.stringify(checkFilter, null, 2)}`
    );
  }

  const finalDBtx = tableHandler.getFinalDBtx(localParams);
  if (postValidate) {
    if (!finalDBtx) throw new Error("Unexpected: no dbTX for postValidate");
    if (!localParams) throw new Error("Unexpected: no localParams for postValidate");

    const rows = result.modified ?? [];
    for await (const row of rows) {
      await postValidate({
        row: row,
        dbx: finalDBtx as any,
        localParams,
      });
    }
  }

  let returnMany = false;
  if (args.type === "update") {
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
