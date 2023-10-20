import { AnyObject, asName, FieldFilter, InsertParams, UpdateParams } from "prostgles-types";
import { LocalParams, makeErrorFromPGError, withUserRLS } from "../../DboBuilder";
import { InsertRule, UpdateRule } from "../../PublishParser";
import { getCondition } from "../getCondition";
import { getSelectItemQuery, TableHandler } from "./TableHandler";

type RunInsertUpdateQueryArgs = {
  tableHandler: TableHandler;
  queryWithoutUserRLS: string; 
  localParams: LocalParams | undefined;
  fields: FieldFilter | undefined;
  returningFields: FieldFilter | undefined;
} & ({
  type: "insert";
  params: InsertParams | undefined
  rule: InsertRule | undefined;
  data: AnyObject | AnyObject[];
} | {
  type: "update";
  params: UpdateParams | undefined
  rule: UpdateRule | undefined;
  data: undefined;
});

export const runInsertUpdateQuery = async ({ tableHandler, queryWithoutUserRLS, rule, localParams, fields, returningFields, params, data, type }: RunInsertUpdateQueryArgs) => {
  const { name, column_names } = tableHandler;

  const returningSelectItems = await tableHandler.prepareReturning(params?.returning, tableHandler.parseFieldFilter(returningFields))
  const { checkFilter, postValidate } = rule ?? {};
  let checkCondition = "WHERE FALSE";
  if(checkFilter){
    const checkCond = await getCondition.bind(tableHandler)({
      allowed_colnames: column_names.slice(0),
      filter: checkFilter,
    });
    checkCondition = `WHERE NOT (${checkCond.condition})`;
  }
  const hasReturning = !!returningSelectItems.length;
  const userRLS = withUserRLS(localParams, "");
  const escapedTableName = asName(name)
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
          SELECT ${!hasReturning? "1" : getSelectItemQuery(returningSelectItems)}
          FROM ${escapedTableName}
          WHERE ${hasReturning? "TRUE" : "FALSE"}
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
    result = await tx[queryType](query).catch((err: any) => makeErrorFromPGError(err, localParams, tableHandler, allowedFieldKeys));
  } else {
    result = await tableHandler.db.tx(t => (t as any)[queryType](query)).catch(err => makeErrorFromPGError(err, localParams, tableHandler, allowedFieldKeys));
  }

  if(checkFilter && result.failed_check?.length){
    throw `The following rows did not pass the checkFilter condition: ${JSON.stringify(result.failed_check)}`;
  }

  const finalDBtx = tableHandler.getFinalDBtx(localParams);
  if(postValidate){
    if(!finalDBtx) throw new Error("Unexpected: no dbTX for postValidate");

    const rows = result.modified ?? [];
    for await (const row of rows){
      await postValidate(row ?? {}, finalDBtx)
    }
  }

  let returnMany = false;
  if(type === "update"){
    const { multi = true } = params || {};
    if(!multi && result.row_count && +result.row_count > 1){
      throw `More than 1 row modified: ${result.row_count} rows affected`;
    }

    if(hasReturning){
      returnMany = multi;
    }

  } else {
    returnMany = Array.isArray(data)
  }

  if(!hasReturning) return undefined;

  return returnMany? (result.modified_returning ?? []) : result.modified_returning?.[0];
}
