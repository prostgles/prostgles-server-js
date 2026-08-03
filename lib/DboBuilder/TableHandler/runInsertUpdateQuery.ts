import type { AnyObject, FieldFilter, InsertParams, UpdateParams } from "prostgles-types";
import { asName, isDefined } from "prostgles-types";
import type { InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import type { LocalParams } from "../DboBuilder";
import { rejectWithPGClientError, withUserRLS } from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { getSelectItemQuery } from "./TableHandler";
import { executeAfterHooksCheckAndPostValidation } from "./executeAfterHooksCheckAndPostValidation";

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
      data: AnyObject;
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
  // let checkCondition = "WHERE FALSE";
  let checkCondition = "FALSE";
  if (checkFilter) {
    const checkCond = await tableHandler.prepareWhere({
      select: undefined,
      localParams: undefined,
      tableRule: undefined,
      filter: checkFilter,
      addWhere: false,
    });
    // checkCondition = `WHERE NOT (${checkCond.where})`;
    checkCondition = `NOT (${checkCond.where})`;
  }
  const hasReturning = !!returningSelectItems.length;
  const userRLS = withUserRLS(localParams, "");
  const CHECK_CONDITION_ALIAS = "prostgles_check_condition";
  const RETURNING_ALIAS_PREFIX = "prostgles_returning_";
  const returningSelectKeyRemap = new Map<string, string>();
  const query = ` 
    ${userRLS} 
    ${queryWithoutUserRLS}
    RETURNING ${[
      "*",
      getSelectItemQuery(
        returningSelectItems
          .map((item, index) => {
            /** Skip if exists in 'returning *'  */
            if (item.type === "column" && asName(item.alias) === item.getQuery()) {
              if (!tableHandler.columnSet.has(item.alias)) {
                throw new Error(`Returning column ${item.alias} does not exist in table ${name}`);
              }
              returningSelectKeyRemap.set(item.alias, item.alias);
              return;
            }
            const newAlias = RETURNING_ALIAS_PREFIX + index;
            if (tableHandler.columnSet.has(newAlias)) {
              throw new Error(
                `Internal Returning alias rewrite ${newAlias} collides with actual table column name. Please report this issue.`,
              );
            }
            returningSelectKeyRemap.set(newAlias, item.alias);

            return {
              ...item,
              alias: newAlias,
            };
          })
          .filter(isDefined),
      ),
      `${checkCondition} as ${CHECK_CONDITION_ALIAS}`,
    ].filter(Boolean)}
  `;

  const allowedFieldKeys = tableHandler.parseFieldFilter(fields);

  const queryType = "any";

  const tx = tableHandler.getTransaction(localParams)?.t;
  const queryPromise: Promise<
    {
      [CHECK_CONDITION_ALIAS]: boolean;
      [key: string]: unknown;
    }[]
  > = tx ? tx[queryType](query) : tableHandler.db.tx((t) => t[queryType](query));

  const result = await queryPromise.catch((err: unknown) =>
    rejectWithPGClientError(err, {
      type: "tableMethod",
      localParams,
      view: tableHandler,
      allowedKeys: allowedFieldKeys,
      prostgles: tableHandler.dboBuilder.prostgles,
    }),
  );

  if (checkFilter && result.some((row) => row[CHECK_CONDITION_ALIAS])) {
    throw new Error(
      `Insert ${name} records failed the check condition: ${JSON.stringify(checkFilter, null, 2)}`,
    );
  }

  const rowCount = Number(result.length);
  const returningRows = hasReturning ? ([] as AnyObject[]) : undefined;

  const tableRows = result.map((row) => {
    const { [CHECK_CONDITION_ALIAS]: _checkCondition, ...tableRowWithReturning } = row;
    if (returningRows) {
      const returningRow: AnyObject = {};
      for (const [newAlias, expectedAlias] of returningSelectKeyRemap.entries()) {
        returningRow[expectedAlias] = tableRowWithReturning[newAlias];
        if (newAlias.startsWith(RETURNING_ALIAS_PREFIX)) {
          delete tableRowWithReturning[newAlias];
        }
      }
      returningRows.push(returningRow);
    }

    return tableRowWithReturning;
  });

  await executeAfterHooksCheckAndPostValidation({
    tableHandler,
    operation: command === "insert" ? { name: "insert", rule } : { name: "update", rule },
    localParams,
    rows: tableRows,
    data,
  });

  let returnMany = false;
  if (args.command === "update") {
    const { multi = true } = args.params || {};
    if (!multi && rowCount && rowCount > 1) {
      throw `More than 1 row modified: ${rowCount} rows affected`;
    }

    if (hasReturning) {
      returnMany = multi;
    }
  } else {
    returnMany = args.isMultiInsert;
  }

  if (!hasReturning) return undefined;

  const returningRowsWithNestedInserts = returningRows?.map((returningRow) => ({
    ...returningRow,
    ...nestedInsertsResultsObj,
  }));

  return returnMany ? returningRowsWithNestedInserts : returningRowsWithNestedInserts?.[0];
};
