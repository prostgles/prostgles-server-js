import { enqueueRowJobs } from "../../Jobs/enqueueRowJobs";
import {
  captureMutation,
  getMutationRowKeyQuery,
  type CapturedMutation,
} from "../../TableHooks/captureMutation";
import type { AnyObject, FieldFilter, InsertParams, UpdateParams } from "prostgles-types";
import { asName, isDefined } from "prostgles-types";
import type { InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import type { LocalParams } from "../DboBuilder";
import { rejectWithPGClientError, withUserRLS } from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { getSelectItemQuery } from "./TableHandler";
import { executeAfterHooksCheckAndPostValidation } from "./executeAfterHooksCheckAndPostValidation";
import { prepareWhere } from "../ViewHandler/prepareWhere";
import { MUTATION_METADATA } from "../../TableHooks/mutationMetadata";

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
      isConflictUpdate: boolean;
      conflictUpdateRule: UpdateRule | undefined;
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
  const getCheckCondition = async (checkFilter: InsertRule["checkFilter"]) => {
    if (!checkFilter) {
      return "FALSE";
    }
    const checkCond = await prepareWhere(tableHandler, {
      select: undefined,
      localParams: undefined,
      tableRule: undefined,
      filter: checkFilter,
      addWhere: false,
    });
    return `(${checkCond.where}) IS NOT TRUE`;
  };
  const checkCondition = await getCheckCondition(rule?.checkFilter);
  const conflictUpdateRule = args.command === "insert" ? args.conflictUpdateRule : undefined;
  const updateCheckCondition = await getCheckCondition(conflictUpdateRule?.checkFilter);
  const isUpsert = args.command === "insert" && args.isConflictUpdate;
  // Ordinary publish checks already have the affected rows and a known command.
  const needsCapture =
    tableHandler.shouldWrapInTx(
      { name: command, rule: isUpsert ? rule : undefined },
      localParams,
      [],
    ).hasAfterChecks ||
    (isUpsert &&
      tableHandler.shouldWrapInTx({ name: "update", rule: conflictUpdateRule }, localParams, [])
        .hasAfterChecks);
  const hasReturning = !!returningSelectItems.length;
  const userRLS = withUserRLS(localParams, "", !!tableHandler.getTransaction(localParams));
  const RETURNING_ALIAS_PREFIX = "prostgles_returning_";
  if (
    [
      MUTATION_METADATA.checkCondition,
      MUTATION_METADATA.updateCheckCondition,
      MUTATION_METADATA.rowKey,
    ].some((key) => tableHandler.columnSet.has(key))
  )
    throw new Error(`Mutation metadata conflicts with a column on ${name}`);
  const returningSelectKeyRemap = new Map<string, string>();
  const query = ` 
    ${userRLS} 
    ${queryWithoutUserRLS}
    RETURNING ${[
      `${tableHandler.escapedName}.*`,
      ...(needsCapture ?
        [`${getMutationRowKeyQuery(tableHandler)} AS ${MUTATION_METADATA.rowKey}`]
      : []),
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
      `${checkCondition} as ${MUTATION_METADATA.checkCondition}`,
      `${updateCheckCondition} as ${MUTATION_METADATA.updateCheckCondition}`,
    ].filter(Boolean)}
  `;

  const allowedFieldKeys = tableHandler.parseFieldFilter(fields);

  const queryType = "any";

  const tx = tableHandler.getTransaction(localParams)?.t;
  const { result, mutations } = await (
    needsCapture ?
      captureMutation<AnyObject>(tableHandler, localParams, query)
    : (tx ? tx[queryType](query) : tableHandler.db.tx((t) => t[queryType](query))).then(
        (result) => ({ result, mutations: [] as CapturedMutation[] }),
      )).catch((err: unknown) =>
    rejectWithPGClientError(err, {
      type: "tableMethod",
      localParams,
      view: tableHandler,
      allowedKeys: allowedFieldKeys,
      prostgles: tableHandler.dboBuilder.prostgles,
    }),
  );
  const mutationsByRow = new Map<string, CapturedMutation[]>();
  for (const mutation of mutations) {
    const matching = mutationsByRow.get(mutation.rowKey) ?? [];
    matching.push(mutation);
    mutationsByRow.set(mutation.rowKey, matching);
  }
  const batches = new Map<
    "insert" | "update",
    {
      rows: AnyObject[];
      changedFields: (string[] | null)[];
    }
  >();

  const rowCount = Number(result.length);
  const returningRows = hasReturning ? ([] as AnyObject[]) : undefined;

  const tableRows = result.map((row) => {
    const {
      [MUTATION_METADATA.checkCondition]: insertCheckFailed,
      [MUTATION_METADATA.updateCheckCondition]: updateCheckFailed,
      [MUTATION_METADATA.rowKey]: rowKey,
      ...tableRowWithReturning
    } = row;
    const mutation = needsCapture ? mutationsByRow.get(rowKey)?.shift() : undefined;
    if (needsCapture && !mutation) throw new Error(`Missing captured mutation for ${name}`);
    const actualCommand = mutation?.command ?? command;
    if (actualCommand === "delete") throw new Error("Unexpected delete in insert/update capture");
    if (
      actualCommand === "update" && args.command === "insert" ?
        updateCheckFailed
      : insertCheckFailed
    ) {
      throw new Error(`${actualCommand} ${name} records failed the check condition`);
    }
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

    const tableRow = mutation?.row ?? tableRowWithReturning;
    const batch = batches.get(actualCommand) ?? { rows: [], changedFields: [] };
    batch.rows.push(tableRow);
    batch.changedFields.push(mutation?.changedFields ?? null);
    batches.set(actualCommand, batch);
    return tableRow;
  });

  if (!batches.size && !isUpsert) {
    batches.set(command, { rows: [], changedFields: [] });
  }
  const linkedRows = new Map<AnyObject, Record<string, any>>();
  for (const [actualCommand, { rows, changedFields }] of batches) {
    const linked = await enqueueRowJobs(
      tableHandler,
      actualCommand,
      rows,
      localParams,
      changedFields,
    );
    linked?.forEach((owner, row) => linkedRows.set(row, owner));
  }
  if (returningRows && linkedRows.size) {
    const returningExpressions = returningSelectItems.filter((item) => item.type !== "column");
    for (const [index, row] of tableRows.entries()) {
      const owner = linkedRows.get(row);
      if (!owner) continue;
      const returningRow = returningRows[index]!;
      for (const item of returningSelectItems) {
        if (item.type === "column") returningRow[item.alias] = row[item.columnName!];
      }
      if (!returningExpressions.length) continue;
      const where = Object.keys(owner)
        .map((key, i) => `${asName(key)} = $${i + 1}`)
        .join(" AND ");
      const expressionValues = await tx!.one<AnyObject>(
        `SELECT ${getSelectItemQuery(returningExpressions)} FROM ${tableHandler.escapedName} WHERE ${where}`,
        Object.values(owner),
      );
      Object.assign(returningRow, expressionValues);
    }
  }
  for (const [actualCommand, { rows, changedFields }] of batches) {
    await executeAfterHooksCheckAndPostValidation({
      tableHandler,
      operation:
        actualCommand === "insert" ?
          { name: "insert", rule: args.command === "insert" ? args.rule : undefined }
        : { name: "update", rule: args.command === "update" ? args.rule : conflictUpdateRule },
      localParams,
      rows,
      data,
      changedFields,
    });
  }

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
