import type { AnyObject, InsertParams } from "prostgles-types";
import { getJSONBSchemaValidationError, getSerialisableError, isObject } from "prostgles-types";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import { isArray } from "../../../utils/utils";
import type { LocalParams } from "../../DboBuilder";
import { getSerializedClientErrorFromPGError, withUserRLS } from "../../DboBuilder";
import { getReturnTypeQuery } from "../../ViewHandler/getReturnTypeQuery";
import type { TableHandler } from "../TableHandler";
import { insertTest } from "../insertTest";
import { runInsertUpdateQuery } from "../runInsertUpdateQuery";
import { getInsertQuery } from "./getInsertQuery";
import { insertNestedRecords } from "./insertNestedRecords";

export type InsertedRowWithInfo = { row: AnyObject; columnsAddedFromBeforeHooks: string[] };

export async function insert(
  this: TableHandler,
  rowOrRows: AnyObject | AnyObject[] = {},
  insertParams?: InsertParams,
  param3_unused?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<any> {
  const ACTION = "insert";
  const start = Date.now();
  try {
    const { nestedInsert } = localParams ?? {};

    const rule = tableRules?.[ACTION];
    const { allowedNestedInserts, requiredNestedInserts, validate } = rule ?? {};

    /** Post validate and checkFilter require a transaction dbo handler because they need the action result */
    if (
      this.shouldWrapInTx(
        { name: ACTION, rule },
        localParams,
        isArray(rowOrRows) ? rowOrRows : [rowOrRows],
      ).shouldWrap
    ) {
      return this.dboBuilder.getTX((t) =>
        t[this.name]?.[ACTION](rowOrRows, insertParams, param3_unused, tableRules, localParams),
      );
    }

    const { testOnly, fields, forcedData, returningFields } = await insertTest.bind(this)({
      tableRules,
      localParams,
    });
    if (testOnly) {
      return true;
    }

    if (allowedNestedInserts) {
      if (
        !nestedInsert ||
        !allowedNestedInserts.some(
          (ai) =>
            ai.table === nestedInsert.previousTable && ai.column === nestedInsert.referencingColumn,
        )
      ) {
        throw `Direct inserts not allowed. Only nested inserts from these tables: ${JSON.stringify(allowedNestedInserts)} `;
      }
    }
    const isMultiInsert = isArray(rowOrRows);
    const rows = isMultiInsert ? rowOrRows : [rowOrRows];

    requiredNestedInserts?.forEach(({ ftable, maxRows, minRows }) => {
      if (this.column_names.includes(ftable))
        throw `requiredNestedInserts.ftable is clashing with existing column: ${ftable}`;
      rows.forEach((row, rowId) => {
        const nestedInsert = row[ftable] as unknown;
        const nestedInsertRows =
          isObject(nestedInsert) ? [nestedInsert]
          : isArray(nestedInsert) ? nestedInsert
          : [];
        if (!nestedInsertRows.length) {
          throw `Missing required nested insert on rowId ${rowId} for ftable: ${ftable}`;
        }
        if (maxRows && nestedInsertRows.length > maxRows) {
          throw `Max rows exceeded for nested insert on rowId ${rowId} for ftable: ${ftable}`;
        }
        if (minRows && nestedInsertRows.length < minRows) {
          throw `Min rows not met for nested insert on rowId ${rowId} for ftable: ${ftable}`;
        }
      });
    });

    validateInsertParams(insertParams);

    const transaction = this.getTransaction(localParams);
    const tx = transaction?.t || this.db;

    const successCallbacks: (() => void)[] = [];
    const preValidatedRows: InsertedRowWithInfo[] = await Promise.all(
      rows.map(async (nonValidated) => {
        const { preValidate, validate } = rule ?? {};
        const { tableConfigurator } = this.dboBuilder.prostgles;
        if (!tableConfigurator) {
          throw "tableConfigurator missing";
        }
        let row = await tableConfigurator.getPreInsertRow(this, {
          dbx: this.getFinalDbo(localParams),
          validate,
          localParams,
          row: nonValidated,
          tx,
          command: "insert",
          data: nonValidated,
        });

        const beforeResult = await this.beforeEach(row, localParams, "insert");
        row = beforeResult.row;
        beforeResult.successCallbacks.forEach((cb) => successCallbacks.push(cb));

        if (preValidate) {
          if (!localParams) {
            throw "localParams missing for insert preValidate";
          }
          row = await preValidate({
            row,
            tx,
            dbx: transaction?.dbTX || this.dboBuilder.dbo,
            localParams,
            command: "insert",
            data: row,
          });
        }

        return { row, columnsAddedFromBeforeHooks: beforeResult.columnsAdded };
      }),
    );
    const preValidatedRowOrRows = isMultiInsert ? preValidatedRows : preValidatedRows[0]!;

    /**
     * If media it will: upload file and continue insert
     * If nested insert it will: make separate inserts and not continue main insert
     */
    const mediaOrNestedInsert = await insertNestedRecords.bind(this)({
      data: preValidatedRowOrRows,
      insertParams,
      tableRules,
      localParams,
    });
    if (mediaOrNestedInsert.type === "nestedInserts") {
      return mediaOrNestedInsert.insertResult;
    }
    const { data } = mediaOrNestedInsert;

    let query = "";
    const commonArgs = {
      fields,
      forcedData,
      tableHandler: this,
      insertParams,
      localParams,
      tableRules,
      validate,
    };
    if (isArray(data)) {
      if (!data.length) {
        throw "Empty insert. Provide data";
      }

      query = await getInsertQuery({
        ...commonArgs,
        rows: data,
      });
    } else {
      query = await getInsertQuery({
        ...commonArgs,
        rows: [data],
      });
    }

    const queryWithoutUserRLS = query;
    const queryWithRLS = withUserRLS(localParams, query);

    const queryToReturn = await getReturnTypeQuery({
      handler: this,
      localParams,
      queryWithoutRLS: queryWithoutUserRLS,
      queryWithRLS,
      returnType: insertParams?.returnType,
      newQuery: undefined,
    });
    if (queryToReturn) {
      return queryToReturn as unknown[];
    }

    if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
      console.log(this.tx?.t.ctx.start, "insert in " + this.name, data);
    }

    const result = await runInsertUpdateQuery({
      rule,
      localParams,
      queryWithoutUserRLS,
      tableHandler: this,
      returningFields,
      data:
        isArray(preValidatedRowOrRows) ?
          preValidatedRowOrRows.map((d) => d.row)
        : preValidatedRowOrRows.row,
      fields,
      params: insertParams,
      command: "insert",
      isMultiInsert,
    });

    await this._log({
      command: "insert",
      localParams,
      data: { rowOrRows, param2: insertParams },
      duration: Date.now() - start,
    });
    successCallbacks.forEach((cb) => cb());
    return result;
  } catch (e) {
    await this._log({
      command: "insert",
      localParams,
      data: { rowOrRows, param2: insertParams },
      duration: Date.now() - start,
      error: getSerialisableError(e),
    });
    throw getSerializedClientErrorFromPGError(e, {
      type: "tableMethod",
      localParams,
      view: this,
      prostgles: this.dboBuilder.prostgles,
    });
  }
}

const validateInsertParams = (params: InsertParams | undefined) => {
  const { onConflict, returnType, returning } = params ?? {};
  const onConflictValidation = getJSONBSchemaValidationError(
    {
      oneOf: [
        { enum: ["DoNothing", "DoUpdate"] },
        {
          type: {
            action: { enum: ["DoNothing", "DoUpdate"] },
            conflictColumns: { arrayOf: "string" },
          },
        },
      ],
      optional: true,
    },
    onConflict,
  );
  if (onConflictValidation.error !== undefined) {
    throw `Invalid onConflict: ${onConflictValidation.error}`;
  }

  const allowedReturnTypes: InsertParams["returnType"][] = [
    "row",
    "value",
    "values",
    "statement",
    undefined,
  ];
  if (!allowedReturnTypes.includes(returnType)) {
    throw `Invalid return type ${returnType}. Expecting one of: ${allowedReturnTypes}`;
  }

  if (returnType && returnType !== "statement" && !returning) {
    throw `Must specify returning when using a non statement returnType: ${returnType}`;
  }

  if (params) {
    const good_paramsObj: Record<keyof InsertParams, 1> = {
      returning: 1,
      returnType: 1,
      removeDisallowedFields: 1,
      onConflict: 1,
    };
    const good_params = Object.keys(good_paramsObj);
    const bad_params = Object.keys(params).filter((k) => !good_params.includes(k));
    if (bad_params.length)
      throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
  }
};
