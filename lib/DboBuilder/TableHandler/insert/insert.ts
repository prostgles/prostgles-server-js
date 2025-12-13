import type { AnyObject, InsertParams } from "prostgles-types";
import {
  asName,
  getJSONBSchemaValidationError,
  getSerialisableError,
  isObject,
} from "prostgles-types";
import type { ParsedTableRule, ValidateRowBasic } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import { getSerializedClientErrorFromPGError, withUserRLS } from "../../DboBuilder";
import { prepareNewData } from "../DataValidator";
import type { TableHandler } from "../TableHandler";
import { insertTest } from "../insertTest";
import { runInsertUpdateQuery } from "../runInsertUpdateQuery";
import { insertNestedRecords } from "./insertNestedRecords";

export async function insert(
  this: TableHandler,
  rowOrRows: AnyObject | AnyObject[] = {},
  insertParams?: InsertParams,
  param3_unused?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<any> {
  const ACTION = "insert";
  const start = Date.now();
  try {
    const { removeDisallowedFields = false } = insertParams ?? {};
    const { returnQuery = false, nestedInsert } = localParams ?? {};

    const finalDBtx = this.getFinalDBtx(localParams);
    const rule = tableRules?.[ACTION];
    const { postValidate, checkFilter, validate, allowedNestedInserts, requiredNestedInserts } =
      rule ?? {};

    /** Post validate and checkFilter require a transaction dbo handler because they happen after the insert */
    if (postValidate || checkFilter) {
      if (!finalDBtx) {
        return this.dboBuilder.getTX((_dbtx) =>
          _dbtx[this.name]?.[ACTION]?.(
            rowOrRows,
            insertParams,
            param3_unused,
            tableRules,
            localParams
          )
        );
      }
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
            ai.table === nestedInsert.previousTable && ai.column === nestedInsert.referencingColumn
        )
      ) {
        throw `Direct inserts not allowed. Only nested inserts from these tables: ${JSON.stringify(allowedNestedInserts)} `;
      }
    }
    const isMultiInsert = Array.isArray(rowOrRows);
    const rows = isMultiInsert ? (rowOrRows as AnyObject[]) : [rowOrRows];

    requiredNestedInserts?.forEach(({ ftable, maxRows, minRows }) => {
      if (this.column_names.includes(ftable))
        throw `requiredNestedInserts.ftable is clashing with existing column: ${ftable}`;
      rows.forEach((row, rowId) => {
        const nestedInsert = row[ftable] as unknown;
        const nestedInsertRows =
          isObject(nestedInsert) ? [nestedInsert]
          : Array.isArray(nestedInsert) ? nestedInsert
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

    const preValidatedRows = await Promise.all(
      rows.map(async (nonValidated) => {
        const { preValidate, validate } = rule ?? {};
        const { tableConfigurator } = this.dboBuilder.prostgles;
        if (!tableConfigurator) throw "tableConfigurator missing";
        let row = await tableConfigurator.getPreInsertRow(this, {
          dbx: this.getFinalDbo(localParams),
          validate,
          localParams,
          row: nonValidated,
        });
        if (preValidate) {
          if (!localParams) throw "localParams missing for insert preValidate";
          row = await preValidate({
            row,
            dbx: this.tx?.dbTX || this.dboBuilder.dbo,
            localParams,
          });
        }

        return row;
      })
    );
    const preValidatedrowOrRows = isMultiInsert ? preValidatedRows : preValidatedRows[0]!;

    /**
     * If media it will: upload file and continue insert
     * If nested insert it will: make separate inserts and not continue main insert
     */
    const mediaOrNestedInsert = await insertNestedRecords.bind(this)({
      data: preValidatedrowOrRows,
      param2: insertParams,
      tableRules,
      localParams,
    });
    const { data, insertResult } = mediaOrNestedInsert;
    if ("insertResult" in mediaOrNestedInsert) {
      return insertResult;
    }

    const getInsertQuery = async (_rows: AnyObject[]) => {
      const validatedData = _rows.map((_row) => {
        const row = { ..._row };

        if (!isObject(row)) {
          throw (
            "\nInvalid insert data provided. Expected an object but received: " +
            JSON.stringify(row)
          );
        }

        const { data: validatedRow, allowedCols } = prepareNewData({
          row,
          forcedData,
          allowedFields: fields,
          tableRules,
          removeDisallowedFields,
          tableConfigurator: this.dboBuilder.prostgles.tableConfigurator,
          tableHandler: this,
        });
        return { validatedRow, allowedCols };
      });

      const validatedRows = validatedData.map((d) => d.validatedRow);
      const allowedCols = Array.from(new Set(validatedData.flatMap((d) => d.allowedCols)));
      const dbTx = finalDBtx || this.dboBuilder.dbo;
      const validationOptions = {
        validate: validate as ValidateRowBasic,
        localParams,
      };

      const query = (
        await this.dataValidator.parse({
          command: "insert",
          rows: validatedRows,
          allowedCols,
          dbTx,
          validationOptions,
        })
      ).getQuery();
      const { onConflict } = insertParams ?? {};
      let conflict_query = "";
      if (onConflict) {
        const onConflictAction = typeof onConflict === "string" ? onConflict : onConflict.action;
        const onConflictColumns =
          typeof onConflict === "string" ? undefined : onConflict.conflictColumns;
        if (onConflictAction === "DoNothing") {
          conflict_query = " ON CONFLICT DO NOTHING ";
        } else {
          const firstRowKeys = Object.keys(validatedData[0]?.validatedRow ?? {});
          const pkeyNames = this.columns.filter((c) => c.is_pkey).map((c) => c.name);
          const conflictColumns =
            onConflictColumns ??
            this.tableOrViewInfo.uniqueColumnGroups?.find((colGroup) => {
              if (!firstRowKeys.length)
                throw "Cannot determine conflict columns for onConflict DoUpdate";
              return colGroup.some((col) => {
                return firstRowKeys.includes(col);
              });
            }) ??
            pkeyNames;

          /**
           * Table might have multiple constraint types in which case it is mandatory to specify the conflict columns.
           * */
          if (!conflictColumns.length) {
            throw "Cannot on conflict DoUpdate. No conflict columns could be determined. Please specify conflictColumns in onConflict param.";
          }

          const nonConflictColumns = allowedCols
            .filter((c) => !conflictColumns.includes(c))
            .map((v) => asName(v));

          if (nonConflictColumns.length === 0) {
            throw "No non conflict columns to update for onConflict=DoUpdate";
          }
          conflict_query = ` ON CONFLICT (${conflictColumns.join(", ")}) DO UPDATE SET ${nonConflictColumns.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}`;
        }
      }
      return query + conflict_query;
    };

    let query = "";
    if (Array.isArray(data)) {
      if (!data.length) {
        throw "Empty insert. Provide data";
      }

      query = await getInsertQuery(data);
    } else {
      query = await getInsertQuery([data ?? {}]);
    }

    const queryWithoutUserRLS = query;
    const queryWithRLS = withUserRLS(localParams, query);
    if (returnQuery) return queryWithRLS;

    if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
      console.log(this.tx?.t.ctx.start, "insert in " + this.name, data);
    }

    const result = await runInsertUpdateQuery({
      rule,
      localParams,
      queryWithoutUserRLS,
      tableHandler: this,
      returningFields,
      data: preValidatedrowOrRows,
      fields,
      params: insertParams,
      type: "insert",
      isMultiInsert,
    });
    await this._log({
      command: "insert",
      localParams,
      data: { rowOrRows, param2: insertParams },
      duration: Date.now() - start,
    });
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
    onConflict
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
