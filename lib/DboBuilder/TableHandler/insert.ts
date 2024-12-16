import { AnyObject, InsertParams, asName, isObject } from "prostgles-types";
import { TableRule, ValidateRowBasic } from "../../PublishParser/PublishParser";
import {
  LocalParams,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import { insertNestedRecords } from "../insertNestedRecords";
import { prepareNewData } from "./DataValidator";
import { TableHandler } from "./TableHandler";
import { insertTest } from "./insertTest";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";

export async function insert(
  this: TableHandler,
  rowOrRows: AnyObject | AnyObject[] = {},
  insertParams?: InsertParams,
  param3_unused?: undefined,
  tableRules?: TableRule,
  localParams?: LocalParams,
): Promise<any | any[] | boolean> {
  const ACTION = "insert";
  const start = Date.now();
  try {
    const { removeDisallowedFields = false } = insertParams || {};
    const { returnQuery = false, nestedInsert } = localParams || {};

    const finalDBtx = this.getFinalDBtx(localParams);
    const rule = tableRules?.[ACTION];
    const { postValidate, checkFilter, validate, allowedNestedInserts } =
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
            localParams,
          ),
        );
      }
    }

    const { testOnly, fields, forcedData, returningFields } =
      await insertTest.bind(this)({ tableRules, localParams });
    if (testOnly) {
      return true;
    }

    if (allowedNestedInserts) {
      if (
        !nestedInsert ||
        !allowedNestedInserts.some(
          (ai) =>
            ai.table === nestedInsert?.previousTable &&
            ai.column === nestedInsert.referencingColumn,
        )
      ) {
        throw `Direct inserts not allowed. Only nested inserts from these tables: ${JSON.stringify(allowedNestedInserts)} `;
      }
    }
    validateInsertParams(insertParams);

    const isMultiInsert = Array.isArray(rowOrRows);
    const preValidatedRows = await Promise.all(
      (isMultiInsert ? rowOrRows : [rowOrRows]).map(async (nonValidated) => {
        const { preValidate, validate } = tableRules?.insert ?? {};
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
            dbx: (this.tx?.dbTX || this.dboBuilder.dbo) as any,
            localParams,
          });
        }

        return row;
      }),
    );
    const preValidatedrowOrRows = isMultiInsert
      ? preValidatedRows
      : preValidatedRows[0]!;

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

    const pkeyNames = this.columns.filter((c) => c.is_pkey).map((c) => c.name);
    const getInsertQuery = async (_rows: AnyObject[]) => {
      const validatedData = await Promise.all(
        _rows.map(async (_row) => {
          const row = { ..._row };

          if (!isObject(row)) {
            throw (
              "\nInvalid insert data provided. Expected an object but received: " +
              JSON.stringify(row)
            );
          }

          const { data: validatedRow, allowedCols } = await prepareNewData({
            row,
            forcedData,
            allowedFields: fields,
            tableRules,
            removeDisallowedFields,
            tableConfigurator: this.dboBuilder.prostgles.tableConfigurator,
            tableHandler: this,
          });
          return { validatedRow, allowedCols };
        }),
      );
      const validatedRows = validatedData.map((d) => d.validatedRow);
      const allowedCols = Array.from(
        new Set(validatedData.flatMap((d) => d.allowedCols)),
      );
      const dbTx = finalDBtx || this.dboBuilder.dbo;
      const validationOptions = {
        validate: validate as ValidateRowBasic,
        localParams,
      };
      // const query = await this.colSet.getInsertQuery(validatedRows, allowedCols, dbTx, validate, localParams);
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
      if (onConflict === "DoNothing") {
        conflict_query = " ON CONFLICT DO NOTHING ";
      } else if (onConflict === "DoUpdate") {
        if (!pkeyNames.length) {
          throw "Cannot do DoUpdate on a table without a primary key";
        }
        const nonPkeyCols = allowedCols
          .filter((c) => !pkeyNames.includes(c))
          .map((v) => asName(v));
        if (!nonPkeyCols.length) {
          throw "Cannot on conflict DoUpdate on a table with only primary key columns";
        }
        conflict_query = ` ON CONFLICT (${pkeyNames.join(", ")}) DO UPDATE SET ${nonPkeyCols.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}`;
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
      console.log(this.tx?.t.ctx?.start, "insert in " + this.name, data);
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
      error: getErrorAsObject(e),
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
  if (![undefined, "DoNothing", "DoUpdate"].includes(onConflict)) {
    throw `Invalid onConflict: ${onConflict}. Expecting one of: DoNothing, DoUpdate`;
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
    const bad_params = Object.keys(params).filter(
      (k) => !good_params.includes(k),
    );
    if (bad_params && bad_params.length)
      throw (
        "Invalid params: " +
        bad_params.join(", ") +
        " \n Expecting: " +
        good_params.join(", ")
      );
  }
};

// const removeBuffers = (o: any) => {
//   if(isPlainObject(o)){
//     return JSON.stringify(getKeys(o).reduce((a, k) => {
//       const value = o[k]
//       return { ...a, [k]: Buffer.isBuffer(value)? `Buffer[${value.byteLength}][...REMOVED]` : value
//     }
//   }, {}));
//   }
// }
