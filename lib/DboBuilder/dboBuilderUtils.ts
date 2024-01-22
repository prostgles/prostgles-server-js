
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  PG_COLUMN_UDT_DATA_TYPE,
  ProstglesError,
  TS_PG_Types,
  getKeys,
  isObject,
  omitKeys
} from "prostgles-types";
import {
  DB,
  ProstglesInitOptions
} from "../Prostgles";
import { pickKeys } from "../PubSubManager/PubSubManager";
import { LocalParams, SortItem, pgp } from "./DboBuilderTypes";
import { asNameAlias } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler/ViewHandler";
import { getSchemaFilter } from "./getTablesForSchemaPostgresSQL";

import { sqlErrCodeToMsg } from "./sqlErrCodeToMsg";
export function escapeTSNames(str: string, capitalize = false): string {
  let res = str;
  res = (capitalize ? str[0]?.toUpperCase() : str[0]) + str.slice(1);
  if (canBeUsedAsIsInTypescript(res)) return res;
  return JSON.stringify(res);
}

export const getErrorAsObject = (rawError: any, includeStack = false) => {
  if(["string", "boolean", "number"].includes(typeof rawError)){
    return { message: rawError };
  }
  if(rawError instanceof Error){
    const result = JSON.parse(JSON.stringify(rawError, Object.getOwnPropertyNames(rawError)));
    if(!includeStack){
      return omitKeys(result, ["stack"]);
    }
    return result;
  }
  
  return rawError;
}

type GetSerializedClientErrorFromPGErrorArgs = {
  type: "sql";
} | {
  type: "tableMethod";
  localParams: LocalParams | undefined;
  view: ViewHandler;
  allowedKeys?: string[];
}
export function getSerializedClientErrorFromPGError(rawError: any, args: GetSerializedClientErrorFromPGErrorArgs) {
  const err = getErrorAsObject(rawError);
  if (process.env.PRGL_DEBUG) {
    console.trace(err)
  }
  const fullError = {
    ...err,
    ...(err?.message ? { txt: err.message } : {}),
    code_info: sqlErrCodeToMsg(err.code),
  }

  if(args.type === "sql"){
    return fullError;
  }

  const { localParams, view, allowedKeys } = args;

  const errObject = {
    ...((!localParams || !localParams.socket) ? err : {}),
    ...pickKeys(err, ["column", "code", "table", "constraint", "hint"]),
    fullError
  };
  if (view?.dboBuilder?.constraints && errObject.constraint && !errObject.column) {
    const constraint = view.dboBuilder.constraints
      .find(c => c.conname === errObject.constraint && c.relname === view.name);
    if (constraint) {
      const cols = view.columns.filter(c =>
        (!allowedKeys || allowedKeys.includes(c.name)) &&
        constraint.conkey.includes(c.ordinal_position)
      );
      const [firstCol] = cols;
      if (firstCol) {
        errObject.column = firstCol.name;
        errObject.columns = cols.map(c => c.name);
      }
    }
  }
  return errObject;
}
export function getClientErrorFromPGError(rawError: any, args: GetSerializedClientErrorFromPGErrorArgs) {
  return Promise.reject(getSerializedClientErrorFromPGError(rawError, args));
}

/**
 * Ensure the error is a serializable Object  
 */
export function parseError(e: any, caller: string): ProstglesError {

  const errorObject = isObject(e) ? e : undefined;
  const message = typeof e === "string" ? e : e instanceof Error ? e.message :
    isObject(errorObject) ? (errorObject.message ?? errorObject.txt ?? JSON.stringify(errorObject) ?? "") : "";
  const stack = [
    ...(errorObject && Array.isArray(errorObject.stack) ? errorObject.stack : []),
    caller
  ]
  const result: ProstglesError = {
    ...errorObject,
    message,
    stack,
  }
  return result;
}

export type PGConstraint = {
  /**
   * Constraint type
   */
  contype:
  | "u" // Unique
  | "p" // Primary key 
  | "c" // Check

  /**
   * Column ordinal positions
   */
  conkey: number[];

  /**
   * Constraint name
   */
  conname: string;

  /**
   * Table name
   */
  relname: string;
};

export const getConstraints = async (db: DB, schema: ProstglesInitOptions["schema"]): Promise<PGConstraint[]> => {
  const { sql, schemaNames } = getSchemaFilter(schema);
  return db.any(`
    SELECT rel.relname, con.conkey, con.conname, con.contype
    FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel
            ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = connamespace
    WHERE nsp.nspname ${sql}
  `, { schemaNames });
}

/**
 * @deprecated
 * use isObject
 */
export function isPlainObject(o: any): o is Record<string, any> {
  return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}

export function postgresToTsType(udt_data_type: PG_COLUMN_UDT_DATA_TYPE): keyof typeof TS_PG_Types {
  return getKeys(TS_PG_Types).find(k => {
    // @ts-ignore
    return TS_PG_Types[k].includes(udt_data_type)
  }) ?? "any";
}

export const prepareOrderByQuery = (items: SortItem[], tableAlias?: string): string[] => {
  if (!items.length) return [];
  return ["ORDER BY " + items.map(d => {

    const orderType = d.asc ? " ASC " : " DESC ";
    const nullOrder = d.nulls ? ` NULLS ${d.nulls === "first" ? " FIRST " : " LAST "}` : "";
    if(d.type === "query" && d.nested){
      return d.fieldQuery;
    }
    return `${asNameAlias(d.key, tableAlias)} ${orderType} ${nullOrder}`;
  }).join(", ")]
}

export const canEXECUTE = async (db: DB) => {

  try {
    await db.any(`DO $$ BEGIN  EXECUTE 'select 1'; END $$;`);
    return true;
  } catch (error) {
    console.warn(error)
  }

  return false;
}

export const withUserRLS = (localParams: LocalParams | undefined, query: string) => {

  const user = localParams?.isRemoteRequest?.user;
  const queryPrefix = `SET SESSION "prostgles.user" \nTO`
  let firstQuery = `${queryPrefix} '';`;
  if (user) {
    firstQuery = pgp.as.format(`${queryPrefix} \${user};`, { user });
  }

  return [firstQuery, query].join("\n");
}


function canBeUsedAsIsInTypescript(str: string): boolean {
  if (!str) return false;
  const isAlphaNumericOrUnderline = str.match(/^[a-z0-9_]+$/i);
  const startsWithCharOrUnderscore = str[0]?.match(/^[a-z_]+$/i);
  return Boolean(isAlphaNumericOrUnderline && startsWithCharOrUnderscore);
}