/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  AnyObject,
  PG_COLUMN_UDT_DATA_TYPE,
  ProstglesError,
  TS_PG_Types,
  getKeys,
  isObject,
  omitKeys,
} from "prostgles-types";
import { DB } from "../Prostgles";
import { pickKeys } from "../PubSubManager/PubSubManager";
import { LocalParams, SortItem, pgp } from "./DboBuilderTypes";
import { asNameAlias } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler/ViewHandler";
import { getSchemaFilter } from "./getTablesForSchemaPostgresSQL";

import { ProstglesInitOptions } from "../ProstglesTypes";
import { sqlErrCodeToMsg } from "./sqlErrCodeToMsg";
import { TableHandler } from "./TableHandler/TableHandler";
export function escapeTSNames(str: string, capitalize = false): string {
  let res = str;
  res = (capitalize ? str[0]?.toUpperCase() : str[0]) + str.slice(1);
  if (canBeUsedAsIsInTypescript(res)) return res;
  return JSON.stringify(res);
}

export const getErrorAsObject = (rawError: any, includeStack = false) => {
  if (["string", "boolean", "number"].includes(typeof rawError)) {
    return { message: rawError };
  }
  if (rawError instanceof Error) {
    const result = JSON.parse(JSON.stringify(rawError, Object.getOwnPropertyNames(rawError)));
    if (!includeStack) {
      return omitKeys(result, ["stack"]);
    }
    return result;
  }

  return rawError;
};

type GetSerializedClientErrorFromPGErrorArgs =
  | {
      type: "sql";
      localParams: LocalParams | undefined;
    }
  | {
      type: "tableMethod";
      localParams: LocalParams | undefined;
      view: ViewHandler | Partial<TableHandler> | undefined;
      allowedKeys?: string[];
    }
  | {
      type: "method";
      localParams: LocalParams | undefined;
      allowedKeys?: string[];
      view?: undefined;
    };

const sensitiveErrorKeys = ["hint", "detail", "context"] as const;
const otherKeys = [
  "column",
  "code",
  "code_info",
  "table",
  "constraint",
  "severity",
  "message",
  "name",
] as const;

export function getSerializedClientErrorFromPGError(
  rawError: any,
  args: GetSerializedClientErrorFromPGErrorArgs
): AnyObject {
  const err = getErrorAsObject(rawError);
  if (err.code) {
    err.code_info = sqlErrCodeToMsg(err.code);
  }
  if (process.env.PRGL_DEBUG) {
    console.trace(err);
  }

  const isServerSideRequest = !args.localParams;
  //TODO: add a rawSQL check for HTTP requests
  const showFullError =
    isServerSideRequest ||
    args.type === "sql" ||
    args.localParams?.clientReq?.socket?.prostgles?.rawSQL;
  if (showFullError) {
    return err;
  }
  const { view, allowedKeys } = args;

  const finalKeys = [...otherKeys, ...(allowedKeys ?? [])];

  const errObject = pickKeys(err, finalKeys);
  if (view?.dboBuilder?.constraints && errObject.constraint && !errObject.column) {
    const constraint = view.dboBuilder.constraints.find(
      (c) => c.conname === errObject.constraint && c.relname === view.name
    );
    if (constraint) {
      const cols = view.columns?.filter(
        (c) =>
          (!allowedKeys || allowedKeys.includes(c.name)) &&
          constraint.conkey.includes(c.ordinal_position)
      );
      const [firstCol] = cols ?? [];
      if (firstCol) {
        errObject.column = firstCol.name;
        errObject.columns = cols?.map((c) => c.name);
      }
    }
  }
  return errObject;
}
export function getClientErrorFromPGError(
  rawError: any,
  args: GetSerializedClientErrorFromPGErrorArgs
) {
  const errorObj = getSerializedClientErrorFromPGError(rawError, args);
  return Promise.reject(errorObj);
}

/**
 * @deprecated
 */
export function parseError(e: any, _caller: string): ProstglesError {
  const errorObject = isObject(e) ? e : undefined;
  const message =
    typeof e === "string" ? e
    : e instanceof Error ? e.message
    : isObject(errorObject) ?
      (errorObject.message ?? errorObject.txt ?? JSON.stringify(errorObject) ?? "")
    : "";

  const result: ProstglesError = {
    ...errorObject,
    message,
  };
  return result;
}

export type PGConstraint = {
  /**
   * Constraint type
   */
  contype:
    | "u" // Unique
    | "p" // Primary key
    | "c"; // Check

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

export const getConstraints = async (
  db: DB,
  schema: ProstglesInitOptions["schemaFilter"]
): Promise<PGConstraint[]> => {
  const { sql, schemaNames } = getSchemaFilter(schema);
  return db.any(
    `
    SELECT rel.relname, con.conkey, con.conname, con.contype
    FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel
            ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = connamespace
    WHERE nsp.nspname ${sql}
  `,
    { schemaNames }
  );
};

/**
 * @deprecated
 * use isObject
 */
export function isPlainObject(o: any): o is Record<string, any> {
  return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}

export function postgresToTsType(udt_data_type: PG_COLUMN_UDT_DATA_TYPE): keyof typeof TS_PG_Types {
  return (
    getKeys(TS_PG_Types).find((k) => {
      // @ts-ignore
      return TS_PG_Types[k].includes(udt_data_type);
    }) ?? "any"
  );
}

export const prepareOrderByQuery = (items: SortItem[], tableAlias?: string): string[] => {
  if (!items.length) return [];
  return [
    "ORDER BY " +
      items
        .map((d) => {
          const orderType = d.asc ? " ASC " : " DESC ";
          const nullOrder = d.nulls ? ` NULLS ${d.nulls === "first" ? " FIRST " : " LAST "}` : "";
          if (d.type === "query" && d.nested) {
            return d.fieldQuery;
          }
          return `${asNameAlias(d.key, tableAlias)} ${orderType} ${nullOrder}`;
        })
        .join(", "),
  ];
};

export const getCanExecute = async (db: DB) => {
  try {
    await db.task((t) => t.any(`DO $$ BEGIN  EXECUTE 'select 1'; END $$;`));
    return true;
  } catch (error) {
    console.warn(error);
  }

  return false;
};

export const withUserRLS = (localParams: LocalParams | undefined, query: string) => {
  const user = localParams?.isRemoteRequest?.user;
  const queryPrefix = `SET SESSION "prostgles.user" \nTO`;
  let firstQuery = `${queryPrefix} '';`;
  if (user) {
    firstQuery = pgp.as.format(`${queryPrefix} \${user};`, { user });
  }

  return [firstQuery, query].join("\n");
};

function canBeUsedAsIsInTypescript(str: string): boolean {
  if (!str) return false;
  const isAlphaNumericOrUnderline = str.match(/^[a-z0-9_]+$/i);
  const startsWithCharOrUnderscore = str[0]?.match(/^[a-z_]+$/i);
  return Boolean(isAlphaNumericOrUnderline && startsWithCharOrUnderscore);
}
