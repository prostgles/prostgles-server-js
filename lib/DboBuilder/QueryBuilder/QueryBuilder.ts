/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  asName,
  ColumnInfo,
  getKeys,
  isEmpty,
  isObject,
  JoinSelect,
  PG_COLUMN_UDT_DATA_TYPE,
  Select,
  ValidatedColumnInfo,
} from "prostgles-types";
import { postgresToTsType, SortItem } from "../DboBuilder";

import { ParsedJoinPath } from "../ViewHandler/parseJoinPath";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { COMPUTED_FIELDS, FieldSpec, FunctionSpec, parseFunction } from "./Functions";

export type SelectItem = {
  getFields: (args: any[]) => string[] | "*";
  getQuery: (tableAlias?: string) => string;
  columnPGDataType?: string;
  column_udt_type?: PG_COLUMN_UDT_DATA_TYPE;
  tsDataType?: ValidatedColumnInfo["tsDataType"];
  alias: string;
  selected: boolean;
} & (
  | {
      type: "column";
      columnName: string;
    }
  | {
      type: "function" | "aggregation" | "joinedColumn" | "computed";
      columnName?: undefined;
      // args: any[];
      // getFields: (args: any[]) => string[] | "*";
      // columnNames: string[];
    }
);
export type SelectItemValidated = Omit<SelectItem, "getFields"> & { fields: string[] };
export type WhereOptions = Awaited<ReturnType<ViewHandler["prepareWhere"]>>;
export type NewQueryRoot = {
  /**
   * All fields from the table will be in nested SELECT and GROUP BY to allow order/filter by fields not in select
   */
  allFields: string[];

  /**
   * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
   */
  select: SelectItemValidated[];

  table: string;
  where: string;
  whereOpts: WhereOptions;
  orderByItems: SortItem[];
  having: string;
  limit: number | null;
  offset: number;
  isLeftJoin: boolean;
  tableAlias?: string;
};

export type NewQueryJoin = NewQuery & {
  joinPath: ParsedJoinPath[];
  joinAlias: string;
};
export type NewQuery = NewQueryRoot & {
  joins?: NewQueryJoin[];
};

export const asNameAlias = (field: string, tableAlias?: string) => {
  const result = asName(field);
  if (tableAlias) return asName(tableAlias) + "." + result;
  return result;
};

export const parseFunctionObject = (funcData: unknown): { funcName: string; args: any[] } => {
  const makeErr = (msg: string) =>
    `Function not specified correctly. Expecting { $funcName: ["columnName" | <value>, ...args] } object but got: ${JSON.stringify(funcData)} \n ${msg}`;
  if (!isObject(funcData)) throw makeErr("");
  const keys = getKeys(funcData);
  if (keys.length !== 1) throw makeErr("");
  const funcName = keys[0]!;
  const args = funcData[funcName] as unknown;
  if (!args || !Array.isArray(args)) {
    throw makeErr("Arguments missing or invalid");
  }

  return { funcName, args };
};

export class SelectItemBuilder {
  select: SelectItemValidated[] = [];
  private allFields: string[];

  private allowedFields: string[];
  private allowedOrderByFields: string[];
  private computedFields: FieldSpec[];
  private functions: FunctionSpec[];
  private allowedFieldsIncludingComputed: string[];
  private columns: ColumnInfo[];

  constructor(params: {
    allowedFields: string[];
    allowedOrderByFields: string[];
    computedFields: FieldSpec[];
    functions: FunctionSpec[];
    allFields: string[];
    isView: boolean;
    columns: ColumnInfo[];
  }) {
    this.allFields = params.allFields;
    this.allowedFields = params.allowedFields;
    this.allowedOrderByFields = params.allowedOrderByFields;
    this.computedFields = params.computedFields;
    this.functions = params.functions;
    this.columns = params.columns;
    this.allowedFieldsIncludingComputed = this.allowedFields.concat(
      this.computedFields.map((cf) => cf.name)
    );
    if (!this.allowedFields.length) {
      if (!this.columns.length) {
        throw "This view/table has no columns. Cannot select anything";
      }
      throw "allowedFields empty/missing";
    }

    /* Check for conflicting computed column names */
    const conflictingCol = this.allFields.find((fieldName) =>
      this.computedFields.find((cf) => cf.name === fieldName)
    );
    if (conflictingCol) {
      throw (
        "INTERNAL ERROR: Cannot have duplicate column names ( " +
        conflictingCol +
        " ). One or more computed column names are colliding with table columns ones"
      );
    }
  }

  private checkField = (f: string, isSelected: boolean) => {
    const allowedSelectedFields = this.allowedFieldsIncludingComputed;
    const allowedNonSelectedFields = [
      ...this.allowedFieldsIncludingComputed,
      ...this.allowedOrderByFields,
    ];

    /** Not selected items can be part of the orderBy fields */
    const allowedFields = isSelected ? allowedSelectedFields : allowedNonSelectedFields;
    if (!allowedFields.includes(f)) {
      throw (
        "Field " + f + " is invalid or dissallowed. \nAllowed fields: " + allowedFields.join(", ")
      );
    }
    return f;
  };

  private addItem = (item: SelectItemValidated) => {
    const { fields } = item;

    fields.forEach((f) => this.checkField(f, item.selected));

    if (this.select.find((s) => s.alias === item.alias)) {
      throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
    }
    this.select.push({ ...item, fields });
  };

  private addFunction = (func: FunctionSpec | string, args: any[], alias: string) => {
    const funcDef = parseFunction({
      func,
      args,
      functions: this.functions,
      allowedFields: this.allowedFieldsIncludingComputed,
    });

    const fieldFilter = funcDef.getFields(args);
    this.addItem({
      type: funcDef.type,
      alias,
      fields: fieldFilter === "*" ? this.allowedFields : fieldFilter,
      getQuery: (tableAlias?: string) =>
        funcDef.getQuery({
          allColumns: this.columns,
          allowedFields: this.allowedFields,
          args,
          tableAlias,
          ctidField: undefined,

          /* CTID not available in AFTER trigger */
          // ctidField: this.isView? undefined : "ctid"
        }),
      selected: true,
    });
  };

  addColumn = (fieldName: string, selected: boolean) => {
    /* Check if computed col */
    if (selected) {
      const compCol = COMPUTED_FIELDS.find((cf) => cf.name === fieldName);
      if (compCol && !this.select.find((s) => s.alias === fieldName)) {
        const cf: FunctionSpec = {
          ...compCol,
          type: "computed",
          numArgs: 0,
          singleColArg: false,
          getFields: (_args: any[]) => [],
        };
        this.addFunction(cf, [], compCol.name);
        return;
      }
    }

    const colDef = this.columns.find((c) => c.name === fieldName);
    const alias = selected ? fieldName : "not_selected_" + fieldName;
    this.addItem({
      type: "column",
      columnName: fieldName,
      columnPGDataType: colDef?.data_type,
      column_udt_type: colDef?.udt_name,
      tsDataType: colDef && postgresToTsType(colDef.udt_name),
      alias,
      getQuery: (tableAlias) => asNameAlias(fieldName, tableAlias),
      fields: [fieldName],
      selected,
    });
  };

  parseUserSelect = async (
    userSelect: Select,
    joinParse?: (key: string, val: JoinSelect, throwErr: (msg: string) => any) => any
  ) => {
    /* [col1, col2, col3] */
    if (Array.isArray(userSelect)) {
      if (userSelect.find((key) => typeof key !== "string"))
        throw "Invalid array select. Expecting an array of strings";

      userSelect.map((key) => this.addColumn(key, true));

      /* Empty select */
    } else if (userSelect === "") {
      return [];
    } else if (userSelect === "*") {
      this.allowedFields.map((key) => this.addColumn(key, true));
    } else if (isObject(userSelect) && !isEmpty(userSelect)) {
      const selectKeys = Object.keys(userSelect),
        selectValues = Object.values(userSelect);

      /* Cannot include and exclude at the same time */
      if (selectValues.filter((v) => [0, false].includes(v as number)).length) {
        if (selectValues.filter((v) => ![0, false].includes(v as number)).length) {
          throw "\nCannot include and exclude fields at the same time";
        }

        /* Exclude only */
        this.allowedFields
          .filter((f) => !selectKeys.includes(f))
          .map((key) => this.addColumn(key, true));
      } else {
        await Promise.all(
          selectKeys.map(async (key) => {
            const val: unknown = userSelect[key as keyof typeof userSelect];
            const throwErr = (extraErr = "") => {
              console.trace(extraErr);
              throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
            };

            /* Included fields */
            if ([1, true].includes(val as number | boolean)) {
              if (key === "*") {
                this.allowedFields.map((key) => this.addColumn(key, true));
              } else {
                this.addColumn(key, true);
              }

              /* Aggs and functions */
            } else if (typeof val === "string" || isObject(val)) {
              /* Function shorthand notation
                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
            */
              if (
                (typeof val === "string" && val !== "*") ||
                (isObject(val) &&
                  Object.keys(val).length === 1 &&
                  Array.isArray(Object.values(val)[0]))
              ) {
                let funcName: string | undefined, args: any[] | undefined;
                if (typeof val === "string") {
                  /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                  try {
                    this.checkField(key, true);
                  } catch {
                    throwErr(
                      ` Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. \n Use correct column name or full aliased function notation, e.g.: -> { alias: { $func_name: ["column_name"] } } `
                    );
                  }
                  funcName = val;
                  args = [key];

                  /** Function full notation { $funcName: ["colName", ...args] } */
                } else {
                  ({ funcName, args } = parseFunctionObject(val));
                }

                this.addFunction(funcName, args, key);

                /* Join */
              } else {
                if (!joinParse) {
                  throw "Joins dissalowed";
                }
                await joinParse(key, val as JoinSelect, throwErr);
              }
            } else throwErr();
          })
        );
      }
    } else {
      if (isEmpty(userSelect)) {
        throw "Unexpected empty object select";
      }
      throw "Unexpected select -> " + JSON.stringify(userSelect);
    }
  };
}
