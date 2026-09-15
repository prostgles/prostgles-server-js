/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
  AnyObject,
  ColumnInfo,
  OrderBy,
  PG_COLUMN_UDT_DATA_TYPE,
  Select,
  ValidatedColumnInfo,
} from "prostgles-types";
import { getKeys, includes, isEmpty, isObject, postgresToTsType } from "prostgles-types";
import type { ExistsFilterConfig, PGIdentifier, SortItem } from "../DboBuilder";

import type { Awaitable } from "../../PublishParser/publishTypesAndUtils";
import { asNameAlias } from "../../utils/asNameAlias";
import type { ParsedJoinPath } from "../ViewHandler/parseJoinPath";
import type { WhereOptions } from "../ViewHandler/prepareWhere";
import { COMPUTED_FIELDS } from "./Functions/COMPUTED_FIELDS";
import type { FieldSpec, FunctionSpec } from "./Functions/Functions";
import { parseFunction } from "./Functions/parseFunction";
import { parseJoinSelect, type ParsedJoin } from "./parseJoinSelect";
import type { QuerySource } from "./getQuerySource";

export type SelectItem = {
  getFields: (args: any[]) => string[] | "*";
  getQuery: (tableAliasRaw?: string) => string;
  columnPGDataType?: string;
  column_udt_type?: PG_COLUMN_UDT_DATA_TYPE;
  tsDataType?: ValidatedColumnInfo["tsDataType"];
  alias: string;
  selected: boolean;
  dependencyFields?: string[];
  dependencyExists?: ExistsFilterConfig[];
} & (
  | {
      type: "column";
      columnName: string;
    }
  | {
      type: "function" | "aggregation" | "joinedColumn" | "computed";
      columnName?: undefined;
    }
);
export type SelectItemValidated = Omit<SelectItem, "getFields"> & { fields: string[] };
export type NewQueryRoot = {
  /**
   * All fields from the table will be in nested SELECT and GROUP BY to allow order/filter by fields not in select
   */
  allFields: string[];

  /**
   * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
   */
  select: SelectItemValidated[];

  table: PGIdentifier;
  source: QuerySource;
  where: string;
  whereOpts: WhereOptions;
  orderByItems: SortItem[];
  having: string;
  limit: number | null;
  offset: number;
  isLeftJoin: boolean;
  tableAlias?: PGIdentifier;
};

export type NewQueryJoin = NewQuery & {
  joinPath: ParsedJoinPath[];
  joinAlias: PGIdentifier;
};
export type NewQuery = NewQueryRoot & {
  joins?: NewQueryJoin[];
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

type AggregateOptions = {
  $filter?: AnyObject;
  $orderBy?: OrderBy;
};

type ParsedAggregateOptions = {
  filter?: string;
  orderBy?: string;
  dependencyFields: string[];
  dependencyExists: ExistsFilterConfig[];
};

const aggregateOptionKeys = ["$filter", "$orderBy"] as const;
const parseSelectFunctionObject = (funcData: Record<string, unknown>) => {
  const functionData = Object.fromEntries(
    Object.entries(funcData).filter(([key]) => !includes(aggregateOptionKeys, key)),
  );
  return {
    ...parseFunctionObject(functionData),
    aggregateOptions: {
      ...(funcData.$filter !== undefined && {
        $filter: funcData.$filter as AnyObject,
      }),
      ...(funcData.$orderBy !== undefined && {
        $orderBy: funcData.$orderBy as OrderBy,
      }),
    } satisfies AggregateOptions,
  };
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
  private parseAggregateOptions?: (options: AggregateOptions) => Promise<ParsedAggregateOptions>;

  constructor(params: {
    allowedFields: string[];
    allowedOrderByFields: string[];
    computedFields: FieldSpec[];
    functions: FunctionSpec[];
    allFields: string[];
    isView: boolean;
    columns: ColumnInfo[];
    parseAggregateOptions?: (options: AggregateOptions) => Promise<ParsedAggregateOptions>;
  }) {
    this.allFields = params.allFields;
    this.allowedFields = params.allowedFields;
    this.allowedOrderByFields = params.allowedOrderByFields;
    this.computedFields = params.computedFields;
    this.functions = params.functions;
    this.columns = params.columns;
    this.parseAggregateOptions = params.parseAggregateOptions;
    this.allowedFieldsIncludingComputed = this.allowedFields.concat(
      this.computedFields.map((cf) => cf.name),
    );
    if (!this.allowedFields.length) {
      if (!this.columns.length) {
        throw "This view/table has no columns. Cannot select anything";
      }
      throw "allowedFields empty/missing";
    }

    /* Check for conflicting computed column names */
    const conflictingCol = this.allFields.find((fieldName) =>
      this.computedFields.find((cf) => cf.name === fieldName),
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
        "Field " + f + " is invalid or disallowed. \nAllowed fields: " + allowedFields.join(", ")
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

  private addFunction = (
    func: FunctionSpec | string,
    args: any[],
    alias: string,
    aggregateOptions: AggregateOptions = {},
  ): void | Promise<void> => {
    const funcDef = parseFunction({
      func,
      args,
      functions: this.functions,
      allowedFields: this.allowedFieldsIncludingComputed,
    });

    if (Object.keys(aggregateOptions).length) {
      if (funcDef.type !== "aggregation") {
        throw `Aggregate options $filter and $orderBy are only allowed on aggregate functions`;
      }
      if (!this.parseAggregateOptions) {
        throw "Aggregate options are not supported in this query";
      }
      return this.parseAggregateOptions(aggregateOptions).then((parsedOptions) => {
        this.addFunctionItem(funcDef, args, alias, parsedOptions);
      });
    }

    this.addFunctionItem(funcDef, args, alias);
  };

  private addFunctionItem = (
    funcDef: FunctionSpec,
    args: any[],
    alias: string,
    aggregateOptions?: ParsedAggregateOptions,
  ) => {
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
          tableAliasRaw: tableAlias,
          ctidField: undefined,
          aggregateFilter: aggregateOptions?.filter,
          aggregateOrderBy: aggregateOptions?.orderBy,

          /* CTID not available in AFTER trigger */
          // ctidField: this.isView? undefined : "ctid"
        }),
      selected: true,
      dependencyFields: aggregateOptions?.dependencyFields,
      dependencyExists: aggregateOptions?.dependencyExists,
    });
  };

  private addColumn = (fieldName: string, selected: boolean) => {
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
        void this.addFunction(cf, [], compCol.name);
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

  parse = async (
    userSelect: Select,
    joinParse?: (key: string, parsedJoin: ParsedJoin) => Awaitable<void>,
  ): Promise<void> => {
    if (userSelect === "") {
      return;
    }

    if (userSelect === "*") {
      this.allowedFields.map((key) => this.addColumn(key, true));
      return;
    }

    /* [col1, col2, col3] */
    if (Array.isArray(userSelect)) {
      if (userSelect.find((key) => typeof (key as unknown) !== "string")) {
        throw "Invalid array select. Expecting an array of strings";
      }

      userSelect.map((key) => this.addColumn(key, true));
      return;
    }

    if (!isObject(userSelect)) {
      throw "Unexpected select -> " + JSON.stringify(userSelect);
    }

    if (isEmpty(userSelect)) {
      throw "Unexpected empty object select";
    }

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
          const userSelectValue: unknown = userSelect[key as keyof typeof userSelect];
          const throwErr: (message: string) => never = (message) => {
            console.trace(message);
            throw (
              "Unexpected select -> " + JSON.stringify({ [key]: userSelectValue }) + "\n" + message
            );
          };

          /* Included fields */
          if (userSelectValue === 1 || userSelectValue === true) {
            if (key === "*") {
              this.allowedFields.map((key) => this.addColumn(key, true));
            } else {
              this.addColumn(key, true);
            }

            /* Aggregations and functions */
          } else if (typeof userSelectValue === "string" || isObject(userSelectValue)) {
            const functionEntries =
              isObject(userSelectValue) ?
                Object.entries(userSelectValue).filter(
                  ([key]) => !includes(aggregateOptionKeys, key),
                )
              : [];
            /* Function shorthand notation
                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
              */
            if (
              (typeof userSelectValue === "string" && userSelectValue !== "*") ||
              (isObject(userSelectValue) &&
                functionEntries.length === 1 &&
                Array.isArray(functionEntries[0]![1]))
            ) {
              let funcName: string | undefined,
                args: any[] | undefined,
                aggregateOptions: AggregateOptions = {};
              if (typeof userSelectValue === "string") {
                /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                try {
                  this.checkField(key, true);
                } catch {
                  throwErr(
                    ` Shorthand function notation error: the specified column ( ${key} ) is invalid or disallowed. \n Use correct column name or full aliased function notation, e.g.: -> { alias: { $func_name: ["column_name"] } } `,
                  );
                }
                funcName = userSelectValue;
                args = [key];

                /** Function full notation { $funcName: ["colName", ...args] } */
              } else {
                ({ funcName, args, aggregateOptions } = parseSelectFunctionObject(userSelectValue));
              }

              await this.addFunction(funcName, args, key, aggregateOptions);

              /* Join */
            } else {
              if (!joinParse) {
                throw "Joins disallowed";
              }
              const joinSelect = userSelectValue;

              const parsedJoin = parseJoinSelect(joinSelect);

              if (typeof parsedJoin === "string") {
                throwErr(parsedJoin);
              }
              await joinParse(key, parsedJoin);
            }
          } else throwErr("Invalid select value");
        }),
      );
    }

    if (!joinParse) return;
    /**
     * Is this still needed?!!!
     * Add non selected columns
     * This ensures all fields are available for orderBy in case of nested select
     * */
    Array.from(new Set([...this.allowedFields, ...this.allowedOrderByFields])).map((columnName) => {
      if (!this.select.find((s) => s.alias === columnName && s.type === "column")) {
        this.addColumn(columnName, false);
      }
    });
  };

  parseUserSelect = (userSelect: Select) => this.parse(userSelect);
  parseUserSelectWithJoins = this.parse;
}
