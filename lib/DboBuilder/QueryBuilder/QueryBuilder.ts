
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isPlainObject, postgresToTsType, SortItem } from "../../DboBuilder";
import { isEmpty, asName, ColumnInfo, PG_COLUMN_UDT_DATA_TYPE, isObject, Select, JoinSelect, getKeys, ValidatedColumnInfo, TS_PG_Types } from "prostgles-types";

import { COMPUTED_FIELDS, FieldSpec, FUNCTIONS, FunctionSpec, parseFunction } from "./Functions";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { ParsedJoinPath } from "../ViewHandler/parseJoinPath";

export type SelectItem = {
  getFields: (args?: any[]) => string[] | "*";
  getQuery: (tableAlias?: string) => string;
  columnPGDataType?: string;
  column_udt_type?: PG_COLUMN_UDT_DATA_TYPE;
  tsDataType?: ValidatedColumnInfo["tsDataType"]
  // columnName?: string; /* Must only exist if type "column" ... dissalow aliased columns? */
  alias: string;
  selected: boolean;
} & ({
  type: "column";
  columnName: string;
} | {
  type: "function" | "aggregation" | "joinedColumn" | "computed";
  columnName?: undefined;
});
export type SelectItemValidated = SelectItem & { fields: string[]; }

export type NewQueryRoot = {
  /**
   * All fields from the table will be in nested SELECT and GROUP BY to allow order/filter by fields not in select 
   */
  allFields: string[];

  /**
   * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
   */
  select: SelectItem[];

  table: string;
  where: string;
  whereOpts: Awaited<ReturnType<ViewHandler["prepareWhere"]>>;
  orderByItems: SortItem[];
  having: string;
  limit: number;
  offset: number;
  isLeftJoin: boolean;
  tableAlias?: string;
};

export type NewQueryJoin = (NewQuery & {
  joinPath: ParsedJoinPath[];
});
export type NewQuery = NewQueryRoot & {
  joins?: NewQueryJoin[];
}

export const asNameAlias = (field: string, tableAlias?: string) => {
  const result = asName(field);
  if(tableAlias) return asName(tableAlias) + "." + result;
  return result;
}

export const parseFunctionObject = (funcData: any): { funcName: string; args: any[] } => {
  const makeErr = (msg: string) => `Function not specified correctly. Expecting { $funcName: ["columnName",...] } object but got: ${JSON.stringify(funcData)} \n ${msg}`
  if(!isObject(funcData)) throw makeErr("");
  const keys = getKeys(funcData);
  if(keys.length !== 1) throw makeErr("");
  const funcName = keys[0]!;
  const args = funcData[funcName];
  if(!args || !Array.isArray(args)){
    throw makeErr("Arguments missing or invalid");
  }

  return { funcName, args };
}


export class SelectItemBuilder {

  select: SelectItemValidated[] = [];
  private allFields: string[];

  private allowedFields: string[];
  private allowedOrderByFields: string[];
  private computedFields: FieldSpec[];
  private functions: FunctionSpec[];
  private allowedFieldsIncludingComputed: string[];
  private isView: boolean;
  private columns: ColumnInfo[];

  constructor(params: { allowedFields: string[]; allowedOrderByFields: string[]; computedFields: FieldSpec[]; functions: FunctionSpec[]; allFields: string[]; isView: boolean; columns: ColumnInfo[]; }){
    this.allFields = params.allFields;
    this.allowedFields = params.allowedFields;
    this.allowedOrderByFields = params.allowedOrderByFields;
    this.computedFields = params.computedFields;
    this.isView = params.isView;
    this.functions = params.functions;
    this.columns = params.columns;
    this.allowedFieldsIncludingComputed = this.allowedFields.concat(this.computedFields? this.computedFields.map(cf => cf.name) : []);
    if(!this.allowedFields.length){
      throw "allowedFields empty/missing";
    }

    /* Check for conflicting computed column names */
    const conflictingCol = this.allFields.find(fieldName => this.computedFields.find(cf => cf.name === fieldName));
    if(conflictingCol){
      throw "INTERNAL ERROR: Cannot have duplicate column names ( " + conflictingCol + " ). One or more computed column names are colliding with table columns ones";
    }
  }

  private checkField = (f: string, isSelected: boolean) => {
    const allowedSelectedFields = this.allowedFieldsIncludingComputed;
    const allowedNonSelectedFields = [...this.allowedFieldsIncludingComputed, ...this.allowedOrderByFields];

    /** Not selected items can be part of the orderBy fields */
    const allowedFields = isSelected? allowedSelectedFields : allowedNonSelectedFields;
    if(!allowedFields.includes(f)){
      throw "Field " + f + " is invalid or dissallowed. \nAllowed fields: " + allowedFields.join(", ");
    }
    return f;
  }

  private addItem = (item: SelectItem) => {
    let fields = item.getFields();
    // console.trace(fields)
    if(fields === "*") fields = this.allowedFields.slice(0);
    fields.map(f => this.checkField(f, item.selected));

    if(this.select.find(s => s.alias === item.alias)){ 
      throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
    }
    this.select.push({ ...item, fields });
  }

  private addFunction = (func: FunctionSpec | string, args: any[], alias: string) => {
    const funcDef = parseFunction({
      func, args, functions: this.functions,
      allowedFields: this.allowedFieldsIncludingComputed,
    });

    this.addItem({
      type: funcDef.type,
      alias,
      getFields: () => funcDef.getFields(args),
      getQuery: (tableAlias?: string) => funcDef.getQuery({ allColumns: this.columns, allowedFields: this.allowedFields, args, tableAlias, 
        ctidField: undefined,

        /* CTID not available in AFTER trigger */
        // ctidField: this.isView? undefined : "ctid" 
      }),
      selected: true
    });
  }

  addColumn = (fieldName: string, selected: boolean) => {
  
    /* Check if computed col */
    if(selected){
      const compCol = COMPUTED_FIELDS.find(cf => cf.name === fieldName);
      if(compCol && !this.select.find(s => s.alias === fieldName)){
        const cf: FunctionSpec = { 
          ...compCol,
          type: "computed",
          numArgs: 0,
          singleColArg: false,
          getFields: (_args: any[]) => [] 
        }
        this.addFunction(cf, [], compCol.name)
        return;
      }
    }

    const colDef = this.columns.find(c => c.name === fieldName);
    const alias = selected? fieldName : ("not_selected_" + fieldName);
    this.addItem({
      type: "column",
      columnName: fieldName,
      columnPGDataType: colDef?.data_type,
      column_udt_type: colDef?.udt_name,
      tsDataType: colDef && postgresToTsType(colDef.udt_name),
      alias,
      getQuery: (tableAlias) => asNameAlias(fieldName, tableAlias),
      getFields: () => [fieldName],
      selected
    });
  }

  parseUserSelect = async (userSelect: Select, joinParse?: (key: string, val: JoinSelect, throwErr: (msg: string) => any) => any) => {

    /* [col1, col2, col3] */
    if(Array.isArray(userSelect)){
      if(userSelect.find(key => typeof key !== "string")) throw "Invalid array select. Expecting an array of strings";
  
      userSelect.map(key => this.addColumn(key, true))
  
    /* Empty select */
    } else if(userSelect === ""){ 
      return [];
      
    } else if(userSelect === "*"){
      this.allowedFields.map(key => this.addColumn(key, true) );

    } else if(isPlainObject(userSelect) && !isEmpty(userSelect)){
      const selectKeys = Object.keys(userSelect),
        selectValues = Object.values(userSelect);
  
      /* Cannot include and exclude at the same time */
      if(
        selectValues.filter(v => [0, false].includes(v)).length 
      ){
        if(selectValues.filter(v => ![0, false].includes(v)).length ){
          throw "\nCannot include and exclude fields at the same time";
        }
  
        /* Exclude only */
        this.allowedFields.filter(f => !selectKeys.includes(f)).map(key => this.addColumn(key, true) )
          
      } else {
        await Promise.all(selectKeys.map(async key => {
          const val: any = userSelect[key as keyof typeof userSelect],
            throwErr = (extraErr = "") => {
              console.trace(extraErr)
              throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
            };
        
          /* Included fields */
          if([1, true].includes(val)){
            if(key === "*"){
              this.allowedFields.map(key => this.addColumn(key, true) )
            } else {
              this.addColumn(key, true);
            }
  
          /* Aggs and functions */
          } else if(typeof val === "string" || isObject(val)) {
  
            /* Function shorthand notation
                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
            */  
            if(
              (typeof val === "string" && val !== "*") ||
              isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0]) // !isPlainObject(Object.values(val)[0])
            ){
              // if(!Array.isArray(Object.values(val)[0])){
              //   throw `Could not parse selected item: ${JSON.stringify(val)}\nFunction arguments must be in an array`;
              // }

              let funcName, args;
              if(typeof val === "string") {
                /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                try {
                  this.checkField(key, true)
                } catch (err){
                  throwErr(` Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. \n Use correct column name or full aliased function notation, e.g.: -> { alias: { $func_name: ["column_name"] } } `)
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

              if(!joinParse) {
                throw "Joins dissalowed";
              }
              await joinParse(key, val as JoinSelect, throwErr);
              
            }
  
          } else throwErr();
  
        }));
      }
    } else throw "Unexpected select -> " + JSON.stringify(userSelect);
  
  }

}
