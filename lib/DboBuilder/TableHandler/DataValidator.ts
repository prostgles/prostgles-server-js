import { AnyObject, ColumnInfo, FieldFilter, ValidatedColumnInfo, asName, getKeys, isEmpty, isObject, pickKeys, unpatchText } from "prostgles-types/dist";
import { ValidateRowBasic } from "../../PublishParser/PublishParser";
import { DBHandlerServer } from "../../Prostgles";
import { asValue } from "../../PubSubManager/PubSubManager";
import { LocalParams, TableSchemaColumn, pgp } from "../DboBuilder";
import { TableHandler, ValidatedParams } from "./TableHandler";
import { parseFunctionObject } from "../QueryBuilder/QueryBuilder";
import { validateObj } from "../ViewHandler/ViewHandler";

type RowFieldDataPlain = {
  type: "plain";
  column: TableSchemaColumn;
  fieldValue: any;
}

type RowFieldDataFunction = {
  type: "function";
  column: TableSchemaColumn;
  funcName: string;
  args: any[];
}
type RowFieldData = RowFieldDataPlain | RowFieldDataFunction;

type ParsedRowFieldData = {
  escapedCol: string;
  escapedVal: string;
};

type ParseDataArgs = {
  rows: AnyObject[];
  allowedCols: string[];
  dbTx: DBHandlerServer;
  command: "update" | "insert";
  validationOptions: {
    localParams: undefined | LocalParams;
    validate: undefined | ValidateRowBasic;
  }
}

export class DataValidator {
  rowFieldData?: RowFieldData[][];
  parsedRowFieldData?: ParsedRowFieldData[][];
  tableHandler: TableHandler;
  constructor(tableHandler: TableHandler) {
    this.tableHandler = tableHandler;
  }

  parse = async (args: ParseDataArgs) => {
    const { command } = args;
    const rowFieldData = await getValidatedRowFieldData(args, this.tableHandler);
    const parsedRowFieldData = await getParsedRowFieldData(rowFieldData, args);
    if (command === "update") {
      if (rowFieldData.some(rowParts => rowParts.length === 0)) {
        throw "Empty row. No data provided for update";
      }
    }

    return {
      parsedRowFieldData,
      getQuery: () => getQuery(command, parsedRowFieldData, this.tableHandler.escapedName),
    }
  }
}

const getQuery = (type: "insert" | "update", parsedRowFieldData: ParsedRowFieldData[][], escapedTableName: string): string => {
  if (type === "insert") {

    const uniqueColumns = Array.from(new Set(parsedRowFieldData.flatMap(row => row.map(r => r.escapedCol))))
    const values = parsedRowFieldData.map(row => `(${uniqueColumns.map(colName => row.find(r => r.escapedCol === colName)?.escapedVal ?? 'DEFAULT')})`).join(",\n");
    const whatToInsert = !uniqueColumns.length ? "DEFAULT VALUES" : `(${uniqueColumns}) VALUES ${values}`
    return `INSERT INTO ${escapedTableName} ${whatToInsert} `;
  } else {
    const query = parsedRowFieldData.map(rowParts => {
      return `UPDATE ${escapedTableName} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n")
    }).join(";\n") + " ";
 
    return query;
  }
}

type PrepareFieldValuesArgs = {
  row: AnyObject | undefined; 
  forcedData: AnyObject | undefined; 
  allowedCols: FieldFilter | undefined;
  removeDisallowedColumns?: boolean;
  tableHandler: TableHandler;
}
/** 
* Apply forcedData, remove disallowed columns, validate against allowed columns:   
* @example ({ item_id: 1 }, { user_id: 32 }) => { item_id: 1, user_id: 32 }
* OR
* ({ a: 1 }, { b: 32 }, ["c", "d"]) => throw "a field is not allowed"
* @param {Object} obj - initial data
* @param {Object} forcedData - set/override property
* @param {string[]} allowed_cols - allowed columns (excluding forcedData) from table rules
*/
const getValidatedRow = ({ row = {}, forcedData = {}, allowedCols, removeDisallowedColumns = false, tableHandler }: PrepareFieldValuesArgs): AnyObject => {
  const column_names = tableHandler.column_names.slice(0);
  if (!column_names.length) {
    throw "table column_names mising";
  }
  const validatedAllowedColumns = tableHandler.parseFieldFilter(allowedCols, false);
 
  let finalRow = { ...row };
  if (removeDisallowedColumns && !isEmpty(finalRow)) {
    finalRow = pickKeys(finalRow, validatedAllowedColumns);
  }

  /* If has keys check against allowed_cols */
  validateObj(finalRow, validatedAllowedColumns)

  /** Apply forcedData */
  if (!isEmpty(forcedData)) {
    finalRow = { ...finalRow, ...forcedData };
  }

  /** Validate forcedData */
  validateObj(finalRow, column_names.slice(0));
  return finalRow;
}

/**
 * Add synced_field value if missing
 * prepareFieldValues(): Apply forcedData, remove disallowed columns, validate against allowed columns
 * tableConfigurator?.checkColVal(): Validate column min/max/isText/lowerCased/trimmed values
 */
export const prepareNewData = async ({ row, forcedData, allowedFields, tableRules, fixIssues = false, tableConfigurator, tableHandler }: ValidatedParams) => {
  const synced_field = (tableRules ?? {})?.sync?.synced_field;

  /* Update synced_field if sync is on and missing */
  if (synced_field && !row[synced_field]) {
    row[synced_field] = Date.now();
  }

  const data = getValidatedRow({ tableHandler, row, forcedData, allowedCols: allowedFields , removeDisallowedColumns: fixIssues });
  const dataKeys = getKeys(data);

  dataKeys.forEach(col => {
    tableConfigurator?.checkColVal({ table: tableHandler.name, col, value: data[col] });
    const colConfig = tableConfigurator?.getColumnConfig(tableHandler.name, col);
    if (colConfig && isObject(colConfig) && "isText" in colConfig && data[col]) {
      if (colConfig.lowerCased) {
        data[col] = data[col].toString().toLowerCase()
      }
      if (colConfig.trimmed) {
        data[col] = data[col].toString().trim()
      }
    }
  })

  const allowedCols = tableHandler.columns.filter(c => dataKeys.includes(c.name)).map(c => c.name);
  return { data, allowedCols }
}


/**
 * Ensures:
 *  - allowedCols are valid and checked against data
 *  - validate()
 *  - update is not empty
 *  - no duplicate column names ( could update with $func and plain value for same column )
 */
const getValidatedRowFieldData = async ({ allowedCols, rows, validationOptions, dbTx, command }: ParseDataArgs, tableHandler: TableHandler) => {
  if (!allowedCols.length && command === "update") {
    throw "allowedColumns cannot be empty";
  }
  const rowFieldData = await Promise.all(
    rows.map(async nonvalidatedRow => {

      let row = pickKeys(nonvalidatedRow, allowedCols);
      const initialRowKeys = Object.keys(row);
      if (validationOptions.validate) {
        if(!validationOptions.localParams){
          throw "localParams missing for validate";
        }
        row = await validationOptions.validate({ row, dbx: dbTx, localParams: validationOptions.localParams });
      }
      const keysAddedDuringValidate = Object.keys(row).filter(newKey => !initialRowKeys.includes(newKey));

      const getColumn = (fieldName: string) => {
        if (!allowedCols.concat(keysAddedDuringValidate).includes(fieldName)) {
          throw `Unexpected/Dissallowed column name: ${fieldName}`;
        }
        const column = tableHandler.columns.find(c => c.name === fieldName);
        if (!column) {
          throw `Invalid column: ${fieldName}`;
        }
        return column;
      };

      const rowPartValues = Object.entries(row).map(([fieldName, fieldValue]) => {
        const column = getColumn(fieldName);
        if (isObject(fieldValue)) {

          // const textPatch = getTextPatch(column, fieldValue);
          // if(textPatch){
          //   return {
          //     type: "plain",
          //     column,
          //     fieldValue: textPatch,
          //   } satisfies RowFieldData;
          // }

          const keys = Object.keys(fieldValue);
          const func = keys.length === 1?  convertionFuncs.some(f => `$${f.name}` === keys[0]) : undefined;
          if(func){
            const { funcName, args } = parseFunctionObject(fieldValue);
            return {
              type: "function",
              column,
              funcName,
              args,
            } satisfies RowFieldData
          }
        } 
        return {
          type: "plain",
          column: getColumn(fieldName),
          fieldValue,
        } satisfies RowFieldData;
      });
 
      return rowPartValues;
    }));

  return rowFieldData;
}

const getTextPatch = async (c: TableSchemaColumn, fieldValue: any) => {

  if (c.data_type === "text" && fieldValue && isObject(fieldValue) && !["from", "to"].find(key => typeof fieldValue[key] !== "number")) {
    const unrecProps = Object.keys(fieldValue).filter(k => !["from", "to", "text", "md5"].includes(k));
    if (unrecProps.length) {
      throw "Unrecognised params in textPatch field: " + unrecProps.join(", ");
    }
    const patchedTextData: {
      fieldName: string;
      from: number;
      to: number;
      text: string;
      md5: string
    } = {
      ...fieldValue, 
      fieldName: c.name 
    } as any;

    // if (tableRules && !tableRules.select) throw "Select needs to be permitted to patch data";
    // const rows = await this.find(filter, { select: patchedTextData.reduce((a, v) => ({ ...a, [v.fieldName]: 1 }), {}) }, undefined, tableRules);

    // if (rows.length !== 1) {
    //   throw "Cannot patch data within a filter that affects more/less than 1 row";
    // }
    // return unpatchText(rows[0][p.fieldName], patchedTextData);
    const rawValue = `OVERLAY(${asName(c.name)} PLACING ${asValue(patchedTextData.text)} FROM ${asValue(patchedTextData.from)} FOR ${asValue(patchedTextData.to - patchedTextData.from + 1)})`
    return rawValue;
  } 

  return undefined
}

const getParsedRowFieldDataFunction = async (rowPart: RowFieldDataFunction, args: ParseDataArgs) => {

  const func = convertionFuncs.find(f => `$${f.name}` === rowPart.funcName);
  if (!func) {
    throw `Unknown function: ${rowPart.funcName}. Expecting one of: ${convertionFuncs.map(f => f.name).join(", ")}`;
  }
  if (func.onlyAllowedFor && func.onlyAllowedFor !== args.command) {
    throw `Function ${rowPart.funcName} is only allowed for ${func.onlyAllowedFor} but not ${args.command}`;
  }
  return func.getQuery(rowPart);
};

const getParsedRowFieldData = async (rowFieldData: RowFieldData[][], args: ParseDataArgs) => {
  const parsedRowFieldData = Promise.all(rowFieldData.map(rowParts => {
    return Promise.all(rowParts.map(async rowPart => {
      let escapedVal: string;
      if (rowPart.type === "function") {
        escapedVal = await getParsedRowFieldDataFunction(rowPart, args);
      } else {

        /** Prevent pg-promise formatting jsonb */
        const colIsJSON = ["json", "jsonb"].includes(rowPart.column.data_type);
        escapedVal = pgp.as.format(colIsJSON ? "$1:json" : "$1", [rowPart.fieldValue])
      }

      /**
       * Cast to type to avoid array errors (they do not cast automatically)
       */
      escapedVal += `::${rowPart.column.udt_name}`;

      return {
        escapedCol: asName(rowPart.column.name),
        escapedVal,
      };
    }));
  }));

  return parsedRowFieldData;
}



type ConvertionFunc = {
  name: string;
  description?: string;
  onlyAllowedFor?: "insert" | "update";
  getQuery: (fieldPart: RowFieldDataFunction) => string;
};

const convertionFuncs: ConvertionFunc[] = [
  ...[
    "ST_GeomFromText",
    "ST_Point",
    "ST_MakePoint",
    "ST_MakePointM",
    "ST_PointFromText",
    "ST_GeomFromEWKT",
    "ST_GeomFromGeoJSON"
  ].map(name => ({
    name,
    getQuery: ({ args }) => {
      const argList = args.map(arg => asValue(arg)).join(", ");
      return `${name}(${argList})`;
    }
  } satisfies ConvertionFunc)),
  {
    name: "to_timestamp",
    getQuery: ({ args }) => `to_timestamp(${asValue(args[0])}::BIGINT/1000.0)::timestamp`
  }, {
    name: "merge",
    description: "Merge the provided jsonb objects into the existing column value",
    onlyAllowedFor: "update",
    getQuery: ({ args, column }) => {
      if (!args.length) throw "merge function requires at least one argument";
      const argList = args.map(arg => asValue(arg)).join(" || ");
      return `${asName(column.name)} || ${argList}`;
    }
  }
];


export class ColSet {
  opts: {
    columns: ColumnInfo[];
    tableName: string;
    colNames: string[];
  };

  constructor(columns: ColumnInfo[], tableName: string) {
    this.opts = { columns, tableName, colNames: columns.map(c => c.name) }
  }


  // private async getRow(data: any, allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined, command: "update" | "insert", localParams: LocalParams | undefined): Promise<ParsedRowFieldData[]> {
  //   const badCol = allowedCols.find(c => !this.opts.colNames.includes(c))
  //   if (!allowedCols || badCol) {
  //     throw "Missing or unexpected columns: " + badCol;
  //   }

  //   if (command === "update" && isEmpty(data)) {
  //     throw "No data provided for update";
  //   }

  //   let row = pickKeys(data, allowedCols);
  //   if (validate) {
  //     if (!localParams) throw "localParams missing"
  //     row = await validate({ row, dbx: dbTx, localParams });
  //   }

  //   return Object.entries(row).map(([fieldName, fieldValue]) => {
  //     const col = this.opts.columns.find(c => c.name === fieldName);
  //     if (!col) throw "Unexpected missing col name";

  //     /**
  //      * Add conversion functions for PostGIS data
  //      */
  //     let escapedVal = "";
  //     if ((col.udt_name === "geometry" || col.udt_name === "geography") && isObject(fieldValue)) {

  //       const dataKeys = Object.keys(fieldValue);
  //       const funcName = dataKeys[0]!;
  //       const func = convertionFuncs.find(f => f.name === funcName);
  //       const funcArgs = fieldValue?.[funcName]
  //       if (dataKeys.length !== 1 || !func || !Array.isArray(funcArgs)) {
  //         throw `Expecting only one function key (${convertionFuncs.join(", ")}) \nwith an array of arguments \n within column (${fieldName}) data but got: ${JSON.stringify(fieldValue)} \nExample: { geo_col: { ST_GeomFromText: ["POINT(-71.064544 42.28787)", 4326] } }`;
  //       }
  //       escapedVal = func.getQuery(funcArgs);
  //     } else if (col.udt_name === "text") {


  //     } else {
  //       /** Prevent pg-promise formatting jsonb */
  //       const colIsJSON = ["json", "jsonb"].includes(col.data_type);
  //       escapedVal = pgp.as.format(colIsJSON ? "$1:json" : "$1", [fieldValue])
  //     }

  //     /**
  //      * Cast to type to avoid array errors (they do not cast automatically)
  //      */
  //     escapedVal += `::${col.udt_name}`

  //     return {
  //       escapedCol: asName(fieldName),
  //       escapedVal,
  //     }
  //   });

  // }

  // async getInsertQuery(data: AnyObject[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRowBasic | undefined, localParams: LocalParams | undefined) {
  //   const inserts = (await Promise.all(data.map(async d => {
  //     const rowParts = await this.getRow(d, allowedCols, dbTx, validate, "insert", localParams);
  //     return Object.fromEntries(rowParts.map(rp => [rp.escapedCol, rp.escapedVal]));
  //   })));
  //   const uniqueColumns = Array.from(new Set(inserts.flatMap(row => Object.keys(row))))
  //   const values = inserts.map(row => `(${uniqueColumns.map(colName => row[colName] ?? 'DEFAULT')})`).join(",\n");
  //   const whatToInsert = !uniqueColumns.length ? "DEFAULT VALUES" : `(${uniqueColumns}) VALUES ${values}`
  //   return `INSERT INTO ${this.opts.tableName} ${whatToInsert} `;
  // }
  // async getUpdateQuery(data: AnyObject | AnyObject[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRowBasic | undefined, localParams: LocalParams | undefined): Promise<string> {
  //   const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async d => {
  //     const rowParts = await this.getRow(d, allowedCols, dbTx, validate, "update", localParams);
  //     return `UPDATE ${this.opts.tableName} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n")
  //   }))).join(";\n") + " ";
  //   return res;
  // }
}