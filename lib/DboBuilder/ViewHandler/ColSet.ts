import { ColumnInfo, asName, isEmpty, isObject, pickKeys } from "prostgles-types/dist";
import { ValidateRow } from "../../PublishParser";
import { DBHandlerServer } from "../../Prostgles";
import { asValue } from "../../PubSubManager/PubSubManager";
import { pgp } from "../../DboBuilder";


export class ColSet {
  opts: {
    columns: ColumnInfo[];
    tableName: string;
    colNames: string[];
  };

  constructor(columns: ColumnInfo[], tableName: string) {
    this.opts = { columns, tableName, colNames: columns.map(c => c.name) }
  }

  private async getRow(data: any, allowedCols: string[], dbTx: DBHandlerServer, validate?: ValidateRow): Promise<{ escapedCol: string; escapedVal: string; }[]> {
    const badCol = allowedCols.find(c => !this.opts.colNames.includes(c))
    if (!allowedCols || badCol) {
      throw "Missing or unexpected columns: " + badCol;
    }

    if (isEmpty(data)) throw "No data";

    let row = pickKeys(data, allowedCols);
    if (validate) {
      row = await validate(row, dbTx);
    }
    const rowKeys = Object.keys(row);

    return rowKeys.map(key => {
      const col = this.opts.columns.find(c => c.name === key);
      if (!col) throw "Unexpected missing col name";

      /**
       * Add conversion functions for PostGIS data
       */
      let escapedVal = "";
      if (["geometry", "geography"].includes(col.udt_name) && isObject(row[key])) {

        const basicFunc = (args: any[]) => {
          return args.map(arg => asValue(arg)).join(", ")
        }

        type ConvertionFunc =  { name: string; getQuery: (args: any[]) => string; }
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
            getQuery: () => `${name}(${basicFunc(funcArgs)})`
          })),
          {
            name: "to_timestamp",
            getQuery: (args: any[]) => `to_timestamp(${asValue(args[0])}::BIGINT/1000.0)::timestamp`
          }
        ];

        const dataKeys = Object.keys(row[key]);
        const funcName = dataKeys[0]!;
        const func = convertionFuncs.find(f => f.name === funcName); 
        const funcArgs = row[key]?.[funcName]
        if (dataKeys.length !== 1 || !func || !Array.isArray(funcArgs)) {
          throw `Expecting only one function key (${convertionFuncs.join(", ")}) \nwith an array of arguments \n within column (${key}) data but got: ${JSON.stringify(row[key])} \nExample: { geo_col: { ST_GeomFromText: ["POINT(-71.064544 42.28787)", 4326] } }`;
        }
        escapedVal = func.getQuery(funcArgs);

      } else {
        /** Prevent pg-promise formatting jsonb */
        const colIsJSON = ["json", "jsonb"].includes(col.data_type);
        escapedVal = pgp.as.format(colIsJSON ? "$1:json" : "$1", [row[key]])
      }

      /**
       * Cast to type to avoid array errors (they do not cast automatically)
       */
      escapedVal += `::${col.udt_name}`

      return {
        escapedCol: asName(key),
        escapedVal,
      }
    });

  }

  async getInsertQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string> {
    const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async d => {
      const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
      const select = rowParts.map(r => r.escapedCol).join(", "),
        values = rowParts.map(r => r.escapedVal).join(", ");

      return `INSERT INTO ${this.opts.tableName} (${select}) VALUES (${values})`;
    }))).join(";\n") + " ";
    return res;
  }
  async getUpdateQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string> {
    const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async d => {
      const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
      return `UPDATE ${this.opts.tableName} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n")
    }))).join(";\n") + " ";
    return res;
  }
}