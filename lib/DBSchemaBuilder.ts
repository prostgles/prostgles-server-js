import { AnyObject, DbJoinMaker, DBSchema, isObject, JSONB, SQLHandler, TableHandler, ViewHandler } from "prostgles-types";
import prostgles from ".";
import { Auth } from "./AuthHandler";
import { DboBuilder, escapeTSNames, postgresToTsType } from "./DboBuilder/DboBuilder";
import { PublishAllOrNothing, PublishParams, PublishTableRule, PublishViewRule,  } from "./PublishParser/PublishParser";
import { getJSONBSchemaTSTypes } from "./JSONBValidation/validation";
import { DBHandlerServer, TableSchemaColumn, TX } from "./DboBuilder/DboBuilderTypes";


export const getDBSchema = (dboBuilder: DboBuilder): string => {
  const tables: string[] = [];

  const getColTypeForDBSchema = (udt_name: TableSchemaColumn["udt_name"]): string => {
    if(udt_name === "interval"){
      const units = [ "years", "months", "days", "hours", "minutes", "seconds", "milliseconds"];
      
      return `{ ${units.map(u => `${u}?: number;`).join(" ")} }`;
    }

    return postgresToTsType(udt_name);
  }
  
  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
    const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
    const getColType = (c: typeof cols[number]) => {

      let type: string = (c.is_nullable? "null | " : "") + getColTypeForDBSchema(c.udt_name) + ";"
      const colConf = dboBuilder.prostgles.tableConfigurator?.getColumnConfig(tov.name, c.name);
      if(colConf){
        if(isObject(colConf) && (colConf.jsonbSchema || colConf.jsonbSchemaType)){
          const schema: JSONB.JSONBSchema = colConf.jsonbSchema || { ...colConf, type: colConf.jsonbSchemaType };
          
          type = getJSONBSchemaTSTypes(schema, { nullable: colConf.nullable }, "      ", dboBuilder.tablesOrViews ?? []);
        } else if(isObject(colConf) && "enum" in colConf){
          if(!colConf.enum) throw "colConf.enum missing"
          const types = colConf.enum.map(t => typeof t === "number"? t : JSON.stringify(t));
          if(colConf.nullable){
            types.unshift("null")
          }
          type = types.join(" | ");
        }
      }
      /**
       * Columns that are nullable or have default values can be ommitted from an insert
       * Non nullable columns with default values cannot containt null values in an insert so they must contain a valid value or be omitted
       */
      return `${escapeTSNames(c.name)}${c.is_nullable || c.has_default? "?" : ""}: ${type}`
    }
tables.push(`${escapeTSNames(tov.name)}: {
    is_view: ${tov.is_view};
    select: ${tov.privileges.select};
    insert: ${tov.privileges.insert};
    update: ${tov.privileges.update};
    delete: ${tov.privileges.delete};
    columns: {${cols.map(c => `
      ${getColType(c)}`).join("")}
    };
  };\n  `)
  })
return `
export type DBSchemaGenerated = {
  ${tables.join("")}
}
`;
}

type ServerViewHandler<T extends AnyObject = AnyObject> = ViewHandler<T> & { is_view: boolean; }
type ServerTableHandler<T extends AnyObject = AnyObject> = TableHandler<T> & { is_view: boolean; }

export type DBTableHandlersFromSchema<Schema = void> = Schema extends DBSchema? { 
  [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true? 
    ServerViewHandler<Schema[tov_name]["columns"]> : 
    ServerTableHandler<Schema[tov_name]["columns"]>
} : Record<string, Partial<TableHandler>>;

export type DBHandlerServerExtra<TH = Record<string, Partial<ServerTableHandler>>, WithTransactions = true> = {
  sql: SQLHandler;
} & Partial<DbJoinMaker> & (
  WithTransactions extends true? { tx: TX<TH> } :
  Record<string, never>
);
// export type DBOFullyTyped<Schema = void> = Schema extends DBSchema? (
//     DBTableHandlersFromSchema<Schema> & DBHandlerServerExtra<DBTableHandlersFromSchema<Schema>>
//   ) : 
//   DBHandlerServer;
export type DBOFullyTyped<Schema = void> = DBTableHandlersFromSchema<Schema> & DBHandlerServerExtra<DBTableHandlersFromSchema<Schema>>

export type PublishFullyTyped<Schema = void> = Schema extends DBSchema? (
  | PublishAllOrNothing 
  | { 
    [tov_name in keyof Partial<Schema>]: 
      | PublishAllOrNothing 
      | (
        Schema[tov_name]["is_view"] extends true? 
          PublishViewRule<Schema[tov_name]["columns"], Schema> : 
          PublishTableRule<Schema[tov_name]["columns"], Schema>
      );
  }
) : (
  | PublishAllOrNothing 
  | Record<string, PublishViewRule | PublishTableRule | PublishAllOrNothing>
);



/** Type checks */
(() => {

  const ddb: DBOFullyTyped = 1 as any;
  ddb.dwad?.insert;
  ddb.dwad?.delete;

  const d: DBOFullyTyped<undefined> = 1 as any;
  d.dwad?.insert;
  d.dwad?.delete;

  const p: PublishParams = 1 as any;
  p.dbo.dwad?.insert;
  ddb.dwad?.delete;

  //@ts-ignore
  prostgles({
    dbConnection: 1 as any,
    publish: async (params) => {
      const _rows = await params.dbo.dwadwa?.find?.({});
      
      return "*" as const
    },
    transactions: true,
    onReady: ({ dbo }) => {
      dbo.tdwa?.find!();
      dbo.tx?.(t => {
        t.dwa?.find!();
      })
    }
  });


  const _auth: Auth = {
    sidKeyName: "sid_token",
    getUser: async (sid, db, _db) => {
      db.dwadaw?.find;
      return 1 as any;
    }
  }


  type S = {
    tbl1: {
      columns: {
        col1: number | null;
        col2: string; 
      }
    },
    tbl2: {
      columns: {
        col1: number | null;
        col2: string; 
      }
    }
  }

  /** Test the created schema */
  const c: S = 1 as any;
  const _test: DBSchema = c;
  const dbt: DBOFullyTyped<S> = 1 as any;

  dbt.tx!(t => {
    t.tbl1.delete();
  });

  const db: DBHandlerServer = 1 as any;
  db.tx!(t => {
    t.wadwa?.find!()
  });
  
  const _publish = (): PublishFullyTyped<S> => {
    const r = {
      tbl1: {
        select: {
          fields: "*" as const, 
          forcedFilter: { col1: 32, col2: "" }
        },
        getColumns: true,
        getInfo: true,
        delete: {
          filterFields: {col1: 1}
        }
      },
      tbl2: {
        delete: {
          filterFields: "*" as const,
          forcedFilter: {col1: 2}
        }
      }
    }
    const res: PublishFullyTyped<S> = {
      tbl1: {
        select: {
          fields: "*",
          forcedFilter: { col1: 32, col2: "" }
        },
        getColumns: true,
        getInfo: true,
        delete: {
          filterFields: { col1: 1 }
        }
      },
      tbl2: {
        delete: {
          filterFields: "*" as const,
          forcedFilter: { col1: 2 }
        }
      }
    }
    const _res1: PublishFullyTyped = r
  
    const p: PublishParams<undefined> = 1 as any;
  
    p.dbo.dwadaw?.find?.();
  
    return res;
  }
})
