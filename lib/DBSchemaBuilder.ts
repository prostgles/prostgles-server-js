import { DBSchema, TableHandler, ViewHandler } from "prostgles-types";
import prostgles from ".";
import { Auth } from "./AuthHandler";
import { DBHandlerServer, DboBuilder, escapeTSNames, postgresToTsType, TableHandlers } from "./DboBuilder";
import { PublishAllOrNothing, PublishParams, PublishTableRule, PublishViewRule,  } from "./PublishParser";
import { getJSONBSchemaTSTypes } from "./validation";


export const getDBSchema = (dboBuilder: DboBuilder): string => {
  let tables: string[] = [];

  
  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
    const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
    const getColType = (c: typeof cols[number]) => {
      let type: string = (c.is_nullable? "null | " : "") + postgresToTsType(c.udt_name) + ";"
      const colConf = dboBuilder.prostgles.tableConfigurator?.getColumnConfig(tov.name, c.name);
      if(colConf){
        if("jsonbSchema" in colConf){
          if(!colConf.jsonbSchema) throw "colConf.jsonbSchema missing"
          type = getJSONBSchemaTSTypes(colConf.jsonbSchema, { nullable: colConf.nullable }, "      ");
        } else if("oneOf" in colConf){
          if(!colConf.oneOf) throw "colConf.oneOf missing"
          const types = colConf.oneOf.map(t => typeof t === "number"? t : JSON.stringify(t));
          if(colConf.nullable){
            types.unshift("null")
          }
          type = types.join(" | ");
        }
      }
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

type DBTableHandlersFromSchema<Schema = void> = Schema extends DBSchema? { 
  [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true? 
    ViewHandler<Schema[tov_name]["columns"]> : 
    TableHandler<Schema[tov_name]["columns"]>
} : Record<string, TableHandler>;

export type DBOFullyTyped<Schema = void> = Schema extends DBSchema? (
    DBTableHandlersFromSchema<Schema> & Pick<DBHandlerServer<DBTableHandlersFromSchema<Schema>>, "tx" | "sql">
  ) : 
  DBHandlerServer;


  

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
  ddb.dwad.insert!;
  ddb.dwad.delete!;

  const d: DBOFullyTyped<undefined> = 1 as any;
  d.dwad.insert!;
  d.dwad.delete!;

  const p: PublishParams = 1 as any;
  p.dbo.dwad.insert!;
  ddb.dwad.delete!;

  prostgles({
    dbConnection: 1 as any,
    publish: async (params) => {
      const row = await params.dbo.dwadwa.find?.({});
      
      return "*" as "*"
    },
    onReady: (dbo) => {
      dbo.tdwa.find!()
    }
  });


  const auth: Auth = {
    sidKeyName: "sid_token",
    getUser: async (sid, db, _db) => {
      db.dwadaw.find;
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
  const test: DBSchema = c;
  const dbt: DBOFullyTyped<S> = 1 as any;

  dbt.tx!(t => {
    t.tbl1.delete();
  });

  const db: DBHandlerServer = 1 as any;
  db.tx!(t => {
    t.wadwa.find!()
  });
  
  const publish = (): PublishFullyTyped<S> => {
    const r = {
      tbl1: {
        select: {
          fields: "*" as "*", 
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
          filterFields: "*" as "*",
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
          filterFields: "*" as "*",
          forcedFilter: { col1: 2 }
        }
      }
    }
    const res1: PublishFullyTyped = r
  
    const p: PublishParams<undefined> = 1 as any;
  
    p.dbo.dwadaw.find!();
  
    return res;
  }
})
