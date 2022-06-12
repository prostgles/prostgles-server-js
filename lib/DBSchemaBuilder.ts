import { DBSchemaColumns, DBSchemaInsertColumns, DBSchema, TableHandler, ViewHandler } from "prostgles-types";
import { DBHandlerServer, DboBuilder, escapeTSNames, postgresToTsType } from "./DboBuilder";
import { PublishAllOrNothing, PublishParams, PublishTableRule, PublishViewRule, TableRule, ViewRule } from "./PublishParser";


export const getDBSchema = (dboBuilder: DboBuilder): string => {
  let tables: string[] = [];

  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
    const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
tables.push(`${escapeTSNames(tov.name)}: {
    is_view: ${tov.is_view};
    select: ${tov.privileges.select}
    insert: ${tov.privileges.insert}
    update: ${tov.privileges.update}
    delete: ${tov.privileges.delete}
    dataTypes: { ${cols.map(c => `${escapeTSNames(c.name)}: ${postgresToTsType(c.udt_name)}${c.is_nullable? " | null" : ""}`).join("; ")} };
    columns: {${cols.map(c => `
      ${escapeTSNames(c.name)}: { type: ${postgresToTsType(c.udt_name)}; is_nullable: ${c.is_nullable}; is_nullable_or_has_default: ${c.is_nullable || c.has_default}; }`).join(";\n")}
    }
  };\n  `)
  })
return `
type DBSchema = {
  ${tables.join("")}
}
`;
}

const ccc: DBSchemaInsertColumns<{ col1: { type: string; }; col2: { type: number; is_nullable_or_has_default: true } }> = {
  col1: "",
  col2: 22
}



export type DBOFullyTyped<Schema extends DBSchema | undefined = undefined> = Schema extends DBSchema? (
    { 
      [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true? 
        ViewHandler<DBSchemaColumns<Schema[tov_name]["columns"]>> : 
        TableHandler<DBSchemaColumns<Schema[tov_name]["columns"]>>
    } & Pick<DBHandlerServer, "tx" | "sql">
  ) : 
  DBHandlerServer;

/** Type checks */
(() => {
  const ddb: DBOFullyTyped = 1 as any;
  ddb.dwad.insert!;
  ddb.dwad.delete!;

  const p: PublishParams = 1 as any;
  p.dbo.dwad.insert!;
  ddb.dwad.delete!;
})

type S = {
  tbl1: {
    dataTypes: {type: string;};
    columns: {
      col1: { type: number | null;}
      col2: { type: string; }
    }
  },
  tbl2: {
    dataTypes: {type: string;};
    columns: {
      col1: { type: number | null;}
      col2: { type: string; }
    }
  }
}

/** Test the created schema */
const c: S = 1 as any;
const test: DBSchema = c;
const db: DBOFullyTyped<S> = 1 as any;


export type PublishFullyTyped<Schema extends DBSchema | undefined = undefined> = Schema extends DBSchema? { 
  [tov_name in keyof Partial<Schema>]: PublishAllOrNothing | (Schema[tov_name]["is_view"] extends true? PublishViewRule<Schema[tov_name]> : PublishTableRule<Schema[tov_name]>);
} : (PublishAllOrNothing | Record<string, PublishViewRule | PublishTableRule>);


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
      delete: {forcedFilter: {col1: 2}}
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
        filterFields: {col1: 1}
      }
    },
    tbl2: {
      delete: {forcedFilter: {col1: 2}}
    }
  }
  const res1: PublishFullyTyped = r

  // const res2: PublishFullyTyped = res;

  return res;
}