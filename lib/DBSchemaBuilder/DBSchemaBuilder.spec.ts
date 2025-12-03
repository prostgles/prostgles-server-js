import { describe, test } from "node:test";
import type { DBOFullyTyped, PublishFullyTyped } from "./DBSchemaBuilder";
import type { PublishParams } from "../PublishParser/publishTypesAndUtils";
import prostgles from "..";
import type { AuthConfig } from "../Auth/AuthTypes";
import type { DBSchema } from "prostgles-types";
import type { DBHandlerServer } from "../Prostgles";

void describe("DBSchemaBuilder type tests", async () => {
  await test("Type checks", () => {
    /** Type checks */
    () => {
      const ddb = {} as DBOFullyTyped;
      ddb.dwad?.insert;
      ddb.dwad?.delete;

      const d = {} as DBOFullyTyped<undefined>;
      d.dwad?.insert;
      d.dwad?.delete;

      const p = {} as PublishParams;
      p.dbo.dwad?.insert;
      ddb.dwad?.delete;

      //@ts-ignore
      void prostgles({
        dbConnection: "",
        publish: async (params) => {
          const _rows = await params.dbo.dwadwa?.find?.({});

          return "*" as const;
        },
        transactions: true,
        onReady: ({ dbo }) => {
          void dbo.tdwa?.find!();
          void dbo.tx((t) => {
            void t.dwa?.find!();
          });
        },
      });

      const _auth: AuthConfig = {
        sidKeyName: "sid_token",
        getUser: (sid, db, _db) => {
          db.dwadaw?.find;
          return {};
        },
      };

      type S = {
        tbl1: {
          columns: {
            col1: number | null;
            col2: string;
          };
        };
        tbl2: {
          columns: {
            col1: number | null;
            col2: string;
          };
        };
      };

      /** Test the created schema */
      const c = {} as S;
      const _test: DBSchema = c;
      const dbt = {} as DBOFullyTyped<S>;

      void dbt.tx((t) => {
        void t.tbl1.delete();
      });

      const db = {} as DBHandlerServer;
      void db.tx!((t) => {
        void t.wadwa?.find!();
      });

      const _publish = (): PublishFullyTyped<S> => {
        const r = {
          tbl1: {
            select: {
              fields: "*" as const,
              forcedFilter: { col1: 32, col2: "" },
            },
            getColumns: true,
            getInfo: true,
            delete: {
              filterFields: { col1: 1 },
            },
          },
          tbl2: {
            delete: {
              filterFields: "*" as const,
              forcedFilter: { col1: 2 },
            },
          },
        };
        const res: PublishFullyTyped<S> = {
          tbl1: {
            select: {
              fields: "*",
              forcedFilter: { col1: 32, col2: "" },
            },
            getColumns: true,
            getInfo: true,
            delete: {
              filterFields: { col1: 1 },
            },
          },
          tbl2: {
            delete: {
              filterFields: "*" as const,
              forcedFilter: { col1: 2 },
            },
          },
        };
        const _res1: PublishFullyTyped = r;

        const p = {} as PublishParams<undefined>;

        void p.dbo.dwadaw?.find?.();

        return res;
      };
    };
  });
});
