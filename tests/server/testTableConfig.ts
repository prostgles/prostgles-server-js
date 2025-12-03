import type { TableConfig } from "prostgles-server/dist/TableConfig/TableConfig";

export const testTableConfig: TableConfig<{ en: 1; fr: 1 }> = {
  tr2: {
    // dropIfExists: true,
    columns: {
      t1: {
        label: { fr: "fr_t1" },
        info: { hint: "hint...", min: "a", max: "b" },
      },
      t2: { label: { en: "en_t2" } },
    },
    triggers: {
      atLeastOneA: {
        actions: ["delete", "update"],
        forEach: "statement",
        type: "after",
        query: `
          DECLARE
          x_rec record;
          BEGIN

            IF NOT EXISTS(SELECT * FROM tr2 WHERE t1 = 'a' AND t2 = 'b') THEN
              RAISE EXCEPTION 'Must have at least one row with t1 = a AND t2 = b';
            END IF;

            RETURN NULL;
          END;
        `,
      },
    },
  },
  users_public_info: {
    // dropIfExists: true,
    columns: {
      id: "SERIAL PRIMARY KEY",
      name: "TEXT",
      // avatar: `UUID REFERENCES media ON DELETE CASCADE`
      avatar: `UUID`,
      sid: `TEXT`,
    },
  },
  users: {
    dropIfExists: true,
    columns: {
      id: { sqlDefinition: `SERIAL PRIMARY KEY ` },
      email: { sqlDefinition: `TEXT NOT NULL` },
      status: { enum: ["active", "disabled", "pending"] },
      preferences: {
        jsonbSchemaType: {
          showIntro: { type: "boolean", optional: true },
          theme: { enum: ["light", "dark", "auto"], optional: true },
          others: { type: "any[]" },
        },
      },
    },
  },
  tjson: {
    dropIfExists: true,
    columns: {
      json: {
        jsonbSchemaType: {
          a: { type: "boolean" },
          arr: { enum: ["1", "2", "3"] },
          arr1: { enum: [1, 2, 3] },
          arr2: { type: "integer[]" },
          arrStr: { type: "string[]", optional: true, nullable: true },
          o: {
            optional: true,
            nullable: true,
            oneOfType: [{ o1: "integer" }, { o2: "boolean" }],
          },
        },
      },
      colOneOf: { enum: ["a", "b", "c"] },
      status: {
        nullable: true,
        jsonbSchema: {
          oneOfType: [
            { ok: { type: "string" } },
            { err: { type: "string" } },
            {
              loading: {
                type: {
                  loaded: { type: "number" },
                  total: { type: "number" },
                },
              },
            },
          ],
        },
      },
      jsonOneOf: {
        nullable: true,
        jsonbSchema: {
          oneOfType: [
            { command: { enum: ["a"] } },
            {
              command: { enum: ["b"] },
              option: { type: "integer[]" },
            },
          ],
        },
      },
      table_config: {
        nullable: true,
        jsonbSchemaType: {
          referencedTables: {
            optional: true,
            arrayOfType: { name: "string", minFiles: "number" },
          },
          recType: {
            nullable: true,
            optional: true,
            record: {
              keysEnum: ["a", "b"],
              values: { type: { bools: "boolean[]" } },
            },
          },
        },
      },
    },
  },
  lookup_col1: {
    dropIfExistsCascade: true,
    isLookupTable: {
      values: {
        a: { description: "desc" },
        b: {},
      },
    },
  },
  uuid_text: {
    columns: {
      id: "UUID",
      col1: {
        nullable: true,
        references: {
          tableName: "lookup_col1",
        },
      },
      col2: {
        nullable: true,
        references: {
          tableName: "lookup_col1",
        },
      },
      col3: {
        sqlDefinition: "TEXT REFERENCES lookup_col1",
      },
    },
  },
  api_table: {
    dropIfExists: true,
    columns: {
      id: "SERIAL PRIMARY KEY",
    },
    onMount: async ({ _db, dbo }) => {
      await _db.any(`ALTER TABLE api_table ADD COLUMN col1 TEXT`);
    },
  },
  rec_ref: {
    columns: {
      id: "SERIAL PRIMARY KEY",
    },
  },
  rec: {
    columns: {
      id: "SERIAL PRIMARY KEY",
      parent_id: "INTEGER REFERENCES rec",
      recf: "INTEGER REFERENCES rec_ref",
    },
  },
};
