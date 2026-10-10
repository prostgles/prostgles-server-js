import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getDBGeneratedSchema } from "prostgles-server/dist/DBSchemaBuilder/getDBGeneratedSchema";
import type { TableConfig } from "prostgles-server/dist/TableConfig/TableConfigTypes";
import type { DBHandlerServerInternal } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import type { TableRowFromColumnDefinitions } from "prostgles-server/dist/TableConfig/TableRowFromColumnDefinitions";
import { testTableConfig } from "./testTableConfig";

export const testSchemaTypes = async (db: DBHandlerServerInternal, pgDb: DB) => {
  await test("server function return types preserve generated schema references", async () => {
    const { tsSchema } = await db.items!.dboBuilder.getTsDefinitions();
    const arrayReference = 'NonNullable<DBSchema["tjson"]["table_config"]>["referencedTables"]';
    const elementReference = `NonNullable<${arrayReference}>[number]`;
    const expectedTypes = {
      myfunc: "number",
      myfuncWithBadReturn: "string",
      scalarResult: "number",
      recursiveResult: "{ value: string; next?: unknown }",
      unrelatedSchema: "{ other: string }",
      schemaResult:
        '(undefined | { rows: Array<DBSchema["users"]>; inserts: Array<DBSchemaForInsert["users"]>; selection: Pick<DBSchema["users"], ("id" | "preferences")>; preferences: DBSchema["users"]["preferences"]; optional: Partial<DBSchema["users"]>; unrelated: { nested: { enabled: boolean } }; tags: Array<string>; created: Date })',
      schemaArray: arrayReference,
      schemaArrayElement: elementReference,
      schemaNestedField: `{ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: ${elementReference} } } } } } } } } } } }`,
      sampleSchemas:
        'Array<(({ name: string; path: string } & { type: "sql"; file: string }) | ({ name: string; path: string } & { type: "dir"; workspaceConfig?: (undefined | { workspaces: Array<{ options?: (undefined | { hideCounts?: (undefined | false | true); tableListEndInfo?: (undefined | "count" | "size" | "none") }) }> }) }))>',
    };
    for (const [name, returnType] of Object.entries(expectedTypes)) {
      const definition = tsSchema.split("\n").find((line) => line.includes(`"${name}":`));
      assert.ok(definition?.endsWith(`=> Promise<${returnType}>;`), definition ?? name);
    }
  });

  await test("column definition row types support SQL aliases, arrays and generated columns", async () => {
    const columns = {
      int: "INT NOT NULL",
      int2: "int2 not null",
      int4: "  InT4\tNoT\nNuLl  ",
      int8: "INT8 NOT NULL",
      smallint: "SMALLINT NOT NULL",
      integer: "INTEGER NOT NULL",
      bigint: "BIGINT NOT NULL",
      real: "REAL NOT NULL",
      float: "FLOAT(24) NOT NULL",
      float4: "FLOAT4 NOT NULL",
      float8: "FLOAT8 NOT NULL",
      double: "DOUBLE  PRECISION NOT NULL",
      numeric: "NUMERIC(8, 2) NOT NULL",
      decimal: "DECIMAL NOT NULL",
      dec: "DEC NOT NULL",
      bool: "bool not null",
      boolean: "BOOLEAN NOT NULL",
      json: "JSON NOT NULL",
      jsonb: "JSONB NOT NULL",
      bytes: "bytea not null",
      ints: "INT[] NOT NULL",
      matrix: "INTEGER[2][2] NOT NULL",
      bools: "BOOLEAN ARRAY NOT NULL",
      decimals: "NUMERIC(8, 2) ARRAY[2] NOT NULL",
      words: "VARCHAR(20)[] NOT NULL",
      nullable: "INT",
      smallserial: "smallserial",
      serial2: "SERIAL2",
      serial: "serial",
      serial4: "SERIAL4",
      bigserial: "BIGSERIAL",
      serial8: "SERIAL8",
      identity: "int generated always as identity primary key",
      generated: "int generated always as (int + 1) stored",
      defaulted: "int default 42",
      quoted: "text check (quoted <> 'DEFAULT SERIAL NOT NULL')",
    } as const;
    type Row = TableRowFromColumnDefinitions<typeof columns>;
    const row: Row = {
      int: 1,
      int2: 2,
      int4: 4,
      int8: 8,
      smallint: 2,
      integer: 4,
      bigint: 8,
      real: 1.5,
      float: 1.5,
      float4: 1.5,
      float8: 1.5,
      double: 1.5,
      numeric: 1.25,
      decimal: 1.25,
      dec: 1.25,
      bool: true,
      boolean: false,
      json: { a: 1 },
      jsonb: { b: 2 },
      bytes: Buffer.from("hello"),
      ints: [1, null, 3],
      matrix: [
        [1, 2],
        [3, 4],
      ],
      bools: [true, false],
      decimals: [1.25, null],
      words: ["a", "b"],
      nullable: null,
      quoted: "ok",
    };
    // @ts-expect-error INT columns must reject strings.
    const invalidInt: Row["int"] = "1";
    // @ts-expect-error BOOL columns must reject strings.
    const invalidBool: Row["bool"] = "true";
    // @ts-expect-error Array columns must reject scalars.
    const invalidArray: Row["ints"] = 1;
    // @ts-expect-error Quoted keywords must not make a column optional.
    const missingQuoted: Pick<Row, "quoted"> = {};
    const serial8: Row["serial8"] = "1";
    const customType: TableRowFromColumnDefinitions<{ value: "integer_custom NOT NULL" }> = {
      value: "text",
    };
    const interval: TableRowFromColumnDefinitions<{ value: "INTERVAL NOT NULL" }> = {
      value: "1 day",
    };
    void [invalidInt, invalidBool, invalidArray, missingQuoted, serial8, customType, interval];

    await pgDb.tx(async (tx) => {
      await tx.none(`CREATE TEMP TABLE column_definition_types (
        ${Object.entries(columns)
          .map(([name, definition]) => `"${name}" ${definition}`)
          .join(",\n")}
      ) ON COMMIT DROP`);
      const keys = Object.keys(row);
      const result = await tx.one(
        `INSERT INTO column_definition_types (
        ${keys.map((key) => `"${key}"`).join(", ")}
      ) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
        Object.values(row),
      );
      assert.deepEqual(result, {
        ...row,
        int8: "8",
        bigint: "8",
        numeric: "1.25",
        decimal: "1.25",
        dec: "1.25",
        smallserial: 1,
        serial2: 1,
        serial: 1,
        serial4: 1,
        bigserial: "1",
        serial8: "1",
        identity: 1,
        generated: 2,
        defaulted: 42,
      });
    });
  });

  await test("lookup types propagate through database references while preserving overrides", () => {
    const tablesOrViews = db.uuid_text!.dboBuilder.getSchema();
    const lookupType = 'null | "a" | "b"';
    const cases = [
      ["TEXT REFERENCES lookup_col1", lookupType],
      [undefined, lookupType],
      [{}, lookupType],
      [{ sqlDefinition: "TEXT REFERENCES lookup_col1" }, lookupType],
      [{ references: { tableName: "lookup_col1" } }, lookupType],
      [{ enum: ["a"] }, 'null | "a"'],
      [{ jsonbSchema: { type: "boolean" } }, "boolean"],
      [{ jsonbSchemaType: { value: "boolean" } }, "{ value: boolean; };"],
    ] as const;
    for (const [colConf, expected] of cases) {
      const config: TableConfig = {
        lookup_col1: testTableConfig.lookup_col1!,
        ...(colConf !== undefined && {
          uuid_text: { columns: { col3: colConf } },
        }),
      };
      const schema = getDBGeneratedSchema({ config, tablesOrViews });
      assert.equal(
        schema
          .split("\n")
          .find((line) => line.trim().startsWith("col3?:"))
          ?.trim()
          .replace(/\s+/g, " "),
        `col3?: ${expected}`,
        JSON.stringify(colConf),
      );
      assert(schema.includes('col1?: null | "a" | "b"'));
      assert(schema.includes('id: "a" | "b"'));
    }
    const schema = getDBGeneratedSchema({ config: undefined, tablesOrViews });
    assert(schema.includes("col3?: null | string;"));
  });

  await test("lookup types follow FK chains by column and terminate cycles", async () => {
    const { tablesOrViews } = await db.uuid_text!.dboBuilder.getTsDefinitions({
      ddlWithRollback: `
        CREATE TABLE lookup_chain_bridge (
          lookup_key TEXT PRIMARY KEY REFERENCES lookup_col1,
          unrelated TEXT UNIQUE,
          UNIQUE (unrelated, lookup_key)
        );
        CREATE TABLE lookup_chain_middle (
          renamed_key TEXT PRIMARY KEY REFERENCES lookup_chain_bridge(lookup_key)
        );
        CREATE TABLE lookup_chain_cycle_a (id TEXT PRIMARY KEY);
        CREATE TABLE lookup_chain_cycle_b (id TEXT PRIMARY KEY REFERENCES lookup_chain_cycle_a);
        ALTER TABLE lookup_chain_cycle_a ADD FOREIGN KEY (id) REFERENCES lookup_chain_cycle_b;
        ALTER TABLE lookup_chain_cycle_a ADD FOREIGN KEY (id) REFERENCES lookup_col1;
        CREATE TABLE lookup_chain_self (id TEXT PRIMARY KEY REFERENCES lookup_chain_self);
        CREATE TABLE lookup_chain_leaf (
          chain_required TEXT NOT NULL REFERENCES lookup_chain_middle(renamed_key),
          chain_nullable TEXT REFERENCES lookup_chain_middle(renamed_key),
          chain_unrelated TEXT REFERENCES lookup_chain_bridge(unrelated),
          compound_unrelated TEXT,
          compound_lookup TEXT,
          FOREIGN KEY (compound_unrelated, compound_lookup)
            REFERENCES lookup_chain_bridge(unrelated, lookup_key),
          cycle_lookup TEXT REFERENCES lookup_chain_cycle_a,
          cycle_plain TEXT REFERENCES lookup_chain_self
        );
      `,
    });
    const config: TableConfig = { lookup_col1: testTableConfig.lookup_col1! };
    const schema = getDBGeneratedSchema({ config, tablesOrViews });
    const lines = schema.split("\n").map((line) => line.trim());
    for (const definition of [
      'chain_required: "a" | "b"',
      'chain_nullable?: null | "a" | "b"',
      'compound_lookup?: null | "a" | "b"',
      'cycle_lookup?: null | "a" | "b"',
      "chain_unrelated?: null | string;",
      "compound_unrelated?: null | string;",
      "cycle_plain?: null | string;",
    ]) {
      assert(lines.includes(definition), definition);
    }

    config.lookup_chain_leaf = {
      columns: {
        chain_required: { enum: ["a"] },
        chain_nullable: {
          references: { tableName: "lookup_chain_middle", columnName: "renamed_key" },
        },
      },
    };
    const overriddenSchema = getDBGeneratedSchema({ config, tablesOrViews });
    const overriddenLines = overriddenSchema.split("\n").map((line) => line.trim());
    assert(overriddenLines.includes('chain_required: "a"'));
    assert(overriddenLines.includes('chain_nullable?: null | "a" | "b"'));
  });
};
