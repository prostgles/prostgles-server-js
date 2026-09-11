import { test } from "node:test";
import { strict as assert } from "node:assert";
import { getDBGeneratedSchema } from "prostgles-server/dist/DBSchemaBuilder/getDBGeneratedSchema";
import type { TableConfig } from "prostgles-server/dist/TableConfig/TableConfigTypes";
import type { DBHandlerServer } from "prostgles-server";
import { testTableConfig } from "./testTableConfig";

export const testSchemaTypes = async (db: DBHandlerServer) => {
  await test("lookup types propagate through database references while preserving overrides", () => {
    const tablesOrViews = db.uuid_text.dboBuilder.getSchema();
    const lookupType = 'null | "a" | "b"';
    const cases = [
      ["TEXT REFERENCES lookup_col1", lookupType],
      [undefined, lookupType],
      [{}, lookupType],
      [{ sqlDefinition: "TEXT REFERENCES lookup_col1" }, lookupType],
      [{ references: { tableName: "lookup_col1" } }, lookupType],
      [{ enum: ["a"] }, 'null | "a"'],
      [{ jsonbSchema: { type: "boolean" } }, "boolean"],
      [{ jsonbSchemaType: "boolean" }, "boolean"],
    ] as const;
    for (const [colConf, expected] of cases) {
      const config: TableConfig = {
        lookup_col1: testTableConfig.lookup_col1,
        ...(colConf !== undefined && {
          uuid_text: { columns: { col3: colConf } },
        }),
      };
      const schema = getDBGeneratedSchema({ config, tablesOrViews });
      assert.equal(
        schema
          .split("\n")
          .find((line) => line.trim().startsWith("col3?:"))
          ?.trim(),
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
    const { tablesOrViews } = await db.uuid_text.dboBuilder.getTsDefinitions({
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
    const config: TableConfig = { lookup_col1: testTableConfig.lookup_col1 };
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
