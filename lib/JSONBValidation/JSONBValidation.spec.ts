import { test, describe } from "node:test";
import type { JSONB } from "prostgles-types";
import { strict as assert } from "assert";
import { getJSONBObjectSchemaValidationError } from "./JSONBValidation";

void describe("JSONBValidation", async () => {
  await test("getJSONBObjectSchemaValidationError", () => {
    const schema: JSONB.ObjectType = {
      type: {
        name: "string",
        age: { type: "integer", nullable: true },
        address: {
          type: {
            street: "string",
            city: "string",
            street_number: { type: "integer", optional: true },
            t: { enum: ["a", "b", "c"], optional: true },
          },
        },
      },
    };
    const obj = {
      name: "John Doe",
      age: 30,
      address: {
        street: "123 Main St",
        city: "New York",
      },
    };
    assert.deepStrictEqual(getJSONBObjectSchemaValidationError(schema.type, null, "test"), {
      error: "Expecting test to be an object",
    });
    assert.deepStrictEqual(getJSONBObjectSchemaValidationError(schema.type, {}, "test"), {
      error: "name is of invalid type. Expecting string",
    });
    assert.deepStrictEqual(getJSONBObjectSchemaValidationError(schema.type, obj, "test"), {
      data: obj,
    });
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(schema.type, { ...obj, age: null }, "test"),
      {
        data: { ...obj, age: null },
      }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(schema.type, { ...obj, age: 22.2 }, "test"),
      {
        error: "age is of invalid type. Expecting null | integer",
      }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        schema.type,
        { ...obj, address: { ...obj.address, city: 22 } },
        "test"
      ),
      {
        error: "address.city is of invalid type. Expecting string",
      }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        schema.type,
        { ...obj, address: { ...obj.address, street_number: 22.22 } },
        "test"
      ),
      { error: "address.street_number is of invalid type. Expecting undefined | integer" }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        schema.type,
        { ...obj, address: { ...obj.address, street_number: undefined } },
        "test"
      ),
      { data: { ...obj, address: { ...obj.address, street_number: undefined } } }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        schema.type,
        { ...obj, address: { ...obj.address, t: "c" } },
        "test"
      ),
      { data: { ...obj, address: { ...obj.address, t: "c" } } }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        schema.type,
        { ...obj, address: { ...obj.address, t: 2 } },
        "test"
      ),
      { error: 'address.t is of invalid type. Expecting undefined | "a" | "b" | "c"' }
    );
  });
  await test("getJSONBObjectSchemaValidationError oneOf record", () => {
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        {
          d: { record: { keysEnum: ["a", "b"], values: "boolean" } },
          o: { optional: true, oneOf: ["number", "string[]"] },
        },
        { d: { a: true, b: 1 } },
        "test"
      ),
      { error: "d.b is of invalid type. Expecting boolean" }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        {
          d: { record: { keysEnum: ["a", "b"], values: "boolean" } },
          o: { optional: true, oneOf: ["number", "string[]"] },
        },
        { d: { a: true, b: true }, o: false },
        "test"
      ),
      { error: "o is of invalid type. Expecting undefined | number | string[]" }
    );
    assert.deepStrictEqual(
      getJSONBObjectSchemaValidationError(
        {
          d: { record: { keysEnum: ["a", "b"], values: "boolean" } },
          o: { optional: true, oneOf: ["number", "string[]"] },
        },
        { d: { a: true, b: true }, o: ["str"] },
        "test"
      ),
      { data: { d: { a: true, b: true }, o: ["str"] } }
    );
  });
});
