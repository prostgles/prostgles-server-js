import assert from "node:assert";
import { describe, test } from "node:test";
import type { AuthResultWithSID } from "../AuthTypes";
import { getSessionUser } from "./getSessionUser";

void describe("getSessionUser", async () => {
  await test("includes selected session field values and always includes id and type", () => {
    const clientInfo = {
      sid: "sid",
      user: {
        id: "user-1",
        type: "admin",
        tenant_id: 42,
        secret: "hidden",
      },
      clientUser: { id: "user-1", type: "admin" },
      sessionFields: ["tenant_id"],
    } as AuthResultWithSID;

    assert.deepEqual(getSessionUser(clientInfo), {
      tenant_id: 42,
      id: "user-1",
      type: "admin",
    });
  });

  await test("supports exclusion field filters", () => {
    const clientInfo = {
      sid: "sid",
      user: { id: "user-1", type: "admin", tenant_id: 42, secret: "hidden" },
      clientUser: { id: "user-1", type: "admin" },
      sessionFields: { secret: false },
    } as AuthResultWithSID;

    assert.deepEqual(getSessionUser(clientInfo), {
      id: "user-1",
      type: "admin",
      tenant_id: 42,
    });
  });
});
