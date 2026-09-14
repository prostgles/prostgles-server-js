import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { once } from "node:events";
import express from "express";
import type { DB, DBHandlerServer } from "prostgles-server";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import type { CloudStorageClient } from "prostgles-server/dist/StorageClient/StorageClientTypes";
import { setupFileServeHandler } from "prostgles-server/dist/StorageClient/setupFileServeHandler";
import { getFileStorageKey } from "prostgles-server/dist/StorageClient/getFileStorageKey";
import { deleteUnreferencedFile } from "prostgles-server/dist/StorageClient/deleteUnreferencedFile";

export const testFileStorage = async (dbo: DBHandlerServer, db: DB) => {
  await test("Managed storage permission and transaction safety", async (t) => {
    const files = dbo.files as TableHandler;
    const config = files.dboBuilder.prostgles.opts.fileTable!;
    const storage = config.storageClient;
    assert.equal(storage.type, "local");
    if (storage.type !== "local") throw new Error("Expected local test storage");
    const folder = storage.localFolderPath;
    const upload = storage.upload;
    const remove = storage.delete;
    let failUpload = false;
    let failDelete = false;
    let uploads = 0;
    storage.upload = async (args) => {
      uploads++;
      const result = await upload(args);
      if (failUpload) throw new Error("simulated upload failure");
      return result;
    };
    storage.delete = async (key) => {
      if (failDelete) throw new Error("simulated delete failure");
      await remove(key);
    };
    const fileData = (value: string) => ({
      data: Buffer.from(value),
      original_name: `${value}.txt`,
    });
    const list = () => fs.readdirSync(folder).sort();
    const read = (row: { id: string; storage_key: string | null }) =>
      fs.readFileSync(join(folder, getFileStorageKey(row)), "utf8");
    const fileVersions = dbo.files_versions as TableHandler;
    const versions = (fileId: string) =>
      fileVersions.find(
        { file_id: fileId },
        {
          select: { version: 1, storage_key: 1 },
          orderBy: "version",
          limit: null,
        },
      ) as Promise<{ version: number; storage_key: string }[]>;
    const hooks = files.dboBuilder.prostgles.opts.tableHooks!.files!;
    const originalHooks = hooks.afterEach;
    hooks.afterEach = [
      ...(originalHooks ?? []),
      {
        commands: { insert: 1, update: 1 },
        validate: async ({ row }) => {
          if (row.original_name === "reject.txt") throw new Error("file hook rejected");
        },
      },
    ];
    let original = await files.insert(fileData("original"), { returning: "*" });
    try {
      await t.test("legacy ID-based files remain readable and replaceable", async () => {
        fs.renameSync(join(folder, original.storage_key), join(folder, original.id));
        await db.none("UPDATE files SET storage_key = NULL WHERE id = $1", [original.id]);
        await fileVersions.update({ file_id: original.id }, { storage_key: original.id });
        const response = await fetch(`http://127.0.0.1:3001/files/${original.id}`, {
          headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
        });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "original");
        await files.update({ id: original.id }, fileData("updated"));
        original = await files.findOne({ id: original.id });
        assert.equal(read(original), "updated");
        assert.equal(fs.existsSync(join(folder, original.id)), true);
        assert.deepEqual(
          (await versions(original.id)).map(({ version }) => version),
          [1, 2],
        );
        const previous = await fetch(`http://127.0.0.1:3001/files/${original.id}?version=1`, {
          headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
        });
        assert.equal(previous.status, 200);
        assert.equal(await previous.text(), "original");
        const updated = await fetch(`http://127.0.0.1:3001/files/${original.id}`, {
          headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
        });
        assert.equal(updated.status, 200);
        assert.equal(await updated.text(), "updated");
      });

      await t.test("filtered updates and failed validation preserve storage", async () => {
        const count = uploads;
        const rules = {
          update: {
            fields: "*",
            filterFields: "*",
            returningFields: "*",
            forcedFilter: { id: { $ne: original.id } },
          },
        } as const;
        assert.deepEqual(
          await files.update({ id: original.id }, fileData("forbidden"), { returning: "*" }, rules),
          [],
        );
        assert.equal(uploads, count);
        const before = list();
        await assert.rejects(() =>
          files.update({ id: original.id }, fileData("forbidden"), undefined, {
            update: {
              fields: ["original_name"],
              filterFields: "*",
              returningFields: "*",
            },
          }),
        );
        assert.equal(uploads, count + 1);
        assert.deepEqual(list(), before);
        assert.deepEqual(await files.findOne({ id: original.id }), original);
        assert.equal(read(original), "updated");
      });

      await t.test(
        "failed uploads and application hooks leave no replacement objects",
        async () => {
          const before = list();
          failUpload = true;
          await assert.rejects(() => files.update({ id: original.id }, fileData("failed")));
          failUpload = false;
          await assert.rejects(() => files.update({ id: original.id }, fileData("reject")));
          await assert.rejects(() => files.insert(fileData("reject")));
          await assert.rejects(() =>
            files.update({ id: original.id }, fileData("check-filter"), undefined, {
              update: {
                fields: "*",
                filterFields: "*",
                returningFields: "*",
                checkFilter: { original_name: "allowed.txt" },
              },
            }),
          );
          assert.deepEqual(await files.findOne({ id: original.id }), original);
          assert.equal(read(original), "updated");
          assert.deepEqual(list(), before);
        },
      );

      await t.test(
        "duplicate IDs, conflict updates and SQL-only requests cannot overwrite",
        async () => {
          const before = list();
          await assert.rejects(() => files.insert({ ...fileData("duplicate"), id: original.id }));
          const count = uploads;
          await assert.rejects(() =>
            files.insert({ ...fileData("conflict"), id: original.id }, { onConflict: "DoUpdate" }),
          );
          await assert.rejects(() =>
            files.insert(fileData("statement"), { returnType: "statement" }),
          );
          await assert.rejects(() =>
            files.update({ id: original.id }, fileData("statement"), {
              returnType: "statement",
            }),
          );
          assert.equal(uploads, count);
          await files.insert(
            { ...fileData("ignored"), id: original.id },
            { onConflict: "DoNothing" },
          );
          assert.deepEqual(list(), before);
          assert.equal(read(original), "updated");
        },
      );

      await t.test("PostgreSQL update policies are enforced before uploading", async () => {
        await db.none(`
          CREATE ROLE storage_rls_test;
          GRANT USAGE ON SCHEMA public TO storage_rls_test;
          GRANT SELECT, UPDATE ON files TO storage_rls_test;
          ALTER TABLE files ENABLE ROW LEVEL SECURITY;
          CREATE POLICY storage_select ON files FOR SELECT TO storage_rls_test USING (true);
          CREATE POLICY storage_update ON files FOR UPDATE TO storage_rls_test USING (false);
        `);
        try {
          const count = uploads;
          const rows = await files.dboBuilder.getTX(async (tx, pgTx) => {
            await pgTx.none("SET LOCAL ROLE storage_rls_test");
            return tx.files!.update({ id: original.id }, fileData("forbidden"), { returning: "*" });
          });
          assert.deepEqual(rows, []);
          assert.equal(uploads, count);
          assert.equal(read(original), "updated");
        } finally {
          await db.none(`
            DROP POLICY storage_select ON files;
            DROP POLICY storage_update ON files;
            ALTER TABLE files DISABLE ROW LEVEL SECURITY;
            REVOKE SELECT, UPDATE ON files FROM storage_rls_test;
            REVOKE USAGE ON SCHEMA public FROM storage_rls_test;
            DROP ROLE storage_rls_test;
          `);
        }
      });

      await t.test("RLS-hidden references fail closed during storage cleanup", async () => {
        const role = "storage_cleanup_rls_test";
        await db.none(`
          CREATE ROLE ${role};
          GRANT USAGE ON SCHEMA public TO ${role};
          GRANT SELECT ON files, files_versions TO ${role};
          ALTER TABLE files ENABLE ROW LEVEL SECURITY;
          ALTER TABLE files_versions ENABLE ROW LEVEL SECURITY;
          CREATE POLICY storage_cleanup_files ON files TO ${role} USING (false);
          CREATE POLICY storage_cleanup_versions ON files_versions TO ${role} USING (false);
        `);
        const rlsDb = {
          tx: (callback: (tx: DB) => unknown) =>
            db.tx(async (tx) => {
              await tx.none(`SET LOCAL ROLE ${role}`);
              return callback(tx as unknown as DB);
            }),
        } as unknown as DB;
        try {
          await assert.rejects(
            deleteUnreferencedFile(rlsDb, config, original.storage_key),
            /row-level security policy/,
          );
          assert.equal(fs.existsSync(join(folder, original.storage_key)), true);
        } finally {
          await db.none(`
            DROP POLICY storage_cleanup_files ON files;
            DROP POLICY storage_cleanup_versions ON files_versions;
            ALTER TABLE files DISABLE ROW LEVEL SECURITY;
            ALTER TABLE files_versions DISABLE ROW LEVEL SECURITY;
            REVOKE SELECT ON files, files_versions FROM ${role};
            REVOKE USAGE ON SCHEMA public FROM ${role};
            DROP ROLE ${role};
          `);
        }
      });

      await t.test("beforeEach lifecycle callbacks follow the outer transaction", async () => {
        const beforeHooks = hooks.beforeEach;
        const events: string[] = [];
        hooks.beforeEach = [
          ...(beforeHooks ?? []),
          {
            commands: { insert: 1 },
            validate: ({ data, onCommit, onRollback }) => {
              onCommit(async ({ db: committedDb }) => {
                assert.equal(committedDb, db);
                assert.ok(
                  await committedDb.oneOrNone("SELECT id FROM files WHERE id = $1", [data.id]),
                );
                events.push("commit");
              });
              onRollback(async ({ db: rolledBackDb }) => {
                assert.equal(rolledBackDb, db);
                assert.equal(
                  await rolledBackDb.oneOrNone("SELECT id FROM files WHERE id = $1", [data.id]),
                  null,
                );
                events.push("rollback");
              });
              if (data.original_name === "callback-failure.txt")
                throw new Error("beforeEach failed");
            },
          },
        ];
        try {
          for (const outcome of ["commit", "rollback", "failure"]) {
            events.length = 0;
            let id: string | undefined;
            const mutation = files.dboBuilder.getTX(async (tx) => {
              const row = await tx.files!.insert(fileData(`callback-${outcome}`), {
                returning: "*",
              });
              id = row.id;
              assert.deepEqual(events, []);
              if (outcome === "rollback") throw new Error("outer transaction failed");
            });
            if (outcome === "commit") {
              await mutation;
              assert.deepEqual(events, ["commit"]);
              await files.delete({ id });
            } else {
              await assert.rejects(mutation);
              assert.deepEqual(events, ["rollback"]);
            }
          }
        } finally {
          hooks.beforeEach = beforeHooks;
        }
      });

      await t.test("outer rollback preserves replaced and deleted objects", async () => {
        const before = list();
        for (const operation of ["update", "delete", "insert"] as const) {
          await assert.rejects(() =>
            files.dboBuilder.getTX(async (tx) => {
              if (operation === "update")
                await tx.files!.update({ id: original.id }, fileData("rollback"));
              if (operation === "delete") await tx.files!.delete({ id: original.id });
              if (operation === "insert") await tx.files!.insert(fileData("rollback"));
              assert.equal(read(original), "updated");
              throw new Error("rollback outer transaction");
            }),
          );
          assert.deepEqual(await files.findOne({ id: original.id }), original);
          assert.deepEqual(list(), before);
        }
      });

      await t.test("a failed multi-insert waits for other uploads before cleanup", async () => {
        const before = list();
        await assert.rejects(() =>
          files.insert([
            fileData("batch"),
            { data: Buffer.from("invalid"), original_name: "no-extension" },
          ]),
        );
        assert.deepEqual(list(), before);
      });

      await t.test("concurrent replacements leave one complete referenced object", async () => {
        const before = list();
        const beforeVersions = await versions(original.id);
        await Promise.all([
          files.update({ id: original.id }, fileData("first")),
          files.update({ id: original.id }, fileData("second")),
        ]);
        original = await files.findOne({ id: original.id });
        assert.equal(`${read(original)}.txt`, original.original_name);
        assert.equal(list().length, before.length + 2);
        assert.deepEqual(
          (await versions(original.id)).map(({ version }) => version),
          [...beforeVersions.map(({ version }) => version), original.version - 1, original.version],
        );
      });

      await t.test("version retention removes only unreferenced objects", async () => {
        config.versioning!.maxVersions = 2;
        let retained = await files.insert(fileData("retained-1"), {
          returning: "*",
        });
        const firstKey = retained.storage_key;
        try {
          await files.update({ id: retained.id }, fileData("retained-2"));
          await files.update({ id: retained.id }, fileData("retained-3"));
          retained = await files.findOne({ id: retained.id });
          assert.deepEqual(
            (await versions(retained.id)).map(({ version }) => version),
            [2, 3],
          );
          assert.equal(fs.existsSync(join(folder, firstKey)), false);
        } finally {
          await files.delete({ id: retained.id });
          config.versioning!.maxVersions = undefined;
        }
      });

      await t.test(
        "foreign-key failure preserves bytes and deletion waits for commit",
        async () => {
          await db.none(
            "CREATE TABLE storage_file_ref (file_id uuid REFERENCES files(id)); INSERT INTO storage_file_ref VALUES($1)",
            [original.id],
          );
          await assert.rejects(() => files.delete({ id: original.id }));
          assert.equal(fs.existsSync(join(folder, original.storage_key)), true);
          await db.none("DROP TABLE storage_file_ref");
          const storedKeys = new Set(
            (await versions(original.id)).map(({ storage_key }) => storage_key),
          );
          failDelete = true;
          await files.delete({ id: original.id });
          assert.ok(!(await files.findOne({ id: original.id })));
          assert.equal(fs.existsSync(join(folder, original.storage_key)), true);
          failDelete = false;
          await Promise.all([...storedKeys].map((storageKey) => remove(storageKey)));
        },
      );
      await t.test("cloud downloads and cleanup use the committed storage key", async () => {
        const objects = new Map<string, Buffer>();
        const cloud: CloudStorageClient = {
          type: "cloud",
          upload: async ({ file, fileName }) => {
            assert.ok(Buffer.isBuffer(file));
            objects.set(fileName, file);
            return {
              type: "cloud",
              url: `https://storage.invalid/${fileName}`,
              contentHash: "cloud-etag",
              contentLength: file.length,
            };
          },
          delete: async (key) => {
            objects.delete(key);
          },
          downloadAsStream: async (key) => Readable.from([objects.get(key)!]),
          getSignedUrlForDownload: async (key) => `https://storage.invalid/${key}`,
        };
        config.storageClient = cloud;
        const app = express();
        const { destroy } = setupFileServeHandler(
          db,
          { ...config, fileServePath: "/storage-cloud" },
          cloud,
          app,
          files.dboBuilder.prostgles,
        );
        const server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        assert.ok(address && typeof address === "object");
        let row = await files.insert(fileData("cloud-original"), { returning: "*" });
        const download = () =>
          fetch(`http://127.0.0.1:${address.port}/storage-cloud/${row.id}`, {
            headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
            redirect: "manual",
          });
        const downloadVersion = (version: number) =>
          fetch(`http://127.0.0.1:${address.port}/storage-cloud/${row.id}?version=${version}`, {
            headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
            redirect: "manual",
          });
        try {
          const firstKey = row.storage_key;
          const response = await download();
          assert.equal(response.status, 302);
          assert.equal(response.headers.get("location"), `https://storage.invalid/${firstKey}`);
          await assert.rejects(() =>
            files.dboBuilder.getTX(async (tx) => {
              await tx.files!.update({ id: row.id }, fileData("cloud-rollback"));
              throw new Error("rollback cloud update");
            }),
          );
          assert.deepEqual([...objects.keys()], [firstKey]);
          await files.update({ id: row.id }, fileData("cloud-updated"));
          row = await files.findOne({ id: row.id });
          assert.equal(row.signed_url, null);
          assert.deepEqual(new Set(objects.keys()), new Set([firstKey, row.storage_key]));
          assert.equal(objects.get(row.storage_key)!.toString(), "cloud-updated");
          assert.equal(
            (await download()).headers.get("location"),
            `https://storage.invalid/${row.storage_key}`,
          );
          assert.equal(
            (await downloadVersion(1)).headers.get("location"),
            `https://storage.invalid/${firstKey}`,
          );
          await files.delete({ id: row.id });
          assert.equal(objects.size, 0);
        } finally {
          await files.delete({ id: row.id });
          destroy();
          await new Promise<void>((resolve) => server.close(() => resolve()));
          config.storageClient = storage;
        }
      });
    } finally {
      failUpload = false;
      failDelete = false;
      storage.upload = upload;
      storage.delete = remove;
      hooks.afterEach = originalHooks;
      await db.none("DROP TABLE IF EXISTS storage_file_ref");
      await files.delete({ id: original.id });
    }
  });
};
