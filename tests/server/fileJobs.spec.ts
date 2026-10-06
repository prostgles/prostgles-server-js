import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { test } from "node:test";
import express from "express";
import prostgles, {
  createJobDefiner,
  type FileTableInsertRow,
  type FileTableRow,
  type InitResult,
  type ProstglesInitOptions,
} from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { FileVersionTableRow } from "prostgles-server/dist/StorageClient/fileTableDefinitions";

export const testFileJobs = async (db: DB) => {
  await test("file jobs start after upload and commit, pin revisions and skip metadata changes", async () => {
    const database = `file_jobs_${randomUUID().replaceAll("-", "")}`;
    const files = "files";
    const objects = new Map<string, Buffer>();
    const processed: { fileId: string; revision: number; text: string }[] = [];
    let instance: InitResult<FileJobTestSchema> | undefined;
    const defineJob = createJobDefiner<FileJobTestSchema>();
    let uploadStarted = () => {};
    let finishUpload = () => {};
    let pendingUpload: Promise<void> | undefined;
    let failUpload = false;
    let failAfterEnqueue = false;
    try {
      await db.none(`CREATE DATABASE ${database}`);
      instance = await prostgles<FileJobTestSchema>({
        dbConnection: {
          ...getConnectionDetails(db),
          database,
        } as unknown as ProstglesInitOptions["dbConnection"],
        transactions: true,
        onReady: () => {},
        tableConfig: {
          [files]: { columns: { notes: "TEXT" } },
        },
        fileTable: {
          tableName: files,
          versioning: {},
          expressApp: express(),
          storageClient: {
            type: "cloud",
            upload: async ({ file, fileName }) => {
              assert(Buffer.isBuffer(file));
              uploadStarted();
              await pendingUpload;
              if (failUpload) throw new Error("Upload failed");
              objects.set(fileName, file);
              return {
                type: "cloud",
                url: `https://storage.invalid/${fileName}`,
                contentHash: fileName,
                contentLength: file.length,
              };
            },
            delete: (key) => {
              objects.delete(key);
            },
            downloadAsStream: (key) => Readable.from([objects.get(key)!]),
            getSignedUrlForDownload: (key) => `https://storage.invalid/${key}`,
          },
        },
        tableHooks: {
          [files]: {
            afterEach: [
              {
                commands: { insert: 1, update: 1 },
                changedFields: ["data"],
                validate: () => {
                  if (failAfterEnqueue) throw new Error("Reject completed upload");
                },
              },
            ],
          },
        },
        jobs: {
          definitions: {
            ingest: defineJob({
              trigger: { type: "row", table: `${files}_versions`, on: ["insert"] },
              run: async ({ row, dbo }) => {
                assert(objects.has(row.storage_key), "Worker ran before storage upload completed");
                assert(await dbo[files].findOne({ id: row.file_id }), "Worker ran before commit");
                processed.push({
                  fileId: row.file_id,
                  revision: row.version,
                  text: objects.get(row.storage_key)!.toString(),
                });
              },
            }),
          },
        },
      });
      const fileTable = instance.db[files];
      const waitForJobs = async (count: number) => {
        const deadline = Date.now() + 10_000;
        while (processed.length !== count) {
          assert(Date.now() < deadline, "Timed out waiting for file jobs");
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      };
      pendingUpload = new Promise<void>((resolve) => {
        finishUpload = resolve;
      });
      const started = new Promise<void>((resolve) => {
        uploadStarted = resolve;
      });
      const inserting = fileTable.insert(
        { data: Buffer.from("revision one"), original_name: "input.txt" },
        { returning: "*" },
      );
      await started;
      assert.equal(processed.length, 0);
      finishUpload();
      const file = await inserting;
      pendingUpload = undefined;
      // A later upload must not change the earlier job's input.
      await fileTable.update(
        { id: file.id },
        { data: Buffer.from("revision two"), original_name: "input.txt" },
      );
      await waitForJobs(2);
      assert.deepEqual(processed, [
        { fileId: file.id, revision: 1, text: "revision one" },
        { fileId: file.id, revision: 2, text: "revision two" },
      ]);
      await fileTable.update({ id: file.id }, { notes: "metadata only" });
      assert.equal(processed.length, 2);
      failUpload = true;
      await assert.rejects(
        fileTable.insert({ data: Buffer.from("failed"), original_name: "failed.txt" }),
      );
      failUpload = false;
      assert.equal(processed.length, 2);
      failAfterEnqueue = true;
      await assert.rejects(
        fileTable.insert({ data: Buffer.from("rolled back"), original_name: "rollback.txt" }),
      );
      failAfterEnqueue = false;
      assert.equal(await instance.db[`${files}_versions`].count({}), 2);
      assert.equal(
        (
          await instance._db.one<{ count: string }>(
            "SELECT count(*) FROM prostgles_jobs WHERE target_table = $1",
            [`${files}_versions`],
          )
        ).count,
        "2",
      );
      assert.equal(objects.size, 2);
    } finally {
      finishUpload();
      await instance?.destroy();
      await db.none(`DROP DATABASE ${database} WITH (FORCE)`);
    }
  });
};

type FileJobTestSchema = {
  files: {
    columns: FileTableRow & { notes: string | null };
    insertColumns: Partial<FileTableInsertRow> &
      Pick<FileTableInsertRow, "data" | "original_name"> & { notes?: string | null };
  };
  files_versions: { columns: FileVersionTableRow };
};
