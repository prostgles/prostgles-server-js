import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import express from "express";
import prostgles, {
  getLocalStorageClient,
  type DB,
  type FileTableInsertRow,
  type FileTableRow,
  type InitResult,
  type ProstglesInitOptions,
  type PublishObject,
} from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { createServerSideRequest } from "prostgles-server/dist/Auth/utils/serverSideRequest";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import type { FileTableConfig } from "prostgles-server/dist/ProstglesTypes";
import type { PermissionScope } from "prostgles-server/dist/PublishParser/PublishParser";
import type { FileVersionTableRow } from "prostgles-server/dist/StorageClient/fileTableDefinitions";
import { FILE_CONTENT_SELECT } from "prostgles-server/dist/StorageClient/fileTableDefinitions";
import { waitFor } from "./subscriptionNotifications.spec";

export const testFileDerivedTables = async (parentDb: DB) => {
  for (const versioned of [true, false]) {
    await test(`File derived content permissions ${versioned ? "with custom revisions" : "without versioning"}`, async (t) => {
      const database = `derived_files_${randomUUID().replaceAll("-", "")}`;
      const folder = await mkdtemp(join(tmpdir(), "prostgles-derived-files-"));
      const filesTable = "documents";
      const revisionsTable = "document_revisions";
      const pagesTable = "extracted_sections";
      const previewsTable = "document_previews";
      const previewNotesTable = "preview_notes";
      const computedReportJoin = "by_document";
      const sourceTable = versioned ? revisionsTable : filesTable;
      const sourceJoin: Record<string, string> =
        versioned ? { doc_id: "file_id", revision: "version" } : { doc_id: "id" };
      const sourceHop = { table: sourceTable, on: [sourceJoin] };
      const sourceIdentityFields = versioned ? ["id", "version"] : ["id"];
      const sourceReference =
        versioned ? `${revisionsTable}(file_id, version)` : `${filesTable}(id)`;
      const sourceColumns = versioned ? "doc_id, revision" : "doc_id";
      const fileTable: FileTableConfig = {
        tableName: filesTable,
        versioning: versioned ? { tableName: revisionsTable } : undefined,
        storageClient: getLocalStorageClient({ localFolderPath: folder }),
        expressApp: express(),
        derivedTables: [
          versioned ? { tableName: pagesTable, joinPath: [sourceHop] } : pagesTable,
          versioned ? previewsTable : { tableName: previewsTable, joinPath: [sourceHop] },
          { tableName: previewNotesTable, joinPath: ["**", sourceHop] },
        ],
      };
      let publish: PublishObject = {};
      let instance: InitResult<DerivedFilesTestSchema> | undefined;
      await parentDb.none("CREATE DATABASE $1:name", [database]);
      try {
        instance = await prostgles<DerivedFilesTestSchema>({
          dbConnection: {
            ...getConnectionDetails(parentDb),
            database,
          } as unknown as ProstglesInitOptions["dbConnection"],
          fileTable,
          joins: "inferred",
          publish: () => publish,
          auth: {
            getUser: () => undefined,
            findUser: () => ({ id: "reader", type: "user" }),
          },
          onReady: () => {},
          tableConfig: {
            [filesTable]: { columns: { project: "TEXT", discipline: "TEXT" } },
            [pagesTable]: {
              columns: {
                doc_id: `UUID NOT NULL REFERENCES ${filesTable}(id) ON DELETE CASCADE`,
                revision: "INTEGER NOT NULL",
                page: "INTEGER NOT NULL",
                text: "TEXT NOT NULL",
                search_vector: "TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED",
              },
              constraints: {
                pages_pkey: "PRIMARY KEY (doc_id, revision, page)",
                ...(versioned ?
                  {
                    source_revision: `FOREIGN KEY (${sourceColumns}) REFERENCES ${sourceReference} ON DELETE CASCADE`,
                  }
                : {}),
              },
              publishRestrictions: {
                insert: false,
                update: false,
                delete: false,
              },
            },
            [previewsTable]: {
              columns: {
                id: "SERIAL PRIMARY KEY",
                doc_id: "UUID",
                ...(!versioned && { secondary_doc_id: `UUID REFERENCES ${filesTable}(id)` }),
                revision: "INTEGER",
                text: "TEXT",
              },
              constraints: {
                source: `FOREIGN KEY (${sourceColumns}) REFERENCES ${sourceReference} ON DELETE CASCADE`,
              },
            },
            [previewNotesTable]: {
              columns: {
                preview_id: `INTEGER REFERENCES ${previewsTable}(id) ON DELETE CASCADE`,
                text: "TEXT",
              },
            },
            reports: {
              getJoins: () => [
                {
                  tables: ["reports", filesTable],
                  on: [
                    {
                      $joinName: computedReportJoin,
                      $sql: ({ left, right }) => `${left("document")} = ${right("id")}`,
                    },
                  ],
                },
              ],
              columns: {
                id: "SERIAL PRIMARY KEY",
                document: `UUID REFERENCES ${filesTable}(id) ON DELETE CASCADE`,
              },
            },
          },
        });
        const files = instance.db[filesTable];
        const pages = instance.db[pagesTable];
        const previews = instance.db[previewsTable];
        const [own, otherProject, otherDiscipline] = await files.insertMany(
          [
            { project: "own", discipline: "ecology" },
            { project: "other", discipline: "ecology" },
            { project: "own", discipline: "drainage" },
          ].map((scope) => ({
            ...scope,
            data: Buffer.from("original"),
            original_name: "report.txt",
            description: "private",
          })),
          { returning: "*" },
        );
        assert(own && otherProject && otherDiscipline);
        if (versioned) {
          await files.update(
            { id: own.id },
            { data: Buffer.from("replacement"), original_name: "report.txt" },
          );
        }
        const pageRows = [own, otherProject, otherDiscipline].flatMap((file) =>
          (versioned && file.id === own.id ? [1, 2] : [1]).map((revision) => ({
            doc_id: file.id,
            revision,
            page: 1,
            text: `ecology revision ${revision}`,
          })),
        );
        await pages.insertMany(pageRows);
        const insertedPreviews = await previews.insertMany(
          pageRows.map(({ doc_id, revision, text }) => ({
            doc_id,
            ...(!versioned && { secondary_doc_id: own.id }),
            revision,
            text,
          })),
          { returning: "*" },
        );
        await instance.db[previewNotesTable].insertMany(
          insertedPreviews.map(({ id }) => ({ preview_id: id, text: "derived preview" })),
        );
        const getClient = (scope?: PermissionScope) =>
          instance!.getClientDBHandlers({ userId: "reader" }, scope);
        const allowedFiles = {
          fields: "*",
          forcedFilter: { project: "own", discipline: "ecology" },
        } as const;
        const expectedRevisions = versioned ? [1, 2] : [1];
        const assertRevisions = async (expected: number[]) => {
          const { clientDb } = await getClient();
          assert.deepEqual(
            await clientDb[pagesTable].find({}, { select: ["revision"], orderBy: "revision" }),
            expected.map((revision) => ({ revision })),
          );
        };

        await t.test(
          "derived permissions keep a snapshot of the configured join path",
          async () => {
            publish = { [filesTable]: { select: allowedFiles } };
            sourceHop.on.pop();
            try {
              const { clientDb } = await getClient();
              assert.equal(await clientDb[previewNotesTable].count({}), expectedRevisions.length);
            } finally {
              sourceHop.on.push(sourceJoin);
            }
          },
        );

        await t.test(
          "inherits source rows for direct reads, searches, joins and shorthand tables",
          async () => {
            publish = { [filesTable]: { select: allowedFiles } };
            await assertRevisions(expectedRevisions);
            const { clientDb, clientSchema } = await getClient();
            assert(clientSchema.tableSchema.some((table) => table.name === pagesTable));
            assert.equal(await clientDb[pagesTable].count({}), expectedRevisions.length);
            assert.equal(
              await clientDb[pagesTable].count({
                search_vector: { "@@": { plainto_tsquery: ["english", "ecology"] } },
              }),
              expectedRevisions.length,
            );
            assert.deepEqual(await clientDb[pagesTable].find({ doc_id: otherProject.id }), []);
            assert.equal(await clientDb[previewsTable].count({}), expectedRevisions.length);
            assert.equal(await clientDb[previewNotesTable].count({}), expectedRevisions.length);
            const joined = await clientDb[filesTable].find(
              { id: own.id },
              { select: { id: 1, [pagesTable]: "*" } },
            );
            assert.equal(joined[0]![pagesTable].length, expectedRevisions.length);
            for (const table of [pagesTable, previewsTable] as const) {
              assert.equal(clientDb[table].insert, undefined);
              assert.equal(clientDb[table].update, undefined);
              assert.equal(clientDb[table].delete, undefined);
            }
          },
        );

        await t.test(
          "metadata-only grants and explicit denial cannot expose derived text",
          async () => {
            publish = {
              [filesTable]: { select: { fields: ["id", "original_name"] } },
            };
            assert.equal(pagesTable in (await getClient()).clientDb, false);
            publish = { [filesTable]: { select: allowedFiles } };
            const existingPages = (await getClient()).clientDb[pagesTable];
            for (const denied of [false, { select: false }] as const) {
              publish[pagesTable] = denied;
              assert.equal(pagesTable in (await getClient()).clientDb, false);
              await assert.rejects(existingPages.find({}));
            }
            publish = { [pagesTable]: { select: "*" } };
            assert.equal(filesTable in (await getClient()).clientDb, false);
            assert.equal(pagesTable in (await getClient()).clientDb, false);
          },
        );

        await t.test(
          "derived reads require every filter field used by the download lookup",
          async () => {
            const incompleteLookups = versioned ? [["file_id"], ["version"]] : [["original_name"]];
            for (const filterFields of incompleteLookups) {
              publish = {
                [filesTable]: { select: allowedFiles },
                [sourceTable]: { select: { fields: "*", filterFields } },
              };
              const { clientDb } = await getClient();
              const params = { select: FILE_CONTENT_SELECT };
              await assert.rejects(
                versioned ?
                  clientDb[revisionsTable].findOne({ file_id: own.id, version: 1 }, params)
                : clientDb[filesTable].findOne({ id: own.id }, params),
              );
              assert.equal(pagesTable in clientDb, false);
            }
          },
        );

        await t.test(
          "mixed and overlapping column grants require content access on the same row",
          async () => {
            publish = {
              [filesTable]: {
                select: [allowedFiles, { fields: ["id", "original_name"] }],
              },
            };
            await assertRevisions(expectedRevisions);
            publish = {
              [filesTable]: {
                select: [
                  {
                    fields: [...sourceIdentityFields, "storage_key"],
                    forcedFilter: { id: own.id },
                  },
                  {
                    fields: [
                      ...sourceIdentityFields,
                      "signed_url",
                      "signed_url_expires",
                      "content_type",
                    ],
                  },
                ],
              },
            };
            await assertRevisions(expectedRevisions);
            publish = {
              [filesTable]: {
                select: [
                  {
                    fields: [...sourceIdentityFields, "storage_key"],
                    forcedFilter: { id: own.id },
                  },
                  {
                    fields: [
                      ...sourceIdentityFields,
                      "signed_url",
                      "signed_url_expires",
                      "content_type",
                    ],
                    forcedFilter: { id: otherProject.id },
                  },
                ],
              },
            };
            await assertRevisions([]);
          },
        );

        await t.test(
          "derived rules narrow fields, rows and limits without granting writes",
          async () => {
            publish = {
              [filesTable]: {
                select: {
                  ...allowedFiles,
                  maxLimit: 1,
                  disableMethods: { subscribe: 1 },
                },
              },
              [pagesTable]: {
                select: {
                  fields: ["text"],
                  filterFields: ["doc_id"],
                  orderByFields: ["revision"],
                  forcedFilter: { revision: 1 },
                  maxLimit: 10,
                },
              },
            };
            const { clientDb } = await getClient();
            const rows = await clientDb[pagesTable].find(
              { doc_id: own.id },
              { orderBy: "revision", limit: 1 },
            );
            assert.equal(rows.length, 1);
            assert.deepEqual(rows, [{ text: "ecology revision 1" }]);
            await assert.rejects(clientDb[pagesTable].find({}, { select: ["page"] }));
            await assert.rejects(clientDb[pagesTable].find({}, { limit: 2 }));
            assert.equal(clientDb[pagesTable].subscribe, undefined);
          },
        );

        await t.test(
          "workflow scopes preserve source filters, fields and table denial",
          async () => {
            publish = {
              [filesTable]: {
                select: [allowedFiles, { fields: ["id", "original_name"] }],
              },
            };
            const scope: PermissionScope = {
              tables: {
                [filesTable]: {
                  select: { forcedFilter: { description: null } },
                },
                ...(versioned ? { [revisionsTable]: { select: true } } : {}),
                [pagesTable]: { select: true },
              },
            };
            assert.deepEqual(await (await getClient(scope)).clientDb[pagesTable].find({}), []);
            for (const description of [null, "private"]) {
              const { clientDb } = await getClient({
                tables: {
                  [filesTable]: { select: true },
                  [sourceTable]: {
                    select: {
                      fields: Object.keys(FILE_CONTENT_SELECT),
                      forcedFilter: { description },
                    },
                  },
                  [pagesTable]: { select: true },
                },
              });
              const expectedCount = description === null ? 0 : expectedRevisions.length;
              const sourceCount: number =
                versioned ?
                  await clientDb[revisionsTable].count({ file_id: own.id })
                : await clientDb[filesTable].count({ id: own.id });
              assert.equal(sourceCount, expectedCount);
              assert.equal(await clientDb[pagesTable].count({ doc_id: own.id }), expectedCount);
            }
            scope.tables![filesTable] = {
              select: { fields: ["id", "original_name"] },
            };
            assert.equal(pagesTable in (await getClient(scope)).clientDb, false);
            scope.tables![filesTable] = {
              select: {
                fields: [...Object.keys(FILE_CONTENT_SELECT), ...(versioned ? ["version"] : [])],
              },
            };
            assert.equal(
              await (await getClient(scope)).clientDb[pagesTable].count({}),
              expectedRevisions.length,
            );
            delete scope.tables![sourceTable];
            assert.equal(pagesTable in (await getClient(scope)).clientDb, false);
          },
        );

        await t.test(
          "removing a report's file reference revokes access in an active page subscription",
          async () => {
            await instance!.db.reports.insert({ document: own.id });
            publish = { reports: { select: "*" } };
            await assertRevisions(expectedRevisions);
            const handler = pages as unknown as TableHandler;
            const parser = handler.dboBuilder.publishParser!;
            const clientReq = createServerSideRequest(parser.prostgles, "reader");
            const rules = await parser.getValidatedRequestRuleWusr(
              { tableName: pagesTable, command: "subscribe", clientReq },
              undefined,
            );
            const changes = new EventEmitter();
            const nextRows = () => once(changes, "rows", { signal: AbortSignal.timeout(5000) });
            const subscription = await handler.subscribe(
              { doc_id: own.id },
              { select: ["revision"], orderBy: "revision", throttle: 0 },
              (rows, error) => (error ? changes.emit("error", error) : changes.emit("rows", rows)),
              rules,
              { clientReq },
            );
            assert("unsubscribe" in subscription && typeof subscription.unsubscribe === "function");
            try {
              const [initialRows] = await nextRows();
              assert.deepEqual(
                initialRows,
                expectedRevisions.map((revision) => ({ revision })),
              );
              const [[revokedRows]] = await Promise.all([
                nextRows(),
                instance!.db.reports.update({ document: own.id }, { document: otherProject.id }),
              ]);
              assert.deepEqual(revokedRows, []);
            } finally {
              await subscription.unsubscribe();
              const pubSub = await handler.dboBuilder.getPubSubManager();
              await waitFor(() => !pubSub._triggers.size, "Page subscription cleanup timed out");
            }
          },
        );

        if (versioned) {
          await t.test(
            "exact revision rules constrain pages even when the file remains readable",
            async () => {
              publish = {
                [filesTable]: { select: allowedFiles },
                [revisionsTable]: {
                  select: { fields: "*", forcedFilter: { version: 1 } },
                },
              };
              await assertRevisions([1]);
              publish[revisionsTable] = {
                select: [
                  { fields: "*", forcedFilter: { version: 1 } },
                  { fields: ["id", "file_id", "version", "original_name"] },
                ],
              };
              await assertRevisions([1]);
              publish[revisionsTable] = false;
              assert.equal(pagesTable in (await getClient()).clientDb, false);
            },
          );
          await t.test("ambiguous shorthand requires an explicit source path", async () => {
            await assert.rejects(
              instance!.update({
                fileTable: { ...fileTable, derivedTables: [pagesTable] },
              }),
              /requires an explicit joinPath/,
            );
          });
        } else {
          await t.test(
            "a derived table with both a column and a computed join requires on",
            async () => {
              const setDerivedTables = (
                derivedTables: NonNullable<FileTableConfig["derivedTables"]>,
              ) => instance!.update({ fileTable: { ...fileTable, derivedTables } });
              publish = { [filesTable]: { select: allowedFiles } };
              const report = await instance!.db.reports.insert(
                { document: own.id },
                { returning: "*" },
              );
              await assert.rejects(
                instance!.db.reports.findOne({ id: report.id }, { select: { [filesTable]: "*" } }),
                { message: /Multiple joins.*Specify on/ },
              );
              for (const on of [computedReportJoin, [{ document: "id" }]]) {
                await setDerivedTables([
                  { tableName: "reports", joinPath: [{ table: filesTable, on }] },
                ]);
                assert.deepEqual(
                  await (await getClient()).clientDb.reports.findOne({ id: report.id }),
                  report,
                );
              }
              await assert.rejects(setDerivedTables(["reports"]), /Specify on in joinPath/);
            },
          );
          await t.test("each ambiguous hop in a derived path requires on", async () => {
            for (const entry of [
              previewsTable,
              { tableName: previewsTable, joinPath: filesTable },
              { tableName: previewNotesTable, joinPath: [previewsTable, { table: filesTable }] },
            ]) {
              await assert.rejects(
                instance!.update({ fileTable: { ...fileTable, derivedTables: [entry] } }),
                /through multiple constraints/,
              );
            }
          });
        }
      } finally {
        await instance?.destroy();
        await parentDb.none("DROP DATABASE $1:name WITH (FORCE)", [database]);
        await rm(folder, { recursive: true, force: true });
      }
    });
  }
};

type DerivedFilesTestSchema = {
  documents: {
    columns: FileTableRow & { project: string; discipline: string };
    insertColumns: Partial<FileTableInsertRow> &
      Pick<FileTableInsertRow, "data" | "original_name"> & { project: string; discipline: string };
  };
  document_revisions: { columns: FileVersionTableRow };
  extracted_sections: {
    columns: {
      doc_id: string;
      revision: number;
      page: number;
      text: string;
      search_vector: string;
    };
    insertColumns: { doc_id: string; revision: number; page: number; text: string };
  };
  document_previews: {
    columns: { id: number; doc_id: string; revision: number; text: string };
    insertColumns: { doc_id: string; revision: number; text: string };
  };
  preview_notes: { columns: { preview_id: number; text: string } };
  reports: { columns: { id: number; document: string }; insertColumns: { document: string } };
};
