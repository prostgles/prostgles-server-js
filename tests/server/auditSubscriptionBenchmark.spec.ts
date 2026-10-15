import { strict as assert } from "node:assert";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import type { AuditTableRow, ProstglesInitOptions, PublishObject } from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { CHANNELS, type ClientSchema, type SubscriptionChannels } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";

// 1 million audit rows (50,000 per business table).
// Delivery includes the write and its WebSocket audit update; throughput waits for both.
const BENCHMARK_LIMITS = {
  initialP95Ms: 500,
  inferredReadP95Ms: 500,
  writeP95Ms: 100,
  auditDeliveryP95Ms: 250,
  minWritesPerSecond: 100,
};

// Local only: TEST_NAME=auditBenchmark npm run test-server from tests/server.
// Set AUDIT_BENCHMARK_REPORT_PATH to save the measurements as JSON.
export const testAuditSubscriptionBenchmark = async (parentDb: DB) => {
  await test(
    "20 audited business tables with 20 users writing, subscribing and reading inferred history",
    {
      timeout: 180_000,
      skip:
        process.env.CI || process.env.GITHUB_ACTIONS ?
          "Performance benchmark only runs locally"
        : false,
    },
    async (t) => {
      const schemaName = "audit_subscription_benchmark";
      const rowsPerTable = Number(process.env.AUDIT_BENCHMARK_ROWS_PER_TABLE || 50_000);
      assert(Number.isInteger(rowsPerTable) && rowsPerTable >= 200);
      const http = createServer();
      const io = new Server(http);
      const clients: BenchmarkClient[] = [];
      await parentDb.none(`
      DROP SCHEMA IF EXISTS ${schemaName} CASCADE;
      CREATE SCHEMA ${schemaName};
      ${BUSINESS_TABLES.map(
        (tableName) => `CREATE TABLE ${schemaName}.${tableName} (
        id serial PRIMARY KEY, team_id int NOT NULL, updated_by text NOT NULL,
        title text NOT NULL, status text NOT NULL DEFAULT 'open', notes text NOT NULL
      );`,
      ).join("\n")}
    `);
      const server = new Prostgles({
        dbConnection: {
          ...getConnectionDetails(parentDb),
          options: `-c search_path=${schemaName},public`,
        } as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schemaName]: 1 },
        io,
        onReady: () => {},
        audit: {
          tableName: "events",
          tables: Object.fromEntries(BUSINESS_TABLES.map((tableName) => [tableName, 1])),
        },
        auth: {
          sidKeyName: "token",
          getUser: (sid) => {
            assert(sid);
            const user = { id: sid, type: "employee" };
            return { user, clientUser: user };
          },
          findUser: () => undefined,
        },
        publish: ({ user }) => {
          assert(user);
          const teamId = getTeamId(Number(user.id));
          const publish: PublishObject = Object.fromEntries(
            BUSINESS_TABLES.map((tableName) => [
              tableName,
              {
                select: { fields: "*", forcedFilter: { team_id: teamId } },
                insert: {
                  fields: ["title", "status", "notes"],
                  forcedData: { team_id: teamId, updated_by: user.id },
                },
                update: {
                  fields: ["title", "status", "notes"],
                  forcedFilter: { team_id: teamId },
                  forcedData: { updated_by: user.id },
                },
                delete: { filterFields: ["id"], forcedFilter: { team_id: teamId } },
              },
            ]),
          );
          // Inferred audit access disables subscribe; use explicit server-enforced permissions.
          publish.events = {
            select: {
              fields: "*",
              forcedFilter: {
                $and: [
                  { schema_name: schemaName, table_name: { $in: BUSINESS_TABLES } },
                  ...["old_row", "new_row"].map((snapshot) => ({
                    $or: [{ [snapshot]: null }, { [`${snapshot}->>team_id`]: String(teamId) }],
                  })),
                ],
              },
            },
          };
          return publish;
        },
      });
      let instance: Awaited<ReturnType<Prostgles["init"]>> | undefined;
      try {
        instance = await server.init(() => {}, { type: "init" });
        // Seed through the real audit triggers before any subscription triggers exist.
        for (const tableName of BUSINESS_TABLES) {
          await instance._db.none(
            `
          INSERT INTO ${tableName} (team_id, updated_by, title, notes)
          SELECT ((row_id - 1) % 4) + 1, (((row_id - 1) % 20) + 1)::text,
            'Existing record ' || row_id, repeat('Business record notes. ', 12)
          FROM generate_series(1, $1::int) AS row_id;
        `,
            [rowsPerTable],
          );
        }
        await instance._db.none("ANALYZE events");
        const { count: historyRows } = await instance._db.one<{ count: number }>(
          "SELECT count(*)::int AS count FROM events",
        );
        assert.equal(historyRows, BUSINESS_TABLES.length * rowsPerTable);
        // Exclude one-time PubSubManager setup from delivery timings.
        const pubSubManager = await server.dboBuilder.getPubSubManager();
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        // Connect 20 authenticated users across four teams to exercise permission-isolated delivery.
        for (let userId = 1; userId <= 20; userId++) {
          const socket = createClient(`http://127.0.0.1:${address.port}`, {
            transports: ["websocket"],
            reconnection: false,
            query: { token: String(userId) },
          });
          clients.push({
            socket,
            userId: String(userId),
            teamId: getTeamId(userId),
            channels: undefined,
            rowId: undefined,
          });
          const schema = await new Promise<ClientSchema>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Audit client connection timed out")),
              10_000,
            );
            socket.once("connect_error", (error: Error) => {
              clearTimeout(timeout);
              reject(error);
            });
            socket.once(CHANNELS.SCHEMA, (schema: ClientSchema) => {
              clearTimeout(timeout);
              resolve(schema);
            });
          });
          assert.equal(schema.err, undefined);
          assert.deepEqual(
            schema.tableSchema.map(({ name }) => name).sort(),
            [...BUSINESS_TABLES, "events"].sort(),
          );
        }

        // Measure the initial page delivery for all audit subscriptions started concurrently.
        const initialLatencies = await Promise.all(
          clients.map(async (client) => {
            const started = performance.now();
            client.channels = await requestSocket<SubscriptionChannels>(
              client.socket,
              CHANNELS.DEFAULT,
              {
                tableName: "events",
                command: "subscribe",
                param1: {},
                param2: { orderBy: { id: -1 }, limit: 50, throttle: 0 },
              },
            );
            const delivered = waitForAuditDelivery(client, undefined);
            client.socket.emit(client.channels.channelNameReady);
            return (await delivered) - started;
          }),
        );
        const writeLatencies: number[] = [];
        const deliveryLatencies: number[] = [];
        const operationCounts = { insert: 0, update: 0, delete: 0 };
        const workloadStarted = performance.now();
        // Each cycle creates a record, edits it three times, then deletes it.
        // Users rotate across tables; every round writes to all 20 tables concurrently.
        for (let round = 0; round < 20; round++) {
          await Promise.all(
            clients.map(async (client, index) => {
              const tableName =
                BUSINESS_TABLES[(Math.floor(round / 5) + index) % BUSINESS_TABLES.length]!;
              const phase = round % 5;
              const command =
                phase === 0 ? "insert"
                : phase === 4 ? "delete"
                : "update";
              const title = `User ${client.userId} edit ${command === "delete" ? round - 1 : round}`;
              const data = {
                title,
                status: phase === 3 ? "done" : "open",
                notes: "Updated business record. ".repeat(12),
              };
              if (command !== "insert") assert(client.rowId);
              const started = performance.now();
              const delivered = waitForAuditDelivery(client, {
                operation: command.toUpperCase(),
                title,
                userId: client.userId,
                tableName,
              });
              const [result, receivedAt] = await Promise.all([
                requestSocket<{ id: number } | undefined>(client.socket, CHANNELS.DEFAULT, {
                  tableName,
                  command,
                  param1: command === "insert" ? data : { id: client.rowId },
                  param2:
                    command === "insert" ? { returning: ["id"] }
                    : command === "update" ? data
                    : {},
                }).then((result) => {
                  writeLatencies.push(performance.now() - started);
                  return result;
                }),
                delivered,
              ]);
              if (command === "insert") {
                assert(result);
                client.rowId = result.id;
              } else if (command === "delete") client.rowId = undefined;
              operationCounts[command]++;
              deliveryLatencies.push(receivedAt - started);
            }),
          );
        }
        const workloadDurationMs = performance.now() - workloadStarted;
        // Every insert, update and delete must produce exactly one audit row.
        assert.equal(await instance.db.events!.count!({}), historyRows + 400);
        assert.deepEqual(operationCounts, { insert: 80, update: 240, delete: 80 });
        await Promise.all(
          clients.map((client) =>
            requestSocket(client.socket, client.channels!.channelNameUnsubscribe, {}),
          ),
        );
        // Unsubscribe acknowledges before deferred trigger cleanup has finished.
        const cleanupDeadline = Date.now() + 10_000;
        while (pubSubManager.deletingOrphanedTriggers || pubSubManager._triggers.size) {
          assert(Date.now() < cleanupDeadline, "Audit subscription triggers were not cleaned up");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Omit events so reads use inferred permissions for all 20 tables.
        await instance.update({
          publish: ({ user }) => {
            assert(user);
            return Object.fromEntries(
              BUSINESS_TABLES.map((tableName) => [
                tableName,
                {
                  select: { fields: "*", forcedFilter: { team_id: getTeamId(Number(user.id)) } },
                },
              ]),
            );
          },
        });
        // Unscoped inferred reads must enforce team permissions and hide internal join columns.
        const inferredReadErrors: unknown[] = [];
        const inferredReadLatencies = await Promise.all(
          clients.map(async (client) => {
            const started = performance.now();
            try {
              const rows = await requestSocket<AuditTableRow[]>(client.socket, CHANNELS.DEFAULT, {
                tableName: "events",
                command: "find",
                param1: {}, // No exact schema/table filters for getExactStringFilters to narrow down.
                param2: { orderBy: { id: -1 }, limit: 50 },
              });
              const duration = performance.now() - started;
              assertAuditRows(client, rows);
              assert(
                rows.every(
                  (row) =>
                    !Object.keys(row).some((column) => column.startsWith("prostgles_audit_join_")),
                ),
              );
              return duration;
            } catch (error) {
              inferredReadErrors.push(error);
              return performance.now() - started;
            }
          }),
        );
        const measurements = {
          auditedTables: BUSINESS_TABLES.length,
          users: clients.length,
          teams: 4,
          historyRows,
          returnedRows: 50,
          operations: operationCounts,
          writesPerSecond: Number((400_000 / workloadDurationMs).toFixed(2)),
          initial: summarizeLatencies(initialLatencies),
          inferredRead: {
            ...summarizeLatencies(inferredReadLatencies),
            failedRequests: inferredReadErrors.length,
          },
          write: summarizeLatencies(writeLatencies),
          auditDelivery: summarizeLatencies(deliveryLatencies),
          limits: BENCHMARK_LIMITS,
        };
        t.diagnostic(JSON.stringify(measurements));
        if (process.env.AUDIT_BENCHMARK_REPORT_PATH) {
          writeFileSync(
            process.env.AUDIT_BENCHMARK_REPORT_PATH,
            JSON.stringify(measurements, null, 2),
          );
        }
        // Enforce latency and throughput limits only after collecting the full workload report.
        assert(
          measurements.initial.p95Ms <= BENCHMARK_LIMITS.initialP95Ms,
          `Initial subscription p95 ${measurements.initial.p95Ms}ms exceeds ${BENCHMARK_LIMITS.initialP95Ms}ms`,
        );
        assert.deepEqual(inferredReadErrors, [], "Inferred audit reads failed");
        assert(
          measurements.inferredRead.p95Ms <= BENCHMARK_LIMITS.inferredReadP95Ms,
          `Inferred audit read p95 ${measurements.inferredRead.p95Ms}ms exceeds ${BENCHMARK_LIMITS.inferredReadP95Ms}ms`,
        );
        assert(
          measurements.write.p95Ms <= BENCHMARK_LIMITS.writeP95Ms,
          `Write p95 ${measurements.write.p95Ms}ms exceeds ${BENCHMARK_LIMITS.writeP95Ms}ms`,
        );
        assert(
          measurements.auditDelivery.p95Ms <= BENCHMARK_LIMITS.auditDeliveryP95Ms,
          `Audit delivery p95 ${measurements.auditDelivery.p95Ms}ms exceeds ${BENCHMARK_LIMITS.auditDeliveryP95Ms}ms`,
        );
        assert(
          measurements.writesPerSecond >= BENCHMARK_LIMITS.minWritesPerSecond,
          `Throughput ${measurements.writesPerSecond} writes/s is below ${BENCHMARK_LIMITS.minWritesPerSecond} writes/s`,
        );
      } finally {
        clients.forEach(({ socket }) => socket.close());
        if (instance) await instance.destroy();
        else {
          await server.db?.$pool.end();
          await server.adminClient?.end();
        }
        await io.close();
        await parentDb.none(`DROP SCHEMA ${schemaName} CASCADE`);
      }
    },
  );
};

type BenchmarkClient = {
  socket: Socket;
  userId: string;
  teamId: number;
  channels: SubscriptionChannels | undefined;
  rowId: number | undefined;
};
type ExpectedAuditWrite = { operation: string; title: string; userId: string; tableName: string };

const BUSINESS_TABLES = [
  "customers",
  "contacts",
  "projects",
  "tasks",
  "comments",
  "documents",
  "folders",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "payments",
  "products",
  "orders",
  "order_items",
  "suppliers",
  "purchase_orders",
  "expenses",
  "timesheets",
  "notifications",
];

const getTeamId = (userId: number) => ((userId - 1) % 4) + 1;

const requestSocket = <Result>(socket: Socket, channel: string, request: unknown) =>
  new Promise<Result>((resolve, reject) => {
    socket
      .timeout(10_000)
      .emit(channel, request, (timeoutError: unknown, error: unknown, result: Result) => {
        if (timeoutError || error) reject(timeoutError || error);
        else resolve(result);
      });
  });

const waitForAuditDelivery = (client: BenchmarkClient, expected: ExpectedAuditWrite | undefined) =>
  new Promise<number>((resolve, reject) => {
    const channel = client.channels!.channelName;
    const cleanup = () => {
      clearTimeout(timeout);
      client.socket.off(channel, onDelivery);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Audit delivery timed out for user ${client.userId}: ${JSON.stringify(expected)}`,
        ),
      );
    }, 10_000);
    const onDelivery = ({ data, err }: { data: AuditTableRow[] | undefined; err: unknown }) => {
      const receivedAt = performance.now();
      try {
        assert.equal(err, undefined);
        assert(data);
        assertAuditRows(client, data);
        if (expected) {
          const matchingWrite = data.find(
            (row) =>
              row.operation === expected.operation &&
              row.table_name === expected.tableName &&
              (row.new_row ?? row.old_row)?.title === expected.title,
          );
          if (!matchingWrite) return;
          assert.equal(matchingWrite.actor?.id, expected.userId);
        }
        cleanup();
        resolve(receivedAt);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    client.socket.on(channel, onDelivery);
  });

const assertAuditRows = (client: BenchmarkClient, rows: AuditTableRow[]) => {
  assert.equal(rows.length, 50);
  for (const row of rows) {
    assert(BUSINESS_TABLES.includes(row.table_name));
    for (const snapshot of [row.old_row, row.new_row]) {
      if (snapshot) assert.equal(snapshot.team_id, client.teamId);
    }
  }
};

const summarizeLatencies = (latencies: number[]) => {
  const sorted = [...latencies].sort((left, right) => left - right);
  const percentile = (fraction: number) =>
    Number(sorted[Math.ceil(sorted.length * fraction) - 1]!.toFixed(2));
  return { samples: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
};
