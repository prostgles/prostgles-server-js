import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import prostgles, { type InitResult, type ProstglesInitOptions } from "prostgles-server";
import type { SelectRule } from "prostgles-server/dist/PublishParser/publishTypesAndUtils";
import type { DB } from "prostgles-server/dist/Prostgles";
import type { ClientHandlers } from "prostgles-server/dist/WebsocketAPI/getClientHandlers";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { AnyObject, SelectParams } from "prostgles-types";
import { getSelectBenchmarkVariants } from "./selectBenchmarkVariants";

// SELECT_BENCHMARK_ROWS defaults to 1 million; SELECT_BENCHMARK_SAMPLES defaults to 10.
// SELECT_BENCHMARK_REPORT_PATH saves SQL, EXPLAIN plans, timings and regression failures.
// SELECT_BENCHMARK_VARIANTS=1 also measures fixture-specific SQL optimization prototypes.
// No planner settings are overridden. Timings are warm-cache, serial requests without transport.
export const testSelectBenchmark = async (parentDb: DB) => {
  await test(
    "select ABAC preserves selective index access at scale",
    { timeout: 300_000 },
    async (t) => {
      const rowCount = Number(process.env.SELECT_BENCHMARK_ROWS || 1_000_000);
      const samples = Number(process.env.SELECT_BENCHMARK_SAMPLES || 10);
      assert(Number.isSafeInteger(rowCount) && rowCount >= 100_000);
      assert(Number.isSafeInteger(samples) && samples >= 5);
      const schemaName = "select_abac_benchmark";
      await parentDb.none(`CREATE SCHEMA ${schemaName}`);
      let instance: InitResult | undefined;
      try {
        await seedBenchmark(parentDb, schemaName, rowCount);
        // Prove the index check rejects both a lost index and an unbounded index scan.
        const lookupIndex = { expectedIndexes: ["records_pkey"], indexCondition: "id = 605" };
        for (const query of [
          `SELECT * FROM ${schemaName}.records WHERE id + 0 = 605`,
          `SELECT id FROM ${schemaName}.records ORDER BY id`,
        ]) {
          const plan = await explain(parentDb, query);
          const nodes = flattenPlan(plan.Plan);
          if (query.includes("ORDER BY")) {
            assert(getIndexes(nodes).includes("records_pkey"), "Control must scan the index");
          } else {
            assert(nodes.some((node) => node["Node Type"] === "Seq Scan"));
          }
          assert(!usesExpectedIndex(nodes, lookupIndex), `Index check accepted ${query}`);
        }
        instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(parentDb),
            options: `-c search_path=${schemaName},public -c statement_timeout=30000`,
          } as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { [schemaName]: 1 },
          joins: "inferred",
          auth: { getUser: () => undefined, findUser: () => ({ id: "7", type: "user" }) },
          publish: {},
          // This isolated fixture permits SQL solely to capture statements from the client path.
          publishRawSQL: () => true,
          onReady: () => {},
        });
        const measurements = [];
        const failures: string[] = [];
        for (const policy of getPolicies()) {
          await instance.update({
            publish: { records: { select: policy.select } },
          });
          const client: ClientHandlers = await instance.getClientDBHandlers(
            { userId: "7" },
            undefined,
          );
          assert.equal(client.clientSchema.err, undefined);
          const find: NonNullable<ClientHandlers["clientDb"][string]["find"]> =
            client.clientDb.records!.find!;
          const projection = `id, tenant_id, status, title, ${policy.emailExpression} AS email`;

          // Check denied rows and masked values independently of the performance measurements.
          const expectedVisibility: AnyObject[] = await instance._db.any(`
          SELECT ${projection} FROM records
          WHERE (${policy.rowCondition}) AND id IN (605, 705, 601, 701) ORDER BY id
        `);
          assert(expectedVisibility.length > 0);
          assert.deepEqual(
            await find({ id: { $in: [605, 705, 601, 701] } }, { select: FIELDS, orderBy: "id" }),
            expectedVisibility,
            `${policy.name}: row visibility and masking`,
          );
          if (policy.name !== "single rule") {
            assert.deepEqual(await find({ email: "person705@example.test" }), []);
          }

          for (const scenario of getScenarios(rowCount, policy)) {
            const label = `${policy.name}: ${scenario.name}`;
            const params: SelectParams = {
              select: FIELDS,
              limit: 50,
              ...scenario.params,
            };
            const sql: unknown = await find(scenario.filter, {
              ...params,
              returnType: "statement-no-rls",
            });
            assert(typeof sql === "string");
            const baselineSql = `SELECT ${projection} FROM records
            WHERE (${policy.rowCondition}) AND (${scenario.baselineFilter}) ${scenario.suffix}`;
            const expected: AnyObject[] = await instance._db.any(baselineSql);
            assert.equal(expected.length, scenario.expectedRows, `${label}: fixture cardinality`);
            const request = () => find(scenario.filter, params);
            assert.deepEqual(await request(), expected, `${label}: baseline equivalence`);
            assert.deepEqual(
              await instance._db.any(sql),
              expected,
              `${label}: captured SQL equivalence`,
            );

            const baselineTimes: number[] = [];
            const abacTimes: number[] = [];
            const requestTimes: number[] = [];
            // Warm both SQL forms, then alternate order to reduce cache/order bias.
            for (let iteration = -2; iteration < samples; iteration++) {
              const baselineRun = () =>
                measure(() => instance!._db.any(baselineSql), baselineTimes, iteration);
              const abacRun = () => measure(() => instance!._db.any(sql), abacTimes, iteration);
              if (iteration % 2) {
                await baselineRun();
                await abacRun();
              } else {
                await abacRun();
                await baselineRun();
              }
              await measure(request, requestTimes, iteration);
            }
            const baseline = await explain(instance._db, baselineSql);
            const abac = await explain(instance._db, sql);
            const baselineNodes = flattenPlan(baseline.Plan);
            const abacNodes = flattenPlan(abac.Plan);
            const baselineIndexes = getIndexes(baselineNodes);
            const abacIndexes = getIndexes(abacNodes);
            const baselineRowsVisited = getRowsVisited(baselineNodes);
            const abacRowsVisited = getRowsVisited(abacNodes);
            const baselineBlocks = getBlocks(baseline.Plan);
            const abacBlocks = getBlocks(abac.Plan);
            const scenarioFailures: string[] = [];
            // Validate the control as well: an unindexed control must never make ABAC look healthy.
            if (!usesExpectedIndex(baselineNodes, scenario)) {
              scenarioFailures.push(
                `control did not use ${scenario.expectedIndexes.join(" or ")} with ${scenario.indexCondition}`,
              );
            }
            if (!usesExpectedIndex(abacNodes, scenario)) {
              scenarioFailures.push(
                `lost indexed predicate ${scenario.indexCondition} on ${scenario.expectedIndexes.join(" or ")}; used ${abacIndexes.join(", ") || "no indexes"}`,
              );
            }
            if (
              abacNodes.some(
                (node) => node["Relation Name"] === "records" && node["Node Type"] === "Seq Scan",
              )
            ) {
              scenarioFailures.push("sequential scan of records");
            }
            // Index presence alone is insufficient: a full index scan can be just as expensive.
            if (abacRowsVisited > Math.max(1_000, baselineRowsVisited * 20)) {
              scenarioFailures.push(
                `visited ${abacRowsVisited} record rows (control ${baselineRowsVisited})`,
              );
            }
            if (abacBlocks > Math.max(2_000, baselineBlocks * 20)) {
              scenarioFailures.push(
                `accessed ${abacBlocks} shared blocks (control ${baselineBlocks})`,
              );
            }
            const requestLatency = summarize(requestTimes);
            if (requestLatency.p95Ms > 500) {
              scenarioFailures.push(`request p95 ${requestLatency.p95Ms}ms exceeds 500ms`);
            }
            failures.push(...scenarioFailures.map((failure) => `${label}: ${failure}`));
            const variants = [];
            if (process.env.SELECT_BENCHMARK_VARIANTS === "1" && Array.isArray(policy.select)) {
              for (const variant of getSelectBenchmarkVariants({
                sql,
                commonFields: PUBLIC_FIELDS,
                emailExpression: policy.emailExpression,
                equivalentFilter: scenario.baselineFilter,
                suffix: scenario.suffix,
              })) {
                assert.deepEqual(
                  await instance._db.any(variant.sql),
                  expected,
                  `${label}: ${variant.name} equivalence`,
                );
                const times: number[] = [];
                for (let iteration = -2; iteration < samples; iteration++) {
                  await measure(() => instance!._db.any(variant.sql), times, iteration);
                }
                const plan = await explain(instance._db, variant.sql);
                const nodes = flattenPlan(plan.Plan);
                variants.push({
                  ...variant,
                  latency: summarize(times),
                  indexes: getIndexes(nodes),
                  rowsVisited: getRowsVisited(nodes),
                  sharedBlocks: getBlocks(plan.Plan),
                  explain: plan,
                });
              }
            }
            measurements.push({
              policy: policy.name,
              scenario: scenario.name,
              returnedRows: expected.length,
              baseline: {
                sql: baselineSql,
                latency: summarize(baselineTimes),
                indexes: baselineIndexes,
                rowsVisited: baselineRowsVisited,
                sharedBlocks: baselineBlocks,
                explain: baseline,
              },
              abac: {
                sql,
                latency: summarize(abacTimes),
                requestLatency,
                indexes: abacIndexes,
                rowsVisited: abacRowsVisited,
                sharedBlocks: abacBlocks,
                explain: abac,
              },
              failures: scenarioFailures,
              ...(variants.length ? { variants } : {}),
            });
          }
        }
        const report = {
          postgres: (await instance._db.one<{ version: string }>("SELECT version() AS version"))
            .version,
          rowCount,
          samples,
          measurements,
          failures,
        };
        if (process.env.SELECT_BENCHMARK_REPORT_PATH) {
          writeFileSync(process.env.SELECT_BENCHMARK_REPORT_PATH, JSON.stringify(report, null, 2));
        }
        for (const { policy, scenario, baseline, abac } of measurements) {
          t.diagnostic(
            JSON.stringify({
              policy,
              scenario,
              baselineMs: baseline.latency,
              abacMs: abac.latency,
              requestMs: abac.requestLatency,
              indexes: abac.indexes,
              rowsVisited: abac.rowsVisited,
            }),
          );
        }
        assert.deepEqual(
          failures,
          [],
          "ABAC select performance regressions (full workload collected before failure)",
        );
      } finally {
        await instance?.destroy();
        await parentDb.none(`DROP SCHEMA ${schemaName} CASCADE`);
      }
    },
  );
};

const FIELDS = ["id", "tenant_id", "status", "title", "email"];
const PUBLIC_FIELDS = FIELDS.filter((field) => field !== "email");
type Policy = {
  name: string;
  select: SelectRule | SelectRule[];
  rowCondition: string;
  emailExpression: string;
  emailFilter: string;
};

const getPolicies = (): Policy[] => {
  const tenantRule: SelectRule = {
    fields: PUBLIC_FIELDS,
    forcedFilter: { tenant_id: 42 },
  };
  const ownerRule: SelectRule = {
    fields: FIELDS,
    forcedFilter: { tenant_id: 42, owner_id: 7 },
  };
  const maskedEmail = "CASE WHEN tenant_id = 42 AND owner_id = 7 THEN email END";
  const sharedCondition =
    "EXISTS (SELECT 1 FROM shares WHERE shares.record_id = records.id AND shares.user_id = 7)";
  return [
    {
      name: "single rule",
      select: { fields: FIELDS, forcedFilter: { tenant_id: 42 } },
      rowCondition: "tenant_id = 42",
      emailExpression: "email",
      emailFilter: "email = 'person605@example.test'",
    },
    {
      name: "tenant and owner (2 grants)",
      select: [tenantRule, ownerRule],
      rowCondition: "tenant_id = 42",
      emailExpression: maskedEmail,
      emailFilter: "tenant_id = 42 AND owner_id = 7 AND email = 'person605@example.test'",
    },
    {
      name: "team roles (16 grants)",
      select: [
        ...Array.from({ length: 15 }, (_, index) => ({
          fields: PUBLIC_FIELDS,
          forcedFilter: { tenant_id: 42, owner_id: index + 1 },
        })),
        ownerRule,
      ],
      rowCondition: "tenant_id = 42 AND owner_id BETWEEN 1 AND 15",
      emailExpression: maskedEmail,
      emailFilter: "tenant_id = 42 AND owner_id = 7 AND email = 'person605@example.test'",
    },
    {
      name: "tenant, owner and shared records (3 grants)",
      select: [
        tenantRule,
        ownerRule,
        {
          fields: PUBLIC_FIELDS,
          forcedFilter: { $existsJoined: { shares: { user_id: 7 } } },
        },
      ],
      rowCondition: `(tenant_id = 42 OR ${sharedCondition})`,
      emailExpression: maskedEmail,
      emailFilter: "tenant_id = 42 AND owner_id = 7 AND email = 'person605@example.test'",
    },
  ];
};

type Scenario = {
  name: string;
  filter: AnyObject;
  params: SelectParams;
  baselineFilter: string;
  suffix: string;
  expectedIndexes: string[];
  indexCondition: string;
  expectedRows: number;
};

const getScenarios = (rowCount: number, policy: Policy): Scenario[] => [
  {
    name: "primary key lookup",
    filter: { id: 605 },
    params: {},
    baselineFilter: "id = 605",
    suffix: "LIMIT 50",
    expectedIndexes: ["records_pkey"],
    indexCondition: "id = 605",
    expectedRows: 1,
  },
  {
    name: "email lookup",
    filter: { email: "person605@example.test" },
    params: {},
    baselineFilter: policy.emailFilter,
    suffix: "LIMIT 50",
    expectedIndexes: ["records_email_idx"],
    indexCondition: "email = 'person605@example.test'",
    expectedRows: 1,
  },
  {
    name: "tenant keyset page",
    filter: { tenant_id: 42, status: "open", id: { $lt: rowCount - 1_000 } },
    params: { orderBy: { id: -1 } },
    baselineFilter: `tenant_id = 42 AND status = 'open' AND id < ${rowCount - 1_000}`,
    suffix: "ORDER BY id DESC LIMIT 50",
    // A backward primary-key scan is also efficient for this large tenant; bound its work above.
    expectedIndexes: ["records_tenant_status_id_idx", "records_pkey"],
    indexCondition: `id < ${rowCount - 1_000}`,
    expectedRows: 50,
  },
];

const seedBenchmark = async (db: DB, schemaName: string, rowCount: number) => {
  await db.none(
    `
    CREATE TABLE ${schemaName}.records (
      id int PRIMARY KEY, tenant_id int NOT NULL, owner_id int NOT NULL,
      status text NOT NULL, title text NOT NULL, email text NOT NULL, body text NOT NULL
    );
    CREATE TABLE ${schemaName}.shares (
      record_id int REFERENCES ${schemaName}.records, user_id int NOT NULL,
      PRIMARY KEY (record_id, user_id)
    );
    INSERT INTO ${schemaName}.records
    SELECT row_id, CASE WHEN row_id % 5 = 0 THEN 42 ELSE row_id % 100 + 1 END,
      (row_id / 100) % 50 + 1,
      CASE WHEN row_id % 3 = 0 THEN 'closed' ELSE 'open' END,
      'Record ' || row_id, 'person' || row_id || '@example.test', repeat(md5(row_id::text), 16)
    FROM generate_series(1, $1::int) row_id;
    INSERT INTO ${schemaName}.shares
    SELECT id, owner_id FROM ${schemaName}.records;
    CREATE INDEX records_email_idx ON ${schemaName}.records (email);
    CREATE INDEX records_tenant_status_id_idx ON ${schemaName}.records (tenant_id, status, id DESC);
    CREATE INDEX shares_user_record_idx ON ${schemaName}.shares (user_id, record_id);
  `,
    [rowCount],
  );
  // Let PostgreSQL consider index-only scans and use real distribution statistics.
  await db.none(`VACUUM ANALYZE ${schemaName}.records`);
  await db.none(`VACUUM ANALYZE ${schemaName}.shares`);
};

type PlanNode = {
  "Node Type": string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Index Cond"?: string;
  "Rows Removed by Filter"?: number;
  "Rows Removed by Index Recheck"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
};
type Explain = {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
};

const explain = async (db: DB, sql: string): Promise<Explain> => {
  const result = await db.one<{ "QUERY PLAN": Explain[] }>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON, TIMING OFF) ${sql}`,
  );
  return result["QUERY PLAN"][0]!;
};
const flattenPlan = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(flattenPlan),
];
const getIndexes = (nodes: PlanNode[]) => [
  ...new Set(nodes.flatMap((node) => (node["Index Name"] ? [node["Index Name"]] : []))),
];
const usesExpectedIndex = (
  nodes: PlanNode[],
  { expectedIndexes, indexCondition }: Pick<Scenario, "expectedIndexes" | "indexCondition">,
) =>
  nodes.some(
    (node) =>
      node["Actual Loops"] > 0 &&
      expectedIndexes.includes(node["Index Name"] ?? "") &&
      node["Index Cond"]?.includes(indexCondition),
  );
const getBlocks = (node: PlanNode) =>
  (node["Shared Hit Blocks"] ?? 0) + (node["Shared Read Blocks"] ?? 0);
const getRowsVisited = (nodes: PlanNode[]) =>
  nodes
    .filter((node) => node["Relation Name"] === "records")
    .reduce(
      (total, node) =>
        total +
        node["Actual Loops"] *
          (node["Actual Rows"] +
            (node["Rows Removed by Filter"] ?? 0) +
            (node["Rows Removed by Index Recheck"] ?? 0)),
      0,
    );
const measure = async (run: () => Promise<unknown>, times: number[], iteration: number) => {
  const started = performance.now();
  await run();
  if (iteration >= 0) times.push(performance.now() - started);
};
const summarize = (times: number[]) => {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    p50Ms: Number(sorted[Math.ceil(sorted.length * 0.5) - 1]!.toFixed(3)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1]!.toFixed(3)),
  };
};
