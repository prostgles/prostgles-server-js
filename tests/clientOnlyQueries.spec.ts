import { strict as assert } from "assert";
import type { DBHandlerClient, AuthHandler } from "./client";
import { AnyObject, DBSchemaTable, SocketSQLStreamPacket, isDefined } from "prostgles-types";
import { tryRun, tryRunP } from "./isomorphicQueries.spec";
import { describe, test } from "node:test";

export const clientOnlyQueries = async (
  db: DBHandlerClient,
  auth: AuthHandler,
  log: (...args: any[]) => any,
  methods,
  tableSchema: DBSchemaTable[],
  token: string
) => {
  await describe("Client only queries", async (t) => {
    // await test("Social auth redirect routes work", async ( ) => {
    //   assert.equal(!!auth.login.withProvider.github, true);
    //   const response = await fetch("http://localhost:3001/auth/github");
    //   assert.equal(response.status, 302);
    // });

    await test("SQL Stream more than 1k records", async () => {
      const expectedRowCount = 2e3;
      await tryRunP("", async (resolve, reject) => {
        let rows: any[] = [];
        const res = await db.sql!(
          `SELECT * FROM generate_series(1, ${expectedRowCount})`,
          {},
          { returnType: "stream" }
        );
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            if (packet.rows) {
              rows = [...rows, ...packet.rows];
            }
            if (packet.ended) {
              assert.equal(packet.ended, true);
              assert.equal(rows.length, expectedRowCount);
              resolve("ok");
            }
          }
        };
        await res.start(listener);
      });
    });

    await test("SQL Stream persistedConnection with streamLimit works for subsequent queries", async () => {
      await tryRunP("", async (resolve, reject) => {
        const query = "SELECT * FROM generate_series(1, 100)";
        let results: any[] = [];
        const streamLimit = 10;
        const res = await db.sql!(
          query,
          {},
          { returnType: "stream", persistStreamConnection: true, streamLimit }
        );
        const listener = async (packet: SocketSQLStreamPacket) => {
          try {
            if (packet.type === "error") {
              reject(packet.error);
            } else {
              results = results.concat(packet.rows);
              if (results.length === streamLimit) {
                assert.equal(packet.type, "data");
                assert.equal(packet.ended, true);
                assert.equal(packet.rows.length, 10);
                startHandler.run(`SELECT '${query}' as query`).catch(reject);
              } else {
                assert.equal(packet.type, "data");
                assert.equal(packet.ended, true);
                assert.equal(packet.rows.length, 1);
                assert.equal(packet.rows[0][0], query);
                resolve("ok");
              }
            }
          } catch (err) {
            reject(err);
          }
        };
        const startHandler = await res.start(listener);
      });
    });

    await test("SQL Stream ensure the connection is never released (same pg_backend_pid is the same for subsequent) when using persistConnectionId", async () => {
      await tryRunP("", async (resolve, reject) => {
        const query = "SELECT pg_backend_pid()";
        const res = await db.sql!(
          query,
          {},
          { returnType: "stream", persistStreamConnection: true }
        );
        const pids: number[] = [];
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.equal(packet.rows.length, 1);
            const pid = packet.rows[0][0];
            pids.push(pid);
            if (pids.length === 1) {
              startHandler.run(query).catch(reject);
            }
            if (pids.length === 2) {
              assert.equal(pids[0], pids[1]);
              resolve("ok");
            }
          }
        };
        const startHandler = await res.start(listener);
      });
    });

    await test("SQL Stream stop kills the query", async () => {
      await tryRunP("", async (resolve, reject) => {
        const query = "SELECT * FROM pg_sleep(5)";
        const res = await db.sql!(query, {}, { returnType: "stream" });
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            const queryState = await db.sql!(
              "SELECT * FROM pg_stat_activity WHERE query = $1",
              [query],
              { returnType: "rows" }
            );
            assert.equal(queryState.length, 1);
            assert.equal(queryState[0].state, "idle");
            assert.equal(packet.error.message, "canceling statement due to user request");
            resolve("ok");
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.deepStrictEqual(packet.rows, [[""]]);
            reject("SQL Stream stop kills the query");
          }
        };
        const startHandler = await res.start(listener);
        setTimeout(() => {
          startHandler.stop().catch(reject);
        }, 1000);
      });
    });

    await test("SQL Stream limit works", async () => {
      await tryRunP("", async (resolve, reject) => {
        const res = await db.sql!(
          "SELECT * FROM generate_series(1, 1e5)",
          {},
          { returnType: "stream", streamLimit: 10 }
        );
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.equal(packet.rows.length, 10);
            resolve("ok");
          }
        };
        await res.start(listener);
      });
    });

    await test("SQL Stream stop with terminate kills the query", async () => {
      await tryRunP("", async (resolve, reject) => {
        const totalRows = 5e6;
        const query = `SELECT * FROM generate_series(1, ${totalRows})`;
        const res = await db.sql!(query, {}, { returnType: "stream" });
        const rowsReceived: any[] = [];
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            const queryState = await db.sql!(
              "SELECT * FROM pg_stat_activity WHERE query = $1",
              [query],
              { returnType: "rows" }
            );
            assert.equal(queryState.length, 0);
            resolve("ok");
          } else {
            try {
              rowsReceived.push(...packet.rows);
              console.log(rowsReceived.length);
              assert.equal(packet.ended, false);
              assert.equal(rowsReceived.length < totalRows, true);
            } catch (error) {
              reject(error);
            }
          }
        };
        const startHandler = await res.start(listener);
        setTimeout(() => {
          startHandler.stop(true).catch(reject);
        }, 22);
      });
    });

    await test("SQL Stream", async () => {
      await Promise.all(
        [1e3, 1e2].map(async (numberOfRows) => {
          await tryRunP("", async (resolve, reject) => {
            const res = await db.sql!(
              `SELECT v.* FROM generate_series(1, ${numberOfRows}) v`,
              {},
              { returnType: "stream" }
            );
            let rows: any[] = [];
            const listener = async (packet: SocketSQLStreamPacket) => {
              if (packet.type === "error") {
                reject(packet.error);
              } else {
                rows = rows.concat(packet.rows);
                if (packet.ended) {
                  assert.equal(rows.length, numberOfRows);
                  resolve("ok");
                }
              }
            };
            await res.start(listener);
          });
        })
      );
    });

    await test("SQL Stream parallel execution + parameters", async () => {
      await tryRunP("", async (resolve, reject) => {
        const getExpected = (val: string) =>
          new Promise(async (resolve, reject) => {
            const res = await db.sql!("SELECT ${val} as val", { val }, { returnType: "stream" });
            const listener = async (packet: SocketSQLStreamPacket) => {
              try {
                assert.equal(packet.type, "data");
                assert.equal(packet.ended, true);
                assert.deepStrictEqual(packet.rows, [[val]]);
                resolve(1);
              } catch (err) {
                reject(err);
              }
            };
            await res.start(listener);
          });
        let resolved = 0;
        const expected = ["a", "b", "c"];
        expected.forEach((val) => {
          getExpected(val)
            .then(() => {
              resolved++;
              if (resolved === expected.length) {
                resolve("ok");
              }
            })
            .catch(reject);
        });
      });
    });
    await test("SQL Stream query error structure matches default sql run error", async () => {
      await tryRunP("", async (resolve, reject) => {
        const badQuery = "SELECT * FROM not_existing_table";
        const res = await db.sql!(badQuery, {}, { returnType: "stream" });
        const listener = async (packet: SocketSQLStreamPacket) => {
          try {
            const normalSqlError = await db.sql!(badQuery, {}).catch((err) => err);
            assert.equal(packet.type, "error");
            assert.equal(packet.error.message, 'relation "not_existing_table" does not exist');
            assert.deepEqual(packet.error, normalSqlError);
            resolve("ok");
          } catch (err) {
            reject(err);
          }
        };
        await res.start(listener);
      });
    });
    await test("SQL Stream streamLimit", async () => {
      await tryRunP("", async (resolve, reject) => {
        const generate_series = "SELECT * FROM generate_series(1, 100)";
        const res = await db.sql!(generate_series, {}, { returnType: "stream", streamLimit: 10 });
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.equal(packet.rows.length, 10);

            const normalSql = await db.sql!(generate_series, {});

            /** fields the same as on normal sql request */
            assert.deepStrictEqual(packet.fields, normalSql.fields);

            /** result is rowMode=array */
            assert.equal(Array.isArray(packet.rows), true);
            assert.equal(Array.isArray(packet.rows[0]), true);

            assert.deepStrictEqual(
              packet.rows.flat(),
              Array.from({ length: 10 }, (_, i) => i + 1).flat()
            );
            resolve("ok");
          }
        };
        await res.start(listener);
      });
    });

    await test("SQL Stream table fields are the same as on default request", async () => {
      await tryRunP("", async (resolve, reject) => {
        await db.sql!("TRUNCATE planes RESTART IDENTITY CASCADE;", {});
        await db.sql!("INSERT INTO planes (last_updated) VALUES (56789);", {});
        const res = await db.sql!("SELECT * FROM planes", {}, { returnType: "stream" });
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.equal(packet.rows.length, 1);
            const normalSql = await db.sql!("SELECT * FROM planes LIMIT 1", {});
            await db.sql!("DELETE FROM planes", {});
            assert.deepStrictEqual(packet.fields, normalSql.fields);
            assert.equal(packet.fields.length > 0, true);
            resolve("ok");
          }
        };
        await res.start(listener);
      });
    });
    await test("SQL Stream works for multiple statements", async () => {
      await tryRunP("", async (resolve, reject) => {
        const res = await db.sql!(
          "SELECT * FROM planes; SELECT 1 as a",
          {},
          { returnType: "stream" }
        );
        const listener = async (packet: SocketSQLStreamPacket) => {
          if (packet.type === "error") {
            reject(packet.error);
          } else {
            assert.equal(packet.type, "data");
            assert.equal(packet.ended, true);
            assert.equal(packet.rows.length, 1);
            const normalSql = await db.sql!("SELECT 1 as a", {});
            await db.sql!("DELETE FROM planes", {});
            assert.deepStrictEqual(packet.fields, normalSql.fields);
            assert.equal(packet.fields.length > 0, true);
            resolve("ok");
          }
        };
        await res.start(listener);
      });
    });

    /**
     * tableSchema must contan an array of all tables and their columns that have getInfo and getColumns allowed
     */
    await test("Check tableSchema", async () => {
      const dbTables = Object.keys(db)
        .map((k) => {
          const h = db[k];
          return !!(h.getColumns && h.getInfo) ? k : undefined;
        })
        .filter(isDefined);
      const missingTbl = dbTables.find((t) => !tableSchema.some((st) => st.name === t));
      if (missingTbl)
        throw `${missingTbl} is missing from tableSchema: ${JSON.stringify(tableSchema)}`;
      const missingscTbl = tableSchema.find((t) => !dbTables.includes(t.name));
      if (missingscTbl) throw `${missingscTbl} is missing from db`;

      await Promise.all(
        tableSchema.map(async (tbl) => {
          const cols = await db[tbl.name]?.getColumns?.();
          const info = await db[tbl.name]?.getInfo?.();
          assert.deepStrictEqual(tbl.columns, cols);
          assert.deepStrictEqual(tbl.info, info);
        })
      );
    });

    const testRealtime = () => {
      return new Promise(async (resolveTest, rejectTest) => {
        try {
          /* DB_HANDLER */
          const t222 = await methods.myfunc.run();
          assert.equal(t222, 222, "methods.myfunc() failed");

          /* RAWSQL */
          await tryRun("SQL Full result", async () => {
            if (!db.sql) throw "db.sql missing";
            const sqlStatement = await db.sql("SELECT $1", [1], {
              returnType: "statement",
            });
            assert.equal(sqlStatement, "SELECT 1", "db.sql statement query failed");

            await db.sql("SELECT 1 -- ${param}", {}, { hasParams: false });

            const arrayMode = await db.sql("SELECT 1 as a, 2 as a", undefined, {
              returnType: "arrayMode",
            });
            assert.equal(arrayMode.rows?.[0].join("."), "1.2", "db.sql statement arrayMode failed");
            assert.equal(
              arrayMode.fields?.map((f) => f.name).join("."),
              "a.a",
              "db.sql statement arrayMode failed"
            );

            const select1 = await db.sql("SELECT $1 as col1", [1], {
              returnType: "rows",
            });
            assert.deepStrictEqual(select1[0], { col1: 1 }, "db.sql justRows query failed");

            const fullResult = await db.sql("SELECT $1 as col1", [1]);
            // console.log(fullResult)
            assert.deepStrictEqual(fullResult.rows[0], { col1: 1 }, "db.sql query failed");
            assert.deepStrictEqual(
              fullResult.fields,
              [
                {
                  name: "col1",
                  tableID: 0,
                  columnID: 0,
                  dataTypeID: 23,
                  dataTypeSize: 4,
                  dataTypeModifier: -1,
                  format: "text",
                  dataType: "int4",
                  udt_name: "int4",
                  tsDataType: "number",
                },
              ],
              "db.sql query failed"
            );
          });

          await tryRunP("sql LISTEN NOTIFY events", async (resolve, reject) => {
            if (!db.sql) throw "db.sql missing";

            try {
              const sub = await db.sql(
                "LISTEN chnl ",
                {},
                { allowListen: true, returnType: "arrayMode" }
              );
              if (!("addListener" in sub)) {
                reject("addListener missing");
                return;
              }

              sub.addListener((notif) => {
                const expected = "hello";
                if (notif === expected) resolve(true);
                else
                  reject(
                    `Notif value is not what we expect: ${JSON.stringify(notif)} is not ${JSON.stringify(expected)} (expected) `
                  );
              });
              db.sql("NOTIFY chnl , 'hello'; ");
            } catch (e) {
              reject(e);
            }
          });

          await tryRunP(
            "sql NOTICE events",
            async (resolve, reject) => {
              if (!db.sql) throw "db.sql missing";

              const sub = await db.sql("", {}, { returnType: "noticeSubscription" });

              sub.addListener((notice) => {
                const expected = "hello2";
                if (notice.message === expected) resolve(true);
                else
                  reject(
                    `Notice value is not what we expect: ${JSON.stringify(notice)} is not ${JSON.stringify(expected)} (expected) `
                  );
              });
              db.sql(`
            DO $$ 
            BEGIN

              RAISE NOTICE 'hello2';

            END $$;
          `);
            },
            { log }
          );

          /* REPLICATION */
          log("Started testRealtime");
          const start = Date.now();

          await db.planes.delete!();
          await db.sql!("TRUNCATE planes RESTART IDENTITY CASCADE;", {});
          let inserts = new Array(100).fill(null).map((d, i) => ({
            id: i,
            flight_number: `FN${i}`,
            x: Math.random(),
            y: i,
          }));
          await db.planes.insert!(inserts);

          const CLOCK_DRIFT = 2000;

          if ((await db.planes.count!()) !== 100) throw "Not 100 planes";

          /**
           * Two listeners are added at the same time to dbo.planes (which has 100 records):
           *  subscribe({ x: 10 }
           *  sync({}
           *
           * Then sync starts updating x to 10 for each record
           * subscribe waits for 100 records of x=10 and then updates everything to x=20
           * sync waits for 100 records of x=20 and finishes the test
           */

          /* After all sync records are updated to x10 here we'll update them to x20 */
          const sP = await db.planes.subscribe!({ x: 10 }, {}, async (planes) => {
            const p10 = planes.filter((p) => p.x == 10);
            log(
              Date.now() +
                ": sub stats: x10 -> " +
                p10.length +
                "    x20 ->" +
                planes.filter((p) => p.x == 20).length
            );

            if (p10.length === 100) {
              /** 2 second delay to account for client-server clock drift */
              setTimeout(async () => {
                // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(log);

                await sP.unsubscribe();
                log(Date.now() + ": sub: db.planes.update({}, { x: 20, last_updated });");
                const dLastUpdated = Math.max(...p10.map((v) => +v.last_updated));
                const last_updated = Date.now();
                if (dLastUpdated >= last_updated)
                  throw "dLastUpdated >= last_updated should not happen";
                await db.planes.update!({}, { x: 20, last_updated });
                log(Date.now() + ": sub: Updated to x20", await db.planes.count!({ x: 20 }));

                // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(log)
              }, CLOCK_DRIFT);
            }
          });

          let updt = 0;
          const sync = await db.planes.sync!(
            {},
            { handlesOnData: true, patchText: true },
            (planes, deltas) => {
              const x20 = planes.filter((p) => p.x == 20).length;
              const x10 = planes.filter((p) => p.x == 10);
              log(Date.now() + `: sync stats: x10 -> ${x10.length}  x20 -> ${x20}`);

              let update = false;
              planes.map((p) => {
                // if(p.y === 1) window.up = p;
                if (typeof p.x !== "number") log(typeof p.x);
                if (+p.x < 10) {
                  updt++;
                  update = true;
                  p.$update!({ x: 10 });
                  log(Date.now() + `: sync: p.$update({ x: 10 }); (id: ${p.id})`);
                }
              });
              // if(update) log("$update({ x: 10 })", updt)

              if (x20 === 100) {
                // log(22)
                // console.timeEnd("test")
                log(
                  Date.now() +
                    ": sync end: Finished replication test. Inserting 100 rows then updating two times took: " +
                    (Date.now() - start - CLOCK_DRIFT) +
                    "ms"
                );
                resolveTest(true);
              }
            }
          );

          const msLimit = 20000;
          setTimeout(async () => {
            const dbCounts = {
              x10: await db.planes.count!({ x: 10 }),
              x20: await db.planes.count!({ x: 20 }),
              latest: await db.planes.findOne!({}, { orderBy: { last_updated: -1 } }),
            };
            const syncCounts = {
              x10: sync?.getItems().filter((d) => d.x == 10).length,
              x20: sync?.getItems().filter((d) => d.x == 20).length,
              latest: sync?.getItems()?.sort((a, b) => +b.last_updated - +a.last_updated)[0],
            };
            const msg =
              "Replication test failed due to taking longer than " +
              msLimit +
              "ms \n " +
              JSON.stringify({ dbCounts, syncCounts }, null, 2);
            log(msg);
            rejectTest(msg);
          }, msLimit);
        } catch (err) {
          log(JSON.stringify(err));
          await tout(1000);
          throw err;
        }
      });
    };

    log("auth.user:", auth.user);

    assert.equal(auth.loginType, "email+password", "auth.login.withPassword should be defined");
    const isUser = !!auth.user;

    // Public data
    await test("Security rules example", { skip: isUser }, async () => {
      log("Checking public data");
      const vQ = await db.items4.find!({}, { select: { added: 0 } });
      assert.deepStrictEqual(vQ, [
        { id: 1, public: "public data" },
        { id: 2, public: "public data" },
      ]);

      const cols = await db.insert_rules.getColumns!();
      assert.equal(
        cols.filter(({ insert, update: u, select: s, delete: d }) => insert && !u && s && !d)
          .length,
        2,
        "Validated getColumns failed"
      );

      /* Validated insert */
      const expectB = await db.insert_rules.insert!({ name: "a" }, { returning: "*" });
      assert.deepStrictEqual(expectB, { name: "b" }, "Validated insert failed");

      /* forced UUID insert */
      const row: any = await db.uuid_text.insert!({}, { returning: "*" });
      assert.equal(row.id, "c81089e1-c4c1-45d7-a73d-e2d613cb7c3e");

      try {
        await db.insert_rules.insert!({ name: "notfail" }, { returning: "*" });
        await db.insert_rules.insert!({ name: "fail" }, { returning: "*" });
        await db.insert_rules.insert!({ name: "fail-check" }, { returning: "*" });
        throw "post insert checks should have failed";
      } catch (err) {}
      assert.equal(0, +(await db.insert_rules.count!({ name: "fail" })), "postValidation failed");
      assert.equal(
        0,
        +(await db.insert_rules.count!({ name: "fail-check" })),
        "checkFilter failed"
      );
      assert.equal(
        1,
        +(await db.insert_rules.count!({ name: "notfail" })),
        "postValidation failed"
      );
    });

    // await tryRun("Duplicate subscription", async () => {

    //   return new Promise(async (resolve, reject) => {
    //     let data1 = [], data2 = [], cntr = 0;
    //     function check(){
    //       cntr++;
    //       if(cntr === 2){
    //         assert.equal(data1.length, data2.length);
    //         console.error(data1, data2)
    //         reject( data1);
    //         resolve(data1)
    //       }
    //     }

    //     const sub1 = await db.planes.subscribe({}, {}, data => {
    //       data1 = data;
    //       check()
    //     });
    //     const sub2 = await db.planes.subscribe({}, {}, data => {
    //       data2 = data;
    //       check()
    //     });
    //   })
    // })

    await test("Realtime", { skip: isUser }, async () => {
      await testRealtime();
    });

    /* Bug: 
        doing a 
          some_table.sync({}, { handlesOnData: true }, console.log);
        will make all subsequent 
          some_table.sync({}, { handlesOnData: false }, console.log);
        return no data items
    */
    await test("sync handlesOnData true -> false no data bug", { skip: isUser }, async () => {
      let sync1Planes: AnyObject[] = [];
      let sync2Planes: AnyObject[] = [];
      const sync1 = await db.planes.sync!({}, { handlesOnData: true }, async (planes1, deltas) => {
        sync1Planes = planes1;
        log("sync handlesOnData true", planes1.length);
      });
      await tout(1000);
      const sync2 = await db.planes.sync!({}, { handlesOnData: false }, (planes2, deltas) => {
        sync2Planes = planes2;
      });
      await tout(1000);
      if (sync1Planes.length !== sync2Planes.length || sync1Planes.length === 0) {
        throw `sync2Planes.length !== 100: ${sync1Planes.length} vs ${sync2Planes.length}`;
      }
      await sync1.$unsync();
      await sync2.$unsync();
    });

    // User data
    await test("Security rules example", { skip: !isUser }, async () => {
      log("Checking User data");
      const vQ = await db.items4.find!();
      assert.deepStrictEqual(vQ, [
        { id: 1, public: "public data" },
        { id: 2, public: "public data" },
      ]);

      await db.items4.find!({}, { select: { id: 1 }, orderBy: { added: 1 } });

      const dynamicCols = await db.uuid_text.getColumns!(undefined, {
        rule: "update",
        filter: {
          id: "c81089e1-c4c1-45d7-a73d-e2d613cb7c3e",
        },
      });
      assert.equal(dynamicCols.length, 1);
      assert.equal(dynamicCols[0].name, "id");
      const defaultCols = await db.uuid_text.getColumns!(undefined, {
        rule: "update",
        filter: {
          id: "not matching",
        },
      });
      throw defaultCols.map((c) => c.name);
    });
  });
};

const tout = (t = 3000) => {
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      resolve(true);
    }, t);
  });
};
