import { DboBuilder, TableSchema } from "../DboBuilder";
import { JOIN_TYPES, Join } from "../Prostgles";
import { findShortestPath } from "../shortestPath";
import { JoinPaths } from "./ViewHandler/ViewHandler";

export async function parseJoins(this: DboBuilder): Promise<JoinPaths> {
  if (this.prostgles.opts.joins) {
    let _joins = await this.prostgles.opts.joins;
    if (!this.tablesOrViews) throw new Error("Could not create join config. this.tablesOrViews missing");
    const inferredJoins = await getInferredJoins2(this.tablesOrViews);
    if (_joins === "inferred") {
      _joins = inferredJoins
      /* If joins are specified then include inferred joins except the explicit tables */
    } else if (Array.isArray(_joins)) {
      const joinTables = _joins.map(j => j.tables).flat();
      _joins = _joins.concat(inferredJoins.filter(j => !j.tables.find(t => joinTables.includes(t))))
    } else if (_joins) {
      throw new Error("Unexpected joins init param. Expecting 'inferred' OR joinConfig but got: " + JSON.stringify(_joins))
    }
    const joins = JSON.parse(JSON.stringify(_joins)) as Join[];
    this.joins = joins;

    // Validate joins
    try {
      const tovNames = this.tablesOrViews!.map(t => t.name);

      // 2 find incorrect tables
      const missing = joins.flatMap(j => j.tables).find(t => !tovNames.includes(t));
      if (missing) {
        throw "Table not found: " + missing;
      }

      // 3 find incorrect fields
      joins.map(({ tables, on }) => {
        const t1 = tables[0],
          t2 = tables[1];
        on.map(cond => {

          const f1s = Object.keys(cond),
            f2s = Object.values(cond);
          [[t1, f1s], [t2, f2s]].map(v => {
            const t = <string>v[0],
              f = <string[]>v[1];

            const tov = this.tablesOrViews!.find(_t => _t.name === t);
            if (!tov) throw "Table not found: " + t;
            const m1 = f.filter(k => !tov!.columns.map(c => c.name).includes(k))
            if (m1 && m1.length) {
              throw `Table ${t}(${tov.columns.map(c => c.name).join()}) has no fields named: ${m1.join()}`;
            }
          });
        })
      });

      // 4 find incorrect/missing join types
      const expected_types = " \n\n-> Expecting: " + JOIN_TYPES.map(t => JSON.stringify(t)).join(` | `)
      const mt = joins.find(j => !j.type);
      if (mt) throw "Join type missing for: " + JSON.stringify(mt, null, 2) + expected_types;

      const it = joins.find(j => !JOIN_TYPES.includes(j.type));
      if (it) throw "Incorrect join type for: " + JSON.stringify(it, null, 2) + expected_types;

    } catch (e) {
      const errMsg = ((_joins as any) === "inferred"? "INFERRED " : "") + "JOINS VALIDATION ERROR \n-> " + e;
      throw errMsg;
    }

    // Make joins graph
    this.joinGraph = {};
    this.joins.forEach(({ tables }) => {
      const _t = tables.slice().sort(),
        t1 = _t[0]!,
        t2 = _t[1]!;

      if (t1 === t2) return;

      this.joinGraph![t1] ??= {};
      this.joinGraph![t1]![t2] = 1;

      this.joinGraph![t2] ??= {};
      this.joinGraph![t2]![t1] = 1;
    });
    const tables = Array.from(new Set(this.joins.flatMap(t => t.tables)));
    this.joinPaths = [];
    tables.forEach((t1, i1) => {
      tables.forEach((t2, i2) => {

        /** Prevent recursion */
        if (
          t1 === t2 ||
          this.joinPaths.some(jp => {
            if (arrayValuesMatch([jp.t1, jp.t2], [t1, t2])) {
              const spath = findShortestPath(this.joinGraph!, t1, t2);
              if (spath && arrayValuesMatch(spath.path, jp.path)) {
                return true;
              }
            }
          })
        ) {
          return;
        }

        const spath = findShortestPath(this.joinGraph!, t1, t2);
        if (!(spath && spath.distance < Infinity)) return;

        const existing1 = this.joinPaths.find(j => j.t1 === t1 && j.t2 === t2)
        if (!existing1) {
          this.joinPaths.push({ t1, t2, path: spath.path.slice() });
        }

        const existing2 = this.joinPaths.find(j => j.t2 === t1 && j.t1 === t2);
        if (!existing2) {
          this.joinPaths.push({ t1: t2, t2: t1, path: spath.path.slice().reverse() });
        }
      });
    });
  }

  return this.joinPaths;
}


const arrayValuesMatch = <T>(arr1: T[], arr2: T[]): boolean => {
  return arr1.slice().sort().join() === arr2.slice().sort().join()
}

async function getInferredJoins2(schema: TableSchema[]): Promise<Join[]> {
  const joins: Join[] = [];
  const upsertJoin = (t1: string, t2: string, cols: { col1: string; col2: string }[], type: Join["type"]) => {
    const existingIdx = joins.findIndex(j => arrayValuesMatch(j.tables.slice(0), [t1, t2]));
    const existing = joins[existingIdx];
    const normalCond = cols.reduce((a, v) => ({ ...a, [v.col1]: v.col2 }), {});
    const revertedCond = cols.reduce((a, v) => ({ ...a, [v.col2]: v.col1 }), {});
    if (existing) {
      const isLTR = existing.tables[0] === t1
      const cond = isLTR ? normalCond : revertedCond;

      /** At some point we should add relationship type to EACH JOIN CONDITION GROUP */
      // const fixedType = isLTR? type : type.split("").reverse().join("") as Join["type"];

      /** Avoid duplicates */
      if (!existing.on.some(_cond => JSON.stringify(_cond) === JSON.stringify(cond))) {
        existing.on.push(cond);
        joins[existingIdx] = existing;
      }
    } else {
      joins.push({
        tables: [t1, t2],
        on: [normalCond],
        type
      })
    }
  }
  schema.map(tov => {
    tov.columns.map(col => {
      if (col.references) {
        col.references.forEach(r => {
          const joinCols = r.cols.map((c, i) => ({ col1: c, col2: r.fcols[i]! }));
          let type: Join["type"] = "one-many";
          const ftablePkeys = schema.find(_tov => _tov.name === r.ftable)?.columns.filter(fcol => fcol.is_pkey);
          if (ftablePkeys?.length && ftablePkeys.every(fkey => r.fcols.includes(fkey.name))) {
            type = "one-one";
          }
          upsertJoin(tov.name, r.ftable, joinCols, type)
        })
      }
    })
  })
  return joins;
}