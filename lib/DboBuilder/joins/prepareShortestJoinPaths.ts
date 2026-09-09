import { isEqual, reverseJoinOn } from "prostgles-types";
import type { DboBuilder } from "../DboBuilder";
import type { Join } from "../../ProstglesTypes";
import { JOIN_TYPES } from "../../ProstglesTypes";
import type { Graph } from "./shortestPath";
import { findShortestPath } from "./shortestPath";
import type { JoinPaths } from "../ViewHandler/ViewHandler";
import { getInferredJoins } from "./getInferredJoins";
import { sortedArraysMatch } from "../../utils/utils";

type Result = {
  joinGraph?: Graph | undefined;
  joins: Join[];
  shortestJoinPaths: JoinPaths;
};

export const prepareShortestJoinPaths = (dboBuilder: DboBuilder): Result => {
  if (!dboBuilder.prostgles.opts.joins) {
    return {
      joins: [],
      shortestJoinPaths: [],
    };
  }

  let joinConfig = dboBuilder.prostgles.opts.joins;
  if (Array.isArray(joinConfig)) {
    joinConfig.forEach((join, index, configured) => {
      const duplicate = configured
        .slice(0, index)
        .some((existing) => isEqual(existing.tables.toSorted(), join.tables.toSorted()));
      if (duplicate) {
        throw new Error(
          `Duplicate configured join for table pair ${JSON.stringify(join.tables)}. Combine conditions in a single Join.on.`,
        );
      }
    });
  }
  if (!dboBuilder.tablesOrViews) {
    throw new Error("Could not create join config. this.tablesOrViews missing");
  }

  // The initial DBO is needed by tableConfig before its tables/columns exist.
  // Defer only joins that cannot be resolved yet; the final rebuild validates all.
  if (Array.isArray(joinConfig) && dboBuilder.prostgles.preparingTableConfig) {
    const tables = dboBuilder.tablesOrViews;
    joinConfig = joinConfig.filter((join) =>
      join.tables.every((name, index) => {
        const table = tables.find((candidate) => candidate.name === name);
        return (
          table &&
          join.on.every((on) =>
            (index === 0 ? Object.keys(on) : Object.values(on)).every((column) =>
              table.columns.some((candidate) => candidate.name === column),
            ),
          )
        );
      }),
    );
  }
  const inferredJoins = getInferredJoins(dboBuilder.tablesOrViews);
  if (joinConfig === "inferred") {
    joinConfig = inferredJoins;
  } else if (Array.isArray(joinConfig)) {
    joinConfig = mergeJoins(inferredJoins, joinConfig);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  } else if (joinConfig) {
    throw new Error(
      "Unexpected joins init param. Expecting 'inferred' OR joinConfig but got: " +
        JSON.stringify(joinConfig),
    );
  }
  const joins = JSON.parse(JSON.stringify(joinConfig)) as Join[];

  // Validate joins
  try {
    const tovNames = dboBuilder.tablesOrViews.map((t) => t.name);

    // 2 find incorrect tables
    const missing = joins.flatMap((j) => j.tables).find((t) => !tovNames.includes(t));
    if (missing) {
      throw "Table not found: " + missing;
    }

    // 3 find incorrect fields
    joins.map(({ tables, on }) => {
      const t1 = tables[0],
        t2 = tables[1];
      on.map((cond) => {
        const f1s = Object.keys(cond),
          f2s = Object.values(cond);
        [
          [t1, f1s],
          [t2, f2s],
        ].map((v) => {
          const t = <string>v[0],
            f = <string[]>v[1];

          const tov = dboBuilder.tablesOrViews!.find((_t) => _t.name === t);
          if (!tov) throw "Table not found: " + t;
          const m1 = f.filter((k) => !tov.columns.map((c) => c.name).includes(k));
          if (m1.length) {
            throw `Table ${t}(${tov.columns.map((c) => c.name).join()}) has no fields named: ${m1.join()}`;
          }
        });
      });
    });

    // 4 find incorrect/missing join types
    const expected_types =
      " \n\n-> Expecting: " + JOIN_TYPES.map((t) => JSON.stringify(t)).join(` | `);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const mt = joins.find((j) => !j.type);
    if (mt) throw "Join type missing for: " + JSON.stringify(mt, null, 2) + expected_types;

    const it = joins.find((j) => !JOIN_TYPES.includes(j.type));
    if (it) throw "Incorrect join type for: " + JSON.stringify(it, null, 2) + expected_types;
  } catch (e: any) {
    const errMsg =
      ((joinConfig as any) === "inferred" ? "INFERRED " : "") + "JOINS VALIDATION ERROR \n-> " + e;
    throw errMsg;
  }

  // Make joins graph
  const joinGraph: Graph = {};
  joins.forEach(({ tables }) => {
    const _t = tables.slice().sort(),
      t1 = _t[0]!,
      t2 = _t[1]!;

    if (t1 === t2) return;

    joinGraph[t1] ??= {};
    joinGraph[t1][t2] = 1;

    joinGraph[t2] ??= {};
    joinGraph[t2][t1] = 1;
  });
  const tables = Array.from(new Set(joins.flatMap((t) => t.tables)));
  const shortestJoinPaths: JoinPaths = [];
  tables.forEach((t1) => {
    tables.forEach((t2) => {
      /** Prevent recursion */
      if (
        t1 === t2 ||
        shortestJoinPaths.some((jp) => {
          if (sortedArraysMatch([jp.t1, jp.t2], [t1, t2])) {
            const shortestPath = findShortestPath(joinGraph, t1, t2);
            if (sortedArraysMatch(shortestPath.path, jp.path)) {
              return true;
            }
          }
        })
      ) {
        return;
      }

      const calculatedPath = findShortestPath(joinGraph, t1, t2);
      if (!(calculatedPath.distance < Infinity)) return;

      const existing1 = shortestJoinPaths.find((j) => j.t1 === t1 && j.t2 === t2);
      if (!existing1) {
        shortestJoinPaths.push({ t1, t2, path: calculatedPath.path.slice() });
      }

      const existing2 = shortestJoinPaths.find((j) => j.t2 === t1 && j.t1 === t2);
      if (!existing2) {
        shortestJoinPaths.push({
          t1: t2,
          t2: t1,
          path: calculatedPath.path.slice().reverse(),
        });
      }
    });
  });
  return {
    joins,
    shortestJoinPaths,
    joinGraph,
  };
};

const mergeJoins = (inferred: Join[], configured: Join[]): Join[] => {
  const joins = [...inferred];
  configured.forEach((join) => {
    const index = joins.findIndex((existing) =>
      isEqual(existing.tables.toSorted(), join.tables.toSorted()),
    );
    const existing = joins[index];
    const previousOn =
      !existing || join.override ? []
      : existing.tables[0] === join.tables[0] ? existing.on
      : reverseJoinOn(existing.on);
    const on = [...previousOn, ...join.on].filter(
      (condition, index, conditions) =>
        conditions.findIndex((candidate) => isEqual(candidate, condition)) === index,
    );
    const merged = { ...join, on };
    if (existing) {
      joins[index] = merged;
    } else {
      joins.push(merged);
    }
  });
  return joins;
};
