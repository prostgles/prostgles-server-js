import type { JoinPath, RawJoinPath } from "prostgles-types";
import { reverseJoinOn } from "prostgles-types";
import type { ViewHandler } from "./ViewHandler";
import type { JoinInfo, LocalParams } from "../DboBuilder";
import type { ParsedComputedJoin } from "../joins/computedJoins";
import { resolveComputedJoin } from "../joins/computedJoins";
import { getQuerySourceSQL, type QuerySource } from "../QueryBuilder/getQuerySource";
import { prepareWhere } from "./prepareWhere";

type parseJoinPathArgs = {
  rawPath: RawJoinPath;
  rootTable: string;
  viewHandler: ViewHandler;
  localParams: LocalParams | undefined;
  allowMultiOrJoin?: boolean;
  addShortestJoinIfMissing?: boolean;
};
export type ParsedJoinPath = {
  table: string;
  on: Record<string, string>[];
  computedJoin?: ParsedComputedJoin;
  /** The target uses its own query source; intermediate sources are resolved here. */
  source: QuerySource | undefined;
};
type ColumnJoinPath = { table: string; on?: Record<string, string>[] };

/**
 * Return a valid join path
 */
export const parseJoinPath = async ({
  rawPath,
  rootTable,
  viewHandler,
  localParams,
  allowMultiOrJoin = false,
  addShortestJoinIfMissing,
}: parseJoinPathArgs): Promise<ParsedJoinPath[]> => {
  const result: ParsedJoinPath[] = [];
  let cleanPath = typeof rawPath === "string" ? [{ table: rawPath }] : rawPath;
  if (addShortestJoinIfMissing && cleanPath[0] !== "**") {
    cleanPath = ["**", ...cleanPath];
  }
  cleanPath.forEach((item, i) => {
    const prevTable = result.at(-1)?.table ?? rootTable;
    if (!prevTable) throw `prevTable missing`;

    const pushJoinPath = (targetPath: JoinPath) => {
      const computedJoin = resolveComputedJoin(viewHandler, prevTable, targetPath);
      if (computedJoin) {
        result.push({ table: targetPath.table, on: [], computedJoin, source: undefined });
        return;
      }
      const getShortestJoin = i === 1 && cleanPath[0] === "**";
      const joinInfo = getJoins(
        viewHandler,
        prevTable,
        [
          {
            table: targetPath.table,
            on: typeof targetPath.on === "string" ? undefined : targetPath.on,
          },
        ],
        {
          allowMultiOrJoin,
          getShortestJoin,
        },
      );

      joinInfo.paths.forEach((path) => {
        /** Check if join tables are valid */
        if (!viewHandler.dboBuilder.dboMap.get(path.table)) {
          throw {
            stack: ["prepareExistCondition()"],
            message: `Invalid or disallowed table in join path: ${path.table}`,
          };
        }
        result.push({
          table: path.table,
          on: path.on.map((constraint) => Object.fromEntries(constraint)),
          source: undefined,
        });
      });
    };

    /** Shortest join */
    if (item === "**") {
    } else if (typeof item === "string") {
      const table = item;
      pushJoinPath({ table });
    } else {
      pushJoinPath(item);
    }
  });

  if (result.length > 1) {
    const blockedTable = [rootTable, ...result.map((path) => path.table)].find(
      (table) =>
        viewHandler.dboBuilder.prostgles.mergedTableConfig.tableConfig?.[table]
          ?.allowMultiHopJoins === false,
    );
    if (blockedTable) throw new Error(`Multi-hop joins are disabled for table: ${blockedTable}`);
  }
  const missingPath = result.find(
    (r) => !r.computedJoin && (!r.on.length || r.on.some((v) => !Object.keys(v).length)),
  );
  if (missingPath) {
    throw `Missing join on condition for: ${missingPath.table}`;
  }

  for (const part of result.slice(0, -1)) {
    const table = viewHandler.dboBuilder.dboMap.get(part.table)!;
    const tableRules =
      localParams?.clientReq ?
        await viewHandler.dboBuilder.publishParser!.getValidatedRequestRuleWusr(
          { tableName: part.table, command: "find", clientReq: localParams.clientReq },
          localParams.scope,
        )
      : undefined;
    const { source, where, exists } = await prepareWhere(table, {
      filter: {},
      forcedFilter: tableRules?.select?.forcedFilter,
      select: undefined,
      selectParams: {},
      tableRule: tableRules,
      localParams,
    });
    // Keep forced filters inside the relation, including scope filters on masked values.
    if (where) {
      source.expression = `(SELECT * FROM ${getQuerySourceSQL(source)} ${where} OFFSET 0)`;
      source.rowPermissionTables = [
        ...(source.rowPermissionTables ?? []),
        table.name,
        ...exists.flatMap((filter) => filter.dependencyTables ?? []),
      ];
    }
    part.source = source;
  }
  return result;
};

export const getJoinPathColumns = (path: ParsedJoinPath | undefined) => ({
  source:
    path?.computedJoin ?
      [...path.computedJoin.columnsUsed[0]]
    : (path?.on.flatMap((columnPair) => Object.keys(columnPair)) ?? []),
  target:
    path?.computedJoin ?
      [...path.computedJoin.columnsUsed[1]]
    : (path?.on.flatMap((columnPair) => Object.values(columnPair)) ?? []),
});

type Opts = {
  allowMultiOrJoin?: boolean;
  getShortestJoin?: boolean;
};

/**
 * Returns all tables and fields required to join from source table to target table
 * Respecting the path.on condition
 */
const getJoins = (
  viewHandler: ViewHandler,
  source: string,
  path: ColumnJoinPath[],
  { allowMultiOrJoin = true, getShortestJoin }: Opts = {},
): JoinInfo => {
  const [lastItem] = path;
  if (!lastItem) {
    throw `Empty path`;
  }
  if (getShortestJoin && path.length !== 1) {
    throw `getShortestJoin requires exactly 1 path item`;
  }
  const target = lastItem.table;

  /* Find the join path between tables */
  const actualPath =
    getShortestJoin ?
      viewHandler.joinPaths
        .find((j) => {
          return j.t1 === source && j.t2 === target;
        })
        ?.path.map((table) => ({ table, on: undefined }))
        .slice(1)
    : (
      viewHandler.joinPaths.find((j) => {
        return j.path.join() === [{ table: source }, ...path].map((p) => p.table).join();
      })
    ) ?
      path
    : undefined;

  if (getShortestJoin && actualPath?.length && lastItem.on?.length) {
    actualPath[actualPath.length - 1]!.on = lastItem.on;
  }

  if (!actualPath) {
    throw `Joining ${source} <-...-> ${target} disallowed or missing`;
  }

  /* Make the join chain info */
  const paths: JoinInfo["paths"] = [];
  actualPath.forEach((tablePath, i, arr) => {
    const prevTable = arr[i - 1]!;
    const t1 = i === 0 ? source : prevTable.table;

    /* Get join options */
    const join = viewHandler.joins.find(({ tables: [left, right] }) => {
      return (
        (left === t1 && right === tablePath.table) || (right === t1 && left === tablePath.table)
      );
    });
    if (!join) {
      throw `Joining ${t1} <-> ${tablePath.table} disallowed or missing`;
    }
    const isLtr = join.tables[0] === t1;
    const joinOn = isLtr ? join.on : reverseJoinOn(join.on);

    const on = getValidOn(tablePath.on, joinOn);
    paths.push({
      source,
      target,
      table: tablePath.table,
      on,
    });
  });
  const expectOne = false;

  const isMultiOrJoin = paths.find((p) => p.on.length > 1);
  if (!allowMultiOrJoin && isMultiOrJoin) {
    throw `Table ${JSON.stringify(source)} can join to ${JSON.stringify(target)} through multiple constraints. Must chose one of ${JSON.stringify(isMultiOrJoin.on)}`;
  }
  return {
    paths,
    expectOne,
  };
};

const getValidOn = (requested: ColumnJoinPath["on"], possible: ParsedJoinPath["on"]) => {
  if (!requested) {
    return possible.map((v) => Object.entries(v));
  }
  if (!requested.length) {
    throw `Invalid requested "tablePath.on". Cannot be empty`;
  }
  const isValid = requested.every((requestedConstraint) => {
    return possible.some((possibleConstraint) =>
      conditionsMatch(possibleConstraint, requestedConstraint),
    );
  });

  if (!isValid) {
    throw `Invalid path specified for join: ${JSON.stringify(requested)}. Allowed paths: ${JSON.stringify(possible)}`;
  }

  return requested.map((v) => Object.entries(v));
};

const conditionsMatch = (c1: Record<string, string>, c2: Record<string, string>) => {
  const keys1 = Object.keys(c1);
  const keys2 = Object.keys(c2);
  return (
    keys1.toSorted().join() === keys2.toSorted().join() && keys1.every((key) => c1[key] === c2[key])
  );
};
