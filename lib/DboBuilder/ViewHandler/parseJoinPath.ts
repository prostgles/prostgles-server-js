import type { JoinPath, RawJoinPath } from "prostgles-types";
import { reverseJoinOn } from "prostgles-types";
import type { ViewHandler } from "./ViewHandler";
import type { LocalParams } from "../DboBuilder";
import type { ParsedComputedJoin } from "../joins/computedJoins";
import { parseComputedJoin } from "../joins/computedJoins";
import { getQuerySourceSQL, type QuerySource } from "../QueryBuilder/getQuerySource";
import { prepareWhere } from "./prepareWhere";

type parseJoinPathArgs = {
  rawPath: RawJoinPath;
  rootTable: string;
  ancestorTables?: string[];
  viewHandler: ViewHandler;
  localParams: LocalParams | undefined;
  allowMultiOrJoin?: boolean | "explicit";
  addShortestJoinIfMissing?: boolean;
};
export type ParsedJoinPath = {
  table: string;
  on: Record<string, string>[];
  computedJoin?: ParsedComputedJoin;
  /** The target uses its own query source; intermediate sources are resolved here. */
  source: QuerySource | undefined;
};

/**
 * Return a valid join path
 */
export const resolveJoinPath = ({
  rawPath,
  rootTable,
  ancestorTables = [],
  viewHandler,
  allowMultiOrJoin = false,
  addShortestJoinIfMissing,
}: Omit<parseJoinPathArgs, "localParams">): ParsedJoinPath[] => {
  const result: ParsedJoinPath[] = [];
  const appendJoin = (step: JoinPath, allowShortestPath: boolean) => {
    const source = result.at(-1)?.table ?? rootTable;
    const directJoin = getDirectJoin(viewHandler, source, step, allowMultiOrJoin);
    if (directJoin) {
      result.push(directJoin);
      return;
    }
    const shortest =
      allowShortestPath &&
      viewHandler.joinPaths.find(({ t1, t2 }) => t1 === source && t2 === step.table);
    if (!shortest) throw new Error(`Joining ${source} to ${step.table} is disallowed or missing`);
    for (const table of shortest.path.slice(1)) {
      appendJoin(table === step.table ? step : { table }, false);
    }
  };
  const steps = typeof rawPath === "string" ? [rawPath] : rawPath;
  for (const [index, step] of steps.entries()) {
    if (step === "**") continue;
    const allowShortestPath =
      (index === 0 && !!addShortestJoinIfMissing) || (index === 1 && steps[0] === "**");
    appendJoin(typeof step === "string" ? { table: step } : step, allowShortestPath);
  }

  if (result.length > 1 || ancestorTables.length) {
    const blockedTable = [...ancestorTables, rootTable, ...result.map((path) => path.table)].find(
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

  return result;
};

export const parseJoinPath = async (args: parseJoinPathArgs): Promise<ParsedJoinPath[]> => {
  const { viewHandler, localParams } = args;
  const result = resolveJoinPath(args);
  for (const part of result.slice(0, -1)) {
    const table = viewHandler.dboBuilder.dboMap.get(part.table);
    if (!table) throw new Error(`Join table not found: ${part.table}`);
    const tableRules = await (async () => {
      if (!localParams?.clientReq) return;
      const publishParser = viewHandler.dboBuilder.publishParser;
      if (!publishParser) throw new Error("Publish parser is not initialized");
      return publishParser.getValidatedRequestRuleWusr(
        { tableName: part.table, command: "find", clientReq: localParams.clientReq },
        localParams.scope,
      );
    })();
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

const getDirectJoin = (
  viewHandler: ViewHandler,
  source: string,
  step: JoinPath,
  allowMultiOrJoin: boolean | "explicit",
): ParsedJoinPath | undefined => {
  const { table, on } = step;
  const joins = getJoinsBetween(viewHandler, source, table);
  const candidates =
    on === undefined ? joins : (
      joins.filter((join) => ("$joinName" in join ? join.$joinName === on : Array.isArray(on)))
    );
  const [join] = candidates;
  if (candidates.length > 1) {
    throw new Error(`Multiple joins between ${source} and ${table}. Specify on in joinPath.`);
  }
  if (join && "$joinName" in join) {
    return {
      table,
      on: [],
      computedJoin: parseComputedJoin(join, source, step),
      source: undefined,
    };
  }
  if (typeof on === "string") {
    throw new Error(`Unknown computed join: ${source} -> ${table} (${on})`);
  }
  if (step.params !== undefined) throw new Error("Join params require a computed join");
  if (step.reversed !== undefined) throw new Error("Join reversed requires a computed self-join");
  if (!join) return;
  if (!viewHandler.dboBuilder.dboMap.has(table)) {
    throw new Error(`Invalid or disallowed table in join path: ${table}`);
  }

  const possible = join.tables[0] === source ? join.on : reverseJoinOn(join.on);
  const constraints = getValidOn(on, possible);
  if (constraints.length > 1 && (!allowMultiOrJoin || (allowMultiOrJoin === "explicit" && !on))) {
    throw new Error(
      `Table ${source} can join to ${table} through multiple constraints. Specify on in joinPath.`,
    );
  }
  return { table, on: constraints.map((constraint) => ({ ...constraint })), source: undefined };
};

export const getJoinsBetween = (viewHandler: ViewHandler, source: string, target: string) =>
  [...viewHandler.joins, ...viewHandler.dboBuilder.computedJoins].filter(
    ({ tables: [left, right] }) =>
      (left === source && right === target) || (right === source && left === target),
  );

const getValidOn = (
  requested: ParsedJoinPath["on"] | undefined,
  possible: ParsedJoinPath["on"],
) => {
  if (!requested) {
    return possible;
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

  return requested;
};

const conditionsMatch = (c1: Record<string, string>, c2: Record<string, string>) => {
  const keys1 = Object.keys(c1);
  const keys2 = Object.keys(c2);
  return (
    keys1.toSorted().join() === keys2.toSorted().join() && keys1.every((key) => c1[key] === c2[key])
  );
};
