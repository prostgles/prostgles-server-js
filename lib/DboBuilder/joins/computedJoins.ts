import { asName, getJSONBObjectSchemaValidationError, isDefined, isObject } from "prostgles-types";
import type { ColumnJoin, ComputedJoin, Join } from "../../ProstglesTypes";
import type { DboBuilder } from "../DboBuilder";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import type { JoinPath } from "prostgles-types";
import { sortedArraysMatch } from "../../utils/utils";
import { asValue } from "../../PubSubManager/PubSubManagerUtils";

export type ComputedJoinDefinition = ComputedJoin & {
  tables: [string, string];
  columns: [string[], string[]];
};

export type ParsedComputedJoin = {
  definition: ComputedJoinDefinition;
  reversed: boolean;
  params: Record<string, unknown>;
  columnsUsed: [source: Set<string>, target: Set<string>];
};

export const prepareComputedJoins = (dboBuilder: DboBuilder, joins: Join[]): ColumnJoin[] => {
  dboBuilder.computedJoins = [];
  return joins.flatMap((join) => {
    for (const computedJoin of join.on.filter(isComputedJoin)) {
      if (dboBuilder.prostgles.preparingTableConfig) continue;
      const [leftTable, rightTable] = join.tables.map((name) =>
        dboBuilder.tablesOrViews?.find((table) => table.name === name),
      );

      if (!leftTable || !rightTable) {
        throw new Error(`Computed join table not found: ${join.tables.join(", ")}`);
      }
      if (
        typeof computedJoin.$joinName !== "string" ||
        !computedJoin.$joinName.trim() ||
        dboBuilder.computedJoins.some(
          (existing) =>
            existing.$joinName === computedJoin.$joinName &&
            sortedArraysMatch(existing.tables, join.tables),
        )
      ) {
        throw new Error(`Missing or duplicate computed join name: ${computedJoin.$joinName}`);
      }
      const definition: ComputedJoinDefinition = {
        ...computedJoin,
        tables: [leftTable.name, rightTable.name],
        columns: [
          leftTable.columns.map((column) => column.name),
          rightTable.columns.map((column) => column.name),
        ],
      };
      // Required request parameters are only available when the join is used.
      if (!definition.$params) {
        getComputedJoinSQL(
          { definition, reversed: false, params: {}, columnsUsed: [new Set(), new Set()] },
          '"left"',
          '"right"',
        );
      }
      dboBuilder.computedJoins.push(definition);
    }
    const on = join.on.filter(
      (condition): condition is Record<string, string> => !isComputedJoin(condition),
    );
    return on.length || join.override ? [{ ...join, on }] : [];
  });
};

export const resolveComputedJoin = (
  viewHandler: ViewHandler,
  source: string,
  path: JoinPath,
): ParsedComputedJoin | undefined => {
  if (Array.isArray(path.on)) {
    if (path.params !== undefined) throw new Error("Join params require a computed join");
    if (path.reversed !== undefined) throw new Error("Join reversed requires a computed self-join");
    return;
  }
  const candidates = viewHandler.dboBuilder.computedJoins.filter((join) =>
    sortedArraysMatch(join.tables, [source, path.table]),
  );
  if (
    path.on === undefined &&
    (!candidates.length ||
      viewHandler.joins.some((join) => sortedArraysMatch(join.tables, [source, path.table])))
  ) {
    if (path.params !== undefined) throw new Error("Join params require a computed join");
    if (path.reversed !== undefined) throw new Error("Join reversed requires a computed self-join");
    return;
  }
  const definition =
    path.on !== undefined ?
      candidates.find((join) => join.$joinName === path.on)
    : (candidates.find((join) => join.$joinName === "default") ??
      (candidates.length === 1 ? candidates[0] : undefined));
  if (!definition) {
    throw new Error(
      `Unknown or ambiguous computed join: ${source} -> ${path.table} (${path.on ?? "default"})`,
    );
  }
  if (
    path.reversed !== undefined &&
    (source !== path.table || typeof path.reversed !== "boolean")
  ) {
    throw new Error("Join reversed requires a computed self-join and a boolean value");
  }
  const params = path.params === undefined ? {} : path.params;
  if (!isObject(params) || ![Object.prototype, null].includes(Object.getPrototypeOf(params))) {
    throw new Error(
      `Invalid computed join params for ${definition.$joinName}: expecting a plain object`,
    );
  }
  const { error } = getJSONBObjectSchemaValidationError(definition.$params ?? {}, params);
  if (error) throw new Error(`Invalid computed join params for ${definition.$joinName}: ${error}`);
  return {
    definition,
    reversed: definition.tables[0] !== source || !!path.reversed,
    params,
    columnsUsed: [new Set(), new Set()],
  };
};

export const getComputedJoinSQL = (
  { definition, reversed, params, columnsUsed }: ParsedComputedJoin,
  sourceAlias: string,
  targetAlias: string,
  /**
   * Used by the audit table to rename the join columns to ensure the join works even if join columns are not allowed/masked for select
   */
  getSourceColumnName: (column: string) => string = asName,
  getTargetColumnName: (column: string) => string = asName,
): string => {
  const aliases = reversed ? [targetAlias, sourceAlias] : [sourceAlias, targetAlias];
  const columnNames =
    reversed ?
      [getTargetColumnName, getSourceColumnName]
    : [getSourceColumnName, getTargetColumnName];
  const column = (side: 0 | 1) => (name: string) => {
    if (!definition.columns[side].includes(name)) {
      throw new Error(`Invalid computed join column: ${definition.tables[side]}.${name}`);
    }
    columnsUsed[
      reversed ?
        side === 0 ?
          1
        : 0
      : side
    ].add(name);
    return `${aliases[side]}.${columnNames[side]!(name)}`;
  };
  const sql = definition.$sql({ left: column(0), right: column(1), params, asValue });
  if (typeof sql !== "string" || !sql.trim()) {
    throw new Error(`Computed join ${definition.$joinName} must return a SQL condition`);
  }
  return `(${sql})`;
};

export const isComputedJoin = (condition: Join["on"][number]): condition is ComputedJoin =>
  typeof condition.$sql === "function";
