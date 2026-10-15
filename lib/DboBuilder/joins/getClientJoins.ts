import type { ClientJoin } from "prostgles-types";
import type { DboBuilder } from "../DboBuilder";

export const getClientJoins = (
  dboBuilder: DboBuilder,
  selectableTables: Set<string>,
): ClientJoin[] => {
  const supportsMultiHop = (tables: string[]) =>
    tables.every(
      (table) =>
        dboBuilder.prostgles.mergedTableConfig.tableConfig?.[table]?.allowMultiHopJoins !== false,
    );
  const joins: ClientJoin[] = [
    ...dboBuilder.joins.map(({ tables, on }): ClientJoin => ({
      tables,
      on,
      supportsMultiHop: supportsMultiHop(tables),
    })),
    ...dboBuilder.computedJoins.map(({ tables, $joinName, $params }): ClientJoin => ({
      tables,
      on: $joinName,
      ...($params && { paramsSchema: $params }),
      supportsMultiHop: supportsMultiHop(tables),
    })),
  ];
  return structuredClone(
    joins.filter(({ tables }) => tables.every((table) => selectableTables.has(table))),
  );
};
