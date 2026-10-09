import { asName, pickKeys, type AnyObject } from "prostgles-types";
import type { ParsedTableRule } from "../../../PublishParser/PublishParser";
import type { LocalParams } from "../../DboBuilder";
import { prepareWhere } from "../../ViewHandler/prepareWhere";
import { prepareNewData } from "../DataValidator";
import type { TableHandler } from "../TableHandler";

/** Upsert rules must be enforceable without reading conflicting rows first. */
export const getConflictUpdateQuery = async ({
  table,
  tableRules,
  localParams,
  rows,
  conflictColumns,
  columnsAddedFromBeforeHooks,
  removeDisallowedFields,
}: {
  table: TableHandler;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
  rows: AnyObject[];
  conflictColumns: string[];
  columnsAddedFromBeforeHooks: string[];
  removeDisallowedFields: boolean;
}) => {
  const { fields, forcedData, forcedFilter, filterFields } = await table.parseUpdateRules(
    {},
    undefined,
    tableRules,
    localParams,
  );
  const allowedFilterFields = table.parseFieldFilter(filterFields);
  if (conflictColumns.some((column) => !allowedFilterFields.includes(column))) {
    throw new Error(
      `ON CONFLICT DO UPDATE conflict columns must be allowed by update.filterFields on ${table.name}`,
    );
  }
  const prepared = rows.map((row) =>
    prepareNewData({
      row: pickKeys(
        row,
        Object.keys(row).filter((column) => !conflictColumns.includes(column)),
      ),
      forcedData,
      allowedFields: fields,
      tableRules,
      removeDisallowedFields,
      tableConfigurator: table.dboBuilder.prostgles.tableConfigurator,
      tableHandler: table,
      columnsAddedFromBeforeHooks,
    }),
  );
  const columns = [...new Set(prepared.flatMap(({ data }) => Object.keys(data)))];
  if (!columns.length) {
    throw new Error("No non conflict columns to update for onConflict=DoUpdate");
  }
  const forcedColumns = new Set(Object.keys(forcedData ?? {}).map(asName));
  const { getAssignments } = await table.dataValidator.parse({
    command: "update",
    rows: [Object.assign({}, ...prepared.map(({ data }) => data))],
    allowedCols: columns,
  });
  const assignments = getAssignments(({ escapedCol, escapedVal }) =>
    forcedColumns.has(escapedCol) ? escapedVal : `EXCLUDED.${escapedCol}`,
  )[0]!;
  const { where } = await prepareWhere(table, {
    select: undefined,
    filter: {},
    forcedFilter,
    filterFields,
    tableRule: tableRules,
    localParams,
    tableAlias: {
      raw: table.tableOrViewInfo.qualifiedNameParts.name,
      escaped: asName(table.tableOrViewInfo.qualifiedNameParts.name),
    },
  });
  return `ON CONFLICT (${conflictColumns.map(asName).join(", ")}) DO UPDATE SET ${assignments} ${where}`;
};
