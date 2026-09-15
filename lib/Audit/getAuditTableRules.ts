import { as } from "pg-promise";
import { asName, fromEntries, isDefined, isEmpty, isObject } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { Filter, LocalParams } from "../DboBuilder/DboBuilder";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import { withTableExpression } from "../DboBuilder/QueryBuilder/getQuerySource";
import type { PublishParser } from "../PublishParser/PublishParser";
import type {
  ParsedPublishTable,
  PublishObject,
  SelectRule,
} from "../PublishParser/publishTypesAndUtils";
import { AUDIT_TABLE_COLUMN_NAMES, type AuditTableRow } from "./AuditTable";
import type { ResolvedAuditConfig } from "./AuditTypes";
import { prepareWhere } from "../DboBuilder/ViewHandler/prepareWhere";

export const getAuditTableRules = async function (
  this: PublishParser,
  audit: ResolvedAuditConfig,
  auditTablePublishRules: ParsedPublishTable | undefined,
  clientReq: AuthClientRequest | undefined,
  clientInfo: AuthResultWithSID | undefined,
  scope: LocalParams["scope"] | undefined,
  resolvedPublishObject: PublishObject | undefined,
): Promise<ParsedPublishTable | undefined> {
  if (auditTablePublishRules?.select) {
    return auditTablePublishRules;
  }
  if (resolvedPublishObject && Object.hasOwn(resolvedPublishObject, audit.tableName)) {
    return auditTablePublishRules;
  }

  const auditedTableNames = Object.keys(audit.tables).filter(
    (tableName) => canSelect(resolvedPublishObject?.[tableName]) || this.dbo[tableName]?.is_media,
  );

  const auditTableHandler = this.dbo[audit.tableName]!;

  const auditedTableRules = (
    await Promise.all(
      auditedTableNames.map(async (tableName) => {
        const tableHandler = this.dbo[tableName];
        if (!tableHandler) return;

        const rules = await this.getTableRules({
          tableName,
          clientReq,
          clientInfo,
          scope,
          resolvedPublishObject,
        });

        if (!rules?.select) {
          return;
        }

        return {
          handler: tableHandler,
          additionalForcedCondition: await getSourceAuditCondition(
            tableHandler,
            rules.select.forcedFilter,
            audit.tables[tableName]!.excludeColumns,
          ),
          tableColumnOverrides: getAuditRowColumnOverrides(
            tableHandler.parseFieldFilter(rules.select.fields),
            audit.tables[tableName]!.idColumns,
          ),
        };
      }),
    )
  ).filter(isDefined);

  if (!auditedTableRules.length) {
    return auditTablePublishRules;
  }

  const validateRequest = (filter: Filter) => {
    const requiredTableNameFilterValue = getRequiredStringFilter(
      filter,
      [AUDIT_TABLE_COLUMN_NAMES.schema_name, AUDIT_TABLE_COLUMN_NAMES.table_name],
      this.prostgles.keywords.$and,
    );
    if (!requiredTableNameFilterValue) {
      throw new Error("Audit queries require an exact schema_name and table_name filter");
    }
    const { schema_name, table_name } = requiredTableNameFilterValue;
    const [matchingAuditedTableRules, ...otherMatches] = auditedTableRules.filter(
      ({ handler: { tableOrViewInfo } }) => {
        const sourceName = tableOrViewInfo.qualifiedNameParts;
        return sourceName.name === table_name && sourceName.schema === schema_name;
      },
    );
    if (otherMatches.length) {
      throw new Error("Invalid audit table filter: multiple matching rules found");
    }
    if (!matchingAuditedTableRules) {
      throw new Error("Invalid audit table filter: no matching rules found");
    }
    const { additionalForcedCondition, tableColumnOverrides } = matchingAuditedTableRules;
    const tableExpression = getTableExpression(
      auditTableHandler,
      tableColumnOverrides,
      additionalForcedCondition,
    );
    return { tableExpression };
  };

  const select: SelectRule = withTableExpression(
    {
      fields: "*",
      filterFields: "*",
      orderByFields: "*",
      disableMethods: { subscribe: 1, sync: 1 },
    },
    (request) => validateRequest(request.filter).tableExpression,
  );

  return { ...auditTablePublishRules, select };
};

const getAuditRowColumnOverrides = (allowedColumns: string[], idColumns: readonly string[]) => {
  type SnapshotColumn =
    | typeof AUDIT_TABLE_COLUMN_NAMES.old_id
    | typeof AUDIT_TABLE_COLUMN_NAMES.new_id
    | typeof AUDIT_TABLE_COLUMN_NAMES.old_row
    | typeof AUDIT_TABLE_COLUMN_NAMES.new_row;
  const getSnapshotExpression = (snapshotColumn: SnapshotColumn, columns: string[]) => {
    const snapshot = asName(snapshotColumn);
    const args = columns.flatMap((columnName) => [
      as.text(columnName),
      `${snapshot} -> ${as.text(columnName)}`,
    ]);
    return `CASE WHEN ${snapshot} IS NULL THEN NULL ELSE jsonb_build_object(${args.join(", ")}) END`;
  };

  return {
    [AUDIT_TABLE_COLUMN_NAMES.old_id]: getSnapshotExpression(
      AUDIT_TABLE_COLUMN_NAMES.old_id,
      idColumns.filter((columnName) => allowedColumns.includes(columnName)),
    ),
    [AUDIT_TABLE_COLUMN_NAMES.new_id]: getSnapshotExpression(
      AUDIT_TABLE_COLUMN_NAMES.new_id,
      idColumns.filter((columnName) => allowedColumns.includes(columnName)),
    ),
    [AUDIT_TABLE_COLUMN_NAMES.old_row]: getSnapshotExpression(
      AUDIT_TABLE_COLUMN_NAMES.old_row,
      allowedColumns,
    ),
    [AUDIT_TABLE_COLUMN_NAMES.new_row]: getSnapshotExpression(
      AUDIT_TABLE_COLUMN_NAMES.new_row,
      allowedColumns,
    ),
  };
};

const getSourceAuditCondition = async (
  sourceHandler: ViewHandler,
  forcedFilter: Filter | undefined,
  excludedColumns: readonly string[],
) => {
  const { schema, name } = sourceHandler.tableOrViewInfo.qualifiedNameParts;
  const auditColumn = (columnName: keyof AuditTableRow) => asName(columnName);
  const sourceCondition = [
    `${auditColumn(AUDIT_TABLE_COLUMN_NAMES.schema_name)} = ${as.text(schema)}`,
    `${auditColumn(AUDIT_TABLE_COLUMN_NAMES.table_name)} = ${as.text(name)}`,
  ].join(" AND ");
  if (!forcedFilter || isEmpty(forcedFilter)) {
    return sourceCondition;
  }

  const getSnapshotCondition = async (
    snapshotColumn:
      typeof AUDIT_TABLE_COLUMN_NAMES.old_row | typeof AUDIT_TABLE_COLUMN_NAMES.new_row,
  ) => {
    const alias = `prostgles_audit_${snapshotColumn}`;
    const snapshot = auditColumn(snapshotColumn);
    const { condition } = await prepareWhere(sourceHandler, {
      filter: forcedFilter,
      select: undefined,
      filterFields: sourceHandler.column_names.filter(
        (columnName) => !excludedColumns.includes(columnName),
      ),
      addWhere: false,
      tableAlias: { raw: alias, escaped: asName(alias) },
      localParams: undefined,
      tableRule: undefined,
    });
    if (!condition) return "TRUE";

    const record = `NULL::${sourceHandler.escapedName}`;
    return `(
      ${snapshot} IS NULL OR EXISTS (
        SELECT 1
        FROM jsonb_populate_record(${record}, ${snapshot}) AS ${asName(alias)}
        WHERE ${condition}
      )
    )`;
  };

  const [oldRowCondition, newRowCondition] = await Promise.all([
    getSnapshotCondition(AUDIT_TABLE_COLUMN_NAMES.old_row),
    getSnapshotCondition(AUDIT_TABLE_COLUMN_NAMES.new_row),
  ]);
  /** Prevent updates that cross a forcedFilter boundary from exposing either snapshot. */
  return `(${sourceCondition}) AND ${oldRowCondition} AND ${newRowCondition}`;
};

const canSelect = (rule: PublishObject[string] | undefined) => {
  return rule === "*" || rule === true || (isObject(rule) && Boolean(rule.select));
};

const getRequiredStringFilter = <Key extends keyof AuditTableRow>(
  filter: Filter,
  fieldNames: Key[],
  andKey: string,
): Record<Key, string> | undefined => {
  const values = getExactStringFilters(filter, fieldNames, andKey);
  if (fieldNames.some((fieldName) => !values[fieldName])) return;
  return values as Record<Key, string>;
};

const getExactStringFilters = <Key extends keyof AuditTableRow>(
  filter: Filter,
  fieldNames: Key[],
  andKey: string,
): Partial<Record<Key, string>> => {
  if (!isObject(filter)) return {};
  const filterRecord = filter as Record<string, unknown>;
  const result = fromEntries(
    fieldNames
      .map((fieldName) => {
        const value = filterRecord[fieldName];
        if (typeof value === "string") return [fieldName, value] as const;
        if (!isObject(value)) return;

        const entries = Object.entries(value);
        const [operator, exactValue] = entries[0] ?? [];
        if (
          entries.length === 1 &&
          operator &&
          ["=", "$eq"].includes(operator) &&
          typeof exactValue === "string"
        ) {
          return [fieldName, exactValue] as const;
        }
      })
      .filter(isDefined),
  ) as Partial<Record<Key, string>>;

  const andFilters = filterRecord[andKey];
  if (!Array.isArray(andFilters)) return result;

  for (const andFilter of andFilters) {
    const nestedValues = getExactStringFilters(andFilter as Filter, fieldNames, andKey);
    for (const fieldName of fieldNames) {
      const nestedValue = nestedValues[fieldName];
      if (!nestedValue) continue;
      const existingValue = result[fieldName];
      if (existingValue && existingValue !== nestedValue) {
        throw new Error(`Conflicting exact ${fieldName} filters`);
      }
      result[fieldName] = nestedValue;
    }
  }
  return result;
};

const getTableExpression = (
  auditTableHandler: ViewHandler,
  columnOverrides: Record<string, string> | undefined,
  additionalCondition: string | undefined,
) => {
  const overrides = columnOverrides && !isEmpty(columnOverrides) ? columnOverrides : undefined;
  if (!overrides && !additionalCondition) return;

  const invalidColumns = Object.keys(overrides ?? {}).filter(
    (columnName) => !auditTableHandler.column_names.includes(columnName),
  );
  if (invalidColumns.length) {
    throw new Error(`Invalid table column overrides: ${invalidColumns.join(", ")}`);
  }

  const columns =
    overrides ?
      auditTableHandler.column_names.map((columnName) => {
        const override = overrides[columnName];
        return override ? `${override} AS ${asName(columnName)}` : asName(columnName);
      })
    : ["*"];
  const where = additionalCondition ? ` WHERE ${additionalCondition}` : "";
  return `(SELECT ${columns.join(", ")} FROM ${auditTableHandler.escapedName}${where})`;
};
