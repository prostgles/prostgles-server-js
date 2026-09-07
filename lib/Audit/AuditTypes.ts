export type SchemaConfigTableName<S> = [S] extends [void]
  ? string
  : Extract<keyof S, string>;
export type SchemaConfigColumnName<S, T extends SchemaConfigTableName<S>> = [
  S,
] extends [void]
  ? string
  : T extends keyof S
    ? S[T] extends { columns: infer C }
      ? Extract<keyof C, string>
      : never
    : never;

export type SchemaConfigAuditTableOptions<
  S,
  T extends SchemaConfigTableName<S>,
> = {
  entityType?: string;
  /** Defaults to all primary-key columns. Required for tables without a primary key. */
  idColumns?: readonly SchemaConfigColumnName<S, T>[];
  excludeColumns?: readonly SchemaConfigColumnName<S, T>[];
};
export type SchemaConfigAuditIncludedTables<S> = {
  [T in SchemaConfigTableName<S>]?: 1 | SchemaConfigAuditTableOptions<S, T>;
};
export type SchemaConfigAuditExcludedTables<S> = {
  [T in SchemaConfigTableName<S>]?: 0;
};
export type SchemaConfigAudit<S = void> = {
  /** Managed append-only table. Uses the same table-name handling as tableConfig. */
  tableName: string;
  /** Omitted/empty means all eligible tables in schemaFilter. Cannot mix enabled and disabled entries. */
  tables?:
    SchemaConfigAuditIncludedTables<S> | SchemaConfigAuditExcludedTables<S>;
};

/** Validated audit targets with all column and entity defaults resolved. */
export type ResolvedAuditConfig = {
  tableName: string;
  tables: Record<string, Required<SchemaConfigAuditTableOptions<void, string>>>;
};
