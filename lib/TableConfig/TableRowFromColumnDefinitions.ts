import type {
  ManagedTableColumnDefinition,
  ManagedTableSchema,
  TableInsertRowFromTableConfig as SharedTableInsertRowFromTableConfig,
  TableRowFromColumnDefinitions as SharedTableRowFromColumnDefinitions,
  TableRowFromTableConfig as SharedTableRowFromTableConfig,
} from "prostgles-types";

export type TableRowFromColumnDefinitions<T extends Record<string, ManagedTableColumnDefinition>> =
  SharedTableRowFromColumnDefinitions<T, Buffer>;

export type TableRowFromTableConfig<
  T extends ManagedTableSchema,
  ValueTypes extends Partial<Record<keyof T["columns"], unknown>> = {},
> = SharedTableRowFromTableConfig<T, ValueTypes, Buffer>;

export type TableInsertRowFromTableConfig<
  T extends ManagedTableSchema,
  ValueTypes extends Partial<Record<keyof T["columns"], unknown>> = {},
> = SharedTableInsertRowFromTableConfig<T, ValueTypes, Buffer>;
