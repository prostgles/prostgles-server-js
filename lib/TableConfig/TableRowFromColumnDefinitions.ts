import type { JSONB } from "prostgles-types";

type ColumnDefinition =
  | string
  | { enum: readonly (string | number)[]; nullable?: boolean }
  | { jsonbSchema: JSONB.JSONBSchema; nullable?: boolean };

/** Row types for the column definitions used by managed tables. */
export type TableRowFromColumnDefinitions<
  T extends Record<string, ColumnDefinition>,
> = Omit<TableRow<T>, GeneratedColumnNames<T>> &
  Partial<Pick<TableRow<T>, GeneratedColumnNames<T>>>;

type TableRow<T extends Record<string, ColumnDefinition>> = {
  [K in keyof T]: T[K] extends {
    jsonbSchema: infer S extends JSONB.JSONBSchema;
  }
    ? JSONB.GetType<S> | (T[K] extends { nullable: true } ? null : never)
    : T[K] extends { enum: readonly (infer V)[] }
      ? V | (T[K] extends { nullable: true } ? null : never)
      : | ColumnValue<T[K]>
        | (T[K] extends
            `${string} NOT NULL${string}` | `${string}PRIMARY KEY${string}`
            ? never
            : null);
};

type GeneratedColumnNames<T extends Record<string, ColumnDefinition>> = {
  [K in keyof T]: T[K] extends string
    ? T[K] extends
        | `${string}DEFAULT${string}`
        | `${string}SERIAL${string}`
        | `${string}GENERATED${string}AS IDENTITY${string}`
      ? K
      : never
    : never;
}[keyof T];

type ColumnValue<T> = T extends `BYTEA${string}`
  ? Buffer
  : T extends `JSONB${string}`
    ? Record<string, unknown>
    : T extends `${"SMALLINT" | "INTEGER" | "SERIAL"}${string}`
      ? number
      : T extends `${"BIGINT" | "BIGSERIAL" | "NUMERIC" | "DECIMAL"}${string}`
        ? string | number
        : T extends `${"REAL" | "DOUBLE PRECISION"}${string}`
          ? number
          : string;
