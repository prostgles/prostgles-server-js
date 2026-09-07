/** Row types for the column definitions used by managed tables. */
export type TableRowFromColumnDefinitions<
  T extends Record<
    string,
    string | { enum: readonly (string | number)[]; nullable?: boolean }
  >,
> = {
  [K in keyof T]: T[K] extends { enum: readonly (infer V)[] }
    ? V | (T[K] extends { nullable: true } ? null : never)
    : | (T[K] extends `BYTEA${string}`
          ? Buffer
          : T[K] extends `JSONB${string}`
            ? Record<string, unknown>
            : string)
      | (T[K] extends
          `${string} NOT NULL${string}` | `${string}PRIMARY KEY${string}`
          ? never
          : null);
};
