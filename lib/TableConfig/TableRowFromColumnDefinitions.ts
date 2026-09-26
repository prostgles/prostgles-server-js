import type { JSONB } from "prostgles-types";

type ColumnDefinition =
  | string
  | { enum: readonly (string | number)[]; nullable?: boolean }
  | { jsonbSchema: JSONB.JSONBSchema; nullable?: boolean };

/** Row types for the column definitions used by managed tables. */
export type TableRowFromColumnDefinitions<T extends Record<string, ColumnDefinition>> = InsertRow<{
  [K in keyof T]: T[K] extends string ? NormalizeSQL<Uppercase<T[K]>> : T[K];
}>;

type InsertRow<T extends Record<string, ColumnDefinition>> = Omit<
  TableRow<T>,
  GeneratedColumnNames<T>
> &
  Partial<Pick<TableRow<T>, GeneratedColumnNames<T>>>;

type TableRow<T extends Record<string, ColumnDefinition>> = {
  [K in keyof T]: T[K] extends (
    {
      jsonbSchema: infer S extends JSONB.JSONBSchema;
    }
  ) ?
    JSONB.GetType<S> | (T[K] extends { nullable: true } ? null : never)
  : T[K] extends { enum: readonly (infer V)[] } ?
    V | (T[K] extends { nullable: true } ? null : never)
  : | ColumnValue<T[K]>
    | (T[K] extends string ?
        ColumnIsRequired<T[K]> extends true ?
          never
        : null
      : never);
};

type ColumnIsRequired<T extends string> =
  ReadType<T>[0] extends SerialType ? true
  : ` ${Unquoted<T>} ` extends (

      | `${string} NOT NULL ${string}`
      | `${string} PRIMARY KEY ${string}`
      | `${string} GENERATED ${string} AS IDENTITY ${string}`
  ) ?
    true
  : false;

type GeneratedColumnNames<T extends Record<string, ColumnDefinition>> = {
  [K in keyof T]: T[K] extends string ?
    ReadType<T[K]>[0] extends SerialType ? K
    : ` ${Unquoted<T[K]>} ` extends (
      `${string} DEFAULT ${string}` | `${string} GENERATED ${string}`
    ) ?
      K
    : never
  : never;
}[keyof T];

type SerialType = "SMALLSERIAL" | "SERIAL2" | "SERIAL" | "SERIAL4" | "BIGSERIAL" | "SERIAL8";

type ColumnValue<T> =
  T extends string ?
    T extends `DOUBLE PRECISION${infer Rest}` ? ColumnValue<`FLOAT8${Rest}`>
    : ReadType<T> extends [infer Name extends string, infer Rest extends string] ?
      ArrayValue<ScalarValue<Name>, Trim<Rest>>
    : never
  : never;

type ScalarValue<T> =
  T extends "BYTEA" ? Buffer
  : T extends "JSON" | "JSONB" ? Record<string, unknown>
  : T extends "BOOL" | "BOOLEAN" ? boolean
  : T extends (

      | "SMALLINT"
      | "INT2"
      | "INT"
      | "INTEGER"
      | "INT4"
      | "SMALLSERIAL"
      | "SERIAL2"
      | "SERIAL"
      | "SERIAL4"
      | "REAL"
      | "FLOAT"
      | "FLOAT4"
      | "FLOAT8"
  ) ?
    number
  : T extends "BIGINT" | "INT8" | "BIGSERIAL" | "SERIAL8" | "NUMERIC" | "DECIMAL" | "DEC" ?
    string | number
  : string;

/** Only consume modifiers/array dimensions immediately following the type. */
type ArrayValue<Value, Rest extends string> =
  Rest extends `(${string})${infer Tail}` ? ArrayValue<Value, Trim<Tail>>
  : Rest extends `[${string}]${infer Tail}` ? ArrayValue<(Value | null)[], Trim<Tail>>
  : Rest extends "ARRAY" | `ARRAY ${string}` | `ARRAY[${string}` ?
    Rest extends `ARRAY${infer Tail}` ?
      Trim<Tail> extends `[${string}` ?
        ArrayValue<Value, Trim<Tail>>
      : (Value | null)[]
    : never
  : Value;

type ReadType<T extends string, Name extends string = ""> =
  T extends `${" " | "(" | "["}${string}` ? [Name, T]
  : T extends `${infer Char}${infer Rest}` ? ReadType<Rest, `${Name}${Char}`>
  : [Name, ""];

type Trim<T extends string> =
  T extends ` ${infer Rest}` ? Trim<Rest>
  : T extends `${infer Rest} ` ? Trim<Rest>
  : T;

type NormalizeSQL<T extends string> =
  T extends `${infer Start}\n${infer End}` ? NormalizeSQL<`${Start} ${End}`>
  : T extends `${infer Start}\r${infer End}` ? NormalizeSQL<`${Start} ${End}`>
  : T extends `${infer Start}\t${infer End}` ? NormalizeSQL<`${Start} ${End}`>
  : T extends `${infer Start}  ${infer End}` ? NormalizeSQL<`${Start} ${End}`>
  : Trim<T>;

/** Quoted values and identifiers do not declare defaults or constraints. */
type Unquoted<T extends string> =
  T extends `${infer Start}'${string}'${infer End}` ? Unquoted<`${Start}${End}`>
  : T extends `${infer Start}"${string}"${infer End}` ? Unquoted<`${Start}${End}`>
  : T;
