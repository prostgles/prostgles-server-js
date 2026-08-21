import type {
  AnyObject,
  DBSchema,
  FullFilter,
  JSONB,
  JSONBObjectTypeIfDefined,
  MaybePromise,
  SQLHandler,
} from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB } from "../initProstgles";
import type { PublishParams } from "./publishTypesAndUtils";

type FunctionContextBase<S, SUser extends SessionUser, Context> = Pick<
  PublishParams<S, SUser>,
  "tables" | "clientReq" | "clientInfo"
> & {
  context: Context;
  dbo: DBOFullyTyped<S>;
  user: S extends DBSchema ?
    S["users"]["columns"] extends AnyObject ?
      Required<S["users"]["columns"]>
    : SUser["user"]
  : SUser["user"];
};

export type RestrictedFunctionContext<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = FunctionContextBase<S, SUser, Context>;

export type UnrestrictedFunctionContext<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = FunctionContextBase<S, SUser, Context> & {
  db: DB;
  sql: SQLHandler;
  getClientDBHandlers: PublishParams<S, SUser>["getClientDBHandlers"];
};

export type ServerFunctionContext =
  | RestrictedFunctionContext<void, SessionUser, unknown>
  | UnrestrictedFunctionContext<void, SessionUser, unknown>;

export type ServerFunctionDefinition = {
  input?: Record<string, JSONB.FieldType>;
  description?: string;
  unrestrictedDbAccess?: true;
  run: (...args: any[]) => MaybePromise<unknown>;
};

declare const serverFunctionContext: unique symbol;
export type ServerFunctionContextMarker<
  S,
  SUser extends SessionUser,
  Context = undefined,
> = {
  [serverFunctionContext]?: [S, SUser, Context];
};

type DefineFunctionArgs<
  TInput extends Record<string, JSONB.FieldType> | undefined,
  Context,
  Return,
> = {
  input?: TInput;
  description?: string;
  run: (args: JSONBObjectTypeIfDefined<TInput>, context: Context) => MaybePromise<Return>;
};

export function defineFunction<
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
  S = void,
  SUser extends SessionUser = SessionUser,
  Return = unknown,
  Context = undefined,
>(
  args: DefineFunctionArgs<TInput, UnrestrictedFunctionContext<S, SUser, Context>, Return> & {
    unrestrictedDbAccess: true;
  },
): typeof args & ServerFunctionContextMarker<S, SUser, Context>;

export function defineFunction<
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
  S = void,
  SUser extends SessionUser = SessionUser,
  Return = unknown,
  Context = undefined,
>(
  args: DefineFunctionArgs<TInput, RestrictedFunctionContext<S, SUser, Context>, Return> & {
    unrestrictedDbAccess?: undefined;
  },
): typeof args & ServerFunctionContextMarker<S, SUser, Context>;
export function defineFunction(args: unknown) {
  return args;
}

type UsersTableRow<S> =
  S extends DBSchema ?
    S extends { users: { columns: infer UserRow extends AnyObject } } ?
      UserRow
    : AnyObject
  : AnyObject;

type ValidDbSchema<S> = S extends DBSchema ? S : void;

export type ServerFunctionGroupFunctions<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = Record<string, ServerFunctionDefinition & ServerFunctionContextMarker<S, SUser, Context>>;

export type ServerFunctionGroup<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = {
  userFilter: FullFilter<UsersTableRow<S>, ValidDbSchema<S>>;
  functions: ServerFunctionGroupFunctions<S, SUser, Context>;
};

export type ServerFunctionDefinitions<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = Record<string, ServerFunctionGroup<S, SUser, Context>>;

/**
 * Creates a schema-aware identity helper for defining a server function group
 * while preserving its inferred function names and return types.
 */
export const createFunctionGroupDefiner = <
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
>() => {
  return <const T extends ServerFunctionGroup<S, SUser, Context>>(group: T): T => group;
};

/** Creates a schema-aware function group definer with application context. */
export const createFunctionGroupDefinerWithContext = <
  S,
  Context,
  SUser extends SessionUser = SessionUser,
>() => createFunctionGroupDefiner<S, SUser, Context>();

/**
 * Creates a schema-aware identity helper for function maps that are composed
 * into a server function group elsewhere.
 */
export const createFunctionsDefiner = <
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
>() => {
  return <const T extends ServerFunctionGroupFunctions<S, SUser, Context>>(functions: T): T =>
    functions;
};

/** Creates a schema-aware function-map definer with application context. */
export const createFunctionsDefinerWithContext = <
  S,
  Context,
  SUser extends SessionUser = SessionUser,
>() => createFunctionsDefiner<S, SUser, Context>();
