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

type FunctionContextBase<S, SUser extends SessionUser> = Pick<
  PublishParams<S, SUser>,
  "tables" | "clientReq" | "clientInfo"
> & {
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
> = FunctionContextBase<S, SUser>;

export type UnrestrictedFunctionContext<
  S = void,
  SUser extends SessionUser = SessionUser,
> = FunctionContextBase<S, SUser> & {
  db: DB;
  sql: SQLHandler;
  getClientDBHandlers: PublishParams<S, SUser>["getClientDBHandlers"];
};

export type ServerFunctionContext = RestrictedFunctionContext | UnrestrictedFunctionContext;

export type ServerFunctionDefinition = {
  input?: Record<string, JSONB.FieldType>;
  description?: string;
  unrestrictedDbAccess?: true;
  run: (...args: any[]) => MaybePromise<unknown>;
};

declare const serverFunctionContext: unique symbol;
export type ServerFunctionContextMarker<S, SUser extends SessionUser> = {
  [serverFunctionContext]?: [S, SUser];
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
>(
  args: DefineFunctionArgs<TInput, UnrestrictedFunctionContext<S, SUser>, Return> & {
    unrestrictedDbAccess: true;
  },
): typeof args & ServerFunctionContextMarker<S, SUser>;

export function defineFunction<
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
  S = void,
  SUser extends SessionUser = SessionUser,
  Return = unknown,
>(
  args: DefineFunctionArgs<TInput, RestrictedFunctionContext<S, SUser>, Return> & {
    unrestrictedDbAccess?: undefined;
  },
): typeof args & ServerFunctionContextMarker<S, SUser>;
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
> = Record<string, ServerFunctionDefinition & ServerFunctionContextMarker<S, SUser>>;

export type ServerFunctionGroup<S = void, SUser extends SessionUser = SessionUser> = {
  userFilter: FullFilter<UsersTableRow<S>, ValidDbSchema<S>>;
  functions: ServerFunctionGroupFunctions<S, SUser>;
};

export type ServerFunctionDefinitions<S = void, SUser extends SessionUser = SessionUser> = Record<
  string,
  ServerFunctionGroup<S, SUser>
>;

/**
 * Creates a schema-aware identity helper for defining a server function group
 * while preserving its inferred function names and return types.
 */
export const createFunctionGroupDefiner = <S = void, SUser extends SessionUser = SessionUser>() => {
  return <const T extends ServerFunctionGroup<S, SUser>>(group: T): T => group;
};

/**
 * Creates a schema-aware identity helper for function maps that are composed
 * into a server function group elsewhere.
 */
export const createFunctionsDefiner = <S = void, SUser extends SessionUser = SessionUser>() => {
  return <const T extends ServerFunctionGroupFunctions<S, SUser>>(functions: T): T => functions;
};
