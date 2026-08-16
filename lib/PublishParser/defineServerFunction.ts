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
): typeof args;

export function defineFunction<
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
  S = void,
  SUser extends SessionUser = SessionUser,
  Return = unknown,
>(
  args: DefineFunctionArgs<TInput, RestrictedFunctionContext<S, SUser>, Return> & {
    unrestrictedDbAccess?: undefined;
  },
): typeof args;
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

export type ServerFunctionDefinitions<S = void> = Record<
  string,
  {
    userFilter: FullFilter<UsersTableRow<S>, ValidDbSchema<S>>;
    functions: Record<string, ServerFunctionDefinition>;
  }
>;
