import type { JSONB, JSONBObjectTypeIfDefined, MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DB } from "../initProstgles";
import type { PublishParams } from "./publishTypesAndUtils";

export type ServerFunctionDefinition<Context = never, IsAllowedContext = never> = {
  input?: Record<string, JSONB.FieldType> | undefined;
  output?: JSONB.FieldType;
  description?: string;
  run: (args: Record<string, unknown> | undefined, context: Context) => MaybePromise<unknown>;
  isAllowed: (params: IsAllowedContext) => MaybePromise<boolean>;
};

export const defineServerFunction = <
  S = void,
  SUser extends SessionUser = SessionUser,
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
  /** TODO: add output validation. It was removed due: Type instantiation is excessively deep and possibly infinite */
  // TOutput extends JSONB.FieldType = never,
>(args: {
  input?: TInput;
  output?: JSONB.FieldType;
  description?: string;
  run: (
    args: JSONBObjectTypeIfDefined<TInput>,
    context: PublishParams<S, SUser>
  ) => MaybePromise<unknown>;
  isAllowed: (params: PublishParams<S, SUser>) => boolean | Promise<boolean>;
}) => args as unknown as ServerFunctionDefinition;

export type ServerFunction<
  S = void,
  SUser extends SessionUser = SessionUser,
> = ServerFunctionDefinition<PublishParams<S, SUser>> & {
  isAllowed: (params: PublishParams<S, SUser>) => boolean | Promise<boolean>;
};
export type ServerFunctionDefinitions<
  S = void,
  SUser extends SessionUser = SessionUser,
> = (params: { dbo: DBOFullyTyped<S>; db: DB }) => {
  [key: string]: ServerFunction<S, SUser>;
};

export const createDefineServerFunction = <S = void, SUser extends SessionUser = SessionUser>(
  isAllowed: (params: PublishParams<S, SUser>) => boolean | Promise<boolean>
) => {
  return <TInput extends Record<string, JSONB.FieldType> | undefined = undefined>(args: {
    input?: TInput;
    output?: JSONB.FieldType;
    description?: string;
    run: (
      args: JSONBObjectTypeIfDefined<TInput>,
      context: PublishParams<S, SUser>
    ) => MaybePromise<unknown>;
  }) => ({ ...args, isAllowed }) as unknown as ServerFunctionDefinition;
};

type TypeGuardResult<T, Fallback> = T extends (arg: any) => arg is infer R ? R : Fallback;

export const createDefineServerFunctionWithContextGuard = <
  S,
  SUser extends SessionUser,
  TGuard extends (params: PublishParams<S, SUser>) => boolean,
>(
  isAllowed?: TGuard
) => {
  type BaseContext = PublishParams<S, SUser>;
  type GuardedContext = TypeGuardResult<TGuard, BaseContext>;

  return <TInput extends Record<string, JSONB.FieldType> | undefined = undefined>(args: {
    input?: TInput;
    output?: JSONB.FieldType;
    description?: string;
    run: (args: JSONBObjectTypeIfDefined<TInput>, context: GuardedContext) => MaybePromise<unknown>;
  }) =>
    ({
      ...args,
      isAllowed,
    }) as unknown as ServerFunctionDefinition;
};
