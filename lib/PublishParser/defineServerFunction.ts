import type { JSONB, JSONBObjectTypeIfDefined, MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { PublishParams } from "./publishTypesAndUtils";

export type ServerFunctionDefinition = {
  input?: Record<string, JSONB.FieldType> | undefined;
  description?: string;
  /**
   * undefined if not allowed
   */
  run: undefined | ((args: Record<string, unknown> | undefined) => MaybePromise<unknown>);
};

export const defineServerFunction = <
  TInput extends Record<string, JSONB.FieldType> | undefined = undefined,
>(args: {
  input?: TInput;
  description?: string;
  /**
   * undefined if not allowed
   */
  run: undefined | ((args: JSONBObjectTypeIfDefined<TInput>) => MaybePromise<unknown>);
}) => args as unknown as ServerFunctionDefinition;

export type ServerFunctionDefinitions<S = void, SUser extends SessionUser = SessionUser> = (
  /**
   * params will be undefined on first run to generate the definitions
   */
  params: undefined | PublishParams<S, SUser>,
) => MaybePromise<Record<string, ServerFunctionDefinition>>;

export const createServerFunctionWithContext = <Context>(
  /**
   * undefined if not allowed
   */
  context: Context | undefined,
) => {
  return <
    Input extends Record<string, JSONB.FieldType> | undefined,
    Run extends (args: JSONBObjectTypeIfDefined<Input>, context: Context) => MaybePromise<any>,
  >(args: {
    input?: Input;
    description?: string;
    run: Run;
  }) =>
    ({
      ...args,
      run:
        context === undefined ? undefined : (
          (validatedArgs: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            return args.run(validatedArgs, context) as Run;
          }
        ),
    }) satisfies ServerFunctionDefinition;
};

type InputOf<T> = T extends { input?: infer I } ? I : undefined;

// if inference fails or is invalid → fall back to undefined
type SafeInput<I> = I extends Record<string, JSONB.FieldType> ? I : undefined;

type ServerFunctionArgsFrom<Context, Def> = {
  input?: InputOf<Def>;
  description?: string;
  run: (
    args: JSONBObjectTypeIfDefined<SafeInput<InputOf<Def>>>,
    context: Context,
  ) => MaybePromise<any>;
};

type ServerFunctionBlock<Context, Defs> = {
  [K in keyof Defs]: ServerFunctionArgsFrom<Context, Defs[K]>;
};

type WrappedDef<Context, Def> =
  Def extends (
    {
      input?: infer I;
      description?: infer D;
      run: (a: any, c: Context) => infer R;
    }
  ) ?
    {
      input?: SafeInput<I>;
      description?: D extends string ? D : string | undefined;
      run: undefined | ((a: any) => R); // keep return type, widen args
    }
  : never;

type WrappedBlock<Context, Defs> = {
  [K in keyof Defs]: WrappedDef<Context, Defs[K]>;
};

export const createServerFunctionBlockWithContext = <Context>(context: Context | undefined) => {
  return <const Defs extends Record<string, any>>(
    defs: Defs & ServerFunctionBlock<Context, Defs>,
  ): WrappedBlock<Context, Defs> => {
    const wrapped = {} as WrappedBlock<Context, Defs>;

    for (const key in defs) {
      const def = defs[key];
      wrapped[key] = {
        ...def,
        run: context === undefined ? undefined : (args: any) => def.run(args, context),
      };
    }

    return wrapped satisfies Record<string, ServerFunctionDefinition>;
  };
};
