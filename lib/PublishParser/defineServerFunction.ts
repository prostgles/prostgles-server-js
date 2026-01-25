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

export const createServerFunctionWithContext = <C>(
  /**
   * undefined if not allowed
   */
  context: C | undefined,
) => {
  return <TInput extends Record<string, JSONB.FieldType> | undefined = undefined>(args: {
    input?: TInput;
    description?: string;
    run: (args: JSONBObjectTypeIfDefined<TInput>, context: C) => MaybePromise<unknown>;
  }) =>
    ({
      ...args,
      run:
        context === undefined ? undefined : (
          (validatedArgs: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            return args.run(validatedArgs, context);
          }
        ),
    }) as ServerFunctionDefinition;
};
