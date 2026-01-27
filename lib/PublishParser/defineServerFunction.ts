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
