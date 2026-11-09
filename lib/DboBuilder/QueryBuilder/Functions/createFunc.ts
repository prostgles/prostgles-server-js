import { getJSONBSchemaValidationError, getJSONBTSTypes, type JSONB } from "prostgles-types";
import type { FunctionSpec } from "./Functions";

export const createFunc = <const ArgsSchema extends Record<string, FunctionArgument>>(
  definition: FunctionDefinition<ArgsSchema>,
): FunctionSpec => {
  const { argsSchema, description, getFields, getQuery, ...functionSpec } = definition;
  const argumentsSchema = Object.entries(argsSchema).map(([name, schema]) => ({
    name,
    ...(typeof schema === "string" ? { type: schema } : schema),
  }));
  const restArgument = argumentsSchema.find((argument) => argument.rest);
  if (restArgument && restArgument !== argumentsSchema.at(-1)) {
    throw new Error(`${functionSpec.name}: rest arguments must be last`);
  }

  const argumentTypes = argumentsSchema.map((argument) => {
    const argumentType =
      getJSONBTSTypes([], argument, true).trim() +
      (argument.rest && argument.optional ? " | undefined" : "");
    if (argument.rest) {
      const elementType = argumentType.includes(" | ") ? `(${argumentType})` : argumentType;
      return `...${argument.name}: ${elementType}[]`;
    }
    return `${argument.name}${argument.optional ? "?" : ""}: ${argumentType}`;
  });
  const validateArgs = (args: unknown[]): FunctionArgs<ArgsSchema> => {
    if (!Array.isArray(args) || (!restArgument && args.length > argumentsSchema.length)) {
      throw new Error(`${functionSpec.name}: invalid number of arguments`);
    }
    const parsedArgs: Record<string, unknown> = {};
    for (const [index, argument] of argumentsSchema.entries()) {
      if (!argument.rest && !argument.optional && index >= args.length) {
        throw new Error(`${functionSpec.name}: missing argument ${argument.name}`);
      }
      const values = argument.rest ? args.slice(index) : [args[index]];
      for (const value of values) {
        const { error } = getJSONBSchemaValidationError(argument, value);
        if (error) {
          throw new Error(`${functionSpec.name}: invalid argument ${argument.name}: ${error}`);
        }
      }
      parsedArgs[argument.name] = argument.rest ? values : args[index];
    }
    return parsedArgs as FunctionArgs<ArgsSchema>;
  };

  return {
    ...functionSpec,
    numArgs: argumentsSchema.length,
    description: `:[${argumentTypes.join(", ")}] -> ${description}`,
    getFields: (args) => getFields(validateArgs(args)),
    getQuery: (params) => getQuery({ ...params, args: validateArgs(params.args) }),
  };
};

type FunctionArgument = Extract<JSONB.FieldType, string> | (JSONB.FieldTypeObj & { rest?: true });

type FunctionArgumentValue<Argument> =
  Argument extends JSONB.FieldType ?
    JSONB.GetType<Argument> | (Argument extends { optional: true } ? undefined : never)
  : never;

type FunctionArgs<ArgsSchema extends Record<string, FunctionArgument>> = {
  [Name in keyof ArgsSchema]: ArgsSchema[Name] extends { rest: true } ?
    FunctionArgumentValue<ArgsSchema[Name]>[]
  : FunctionArgumentValue<ArgsSchema[Name]>;
};

type FunctionDefinition<ArgsSchema extends Record<string, FunctionArgument>> = Omit<
  FunctionSpec,
  "numArgs" | "description" | "getFields" | "getQuery"
> & {
  /* Property order defines positional arguments; the final property may collect rest arguments. */
  argsSchema: ArgsSchema;
  description: string;
  getFields: (args: FunctionArgs<ArgsSchema>) => ReturnType<FunctionSpec["getFields"]>;
  getQuery: (
    params: Omit<Parameters<FunctionSpec["getQuery"]>[0], "args"> & {
      args: FunctionArgs<ArgsSchema>;
    },
  ) => string;
};
