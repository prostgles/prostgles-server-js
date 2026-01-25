import { getJSONBTSTypes, getObjectEntries, type JSONB } from "prostgles-types";
import type { TableSchema } from "../DboBuilder/DboBuilder";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { getServerFunctionReturnTypes } from "./getServerFunctionReturnTypes";

export const getFunctionsTypescriptSchema = (
  { tsGeneratedTypesFunctionsPath }: Pick<ProstglesInitOptions, "tsGeneratedTypesFunctionsPath">,
  tablesOrViews: TableSchema[],
  resolvedFunctions: Record<
    string,
    {
      input?: Record<string, JSONB.FieldType>;
      description?: string;
    }
  >,
) => {
  const functionReturnTypes =
    !tsGeneratedTypesFunctionsPath ? undefined : (
      getServerFunctionReturnTypes(tsGeneratedTypesFunctionsPath)
    );
  const methodDefinitions = getObjectEntries(resolvedFunctions).map(
    ([name, functionDefinition]) => {
      const input = functionDefinition.input;
      const argumentTypes =
        !input ? "" : `args: ${getJSONBTSTypes(tablesOrViews, { type: input })}`;

      const removeSemicolon = (v: string) =>
        v.trim().endsWith(";") ? v.trim().slice(0, -1) : v.trim();
      const returnType = removeSemicolon(functionReturnTypes?.get(name) ?? "unknown");
      const returnTypePromise =
        !returnType.startsWith("Promise<") ? `Promise<${returnType}>` : returnType;
      return `  ${JSON.stringify(name)}: (${removeSemicolon(argumentTypes)}) => ${returnTypePromise}`;
    },
  );
  if (methodDefinitions.length) {
    return ["\n", `export type GeneratedFunctionSchema = { `, ...methodDefinitions, `}`].join("\n");
  }
};
