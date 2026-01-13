import { getJSONBTSTypes, getObjectEntries, type JSONB } from "prostgles-types";
import type { TableSchema } from "../DboBuilder/DboBuilder";

export const getFunctionsTypescriptSchema = (
  tablesOrViews: TableSchema[],
  resolvedFunctions: Record<
    string,
    {
      input?: Record<string, JSONB.FieldType>;
      output?: JSONB.FieldType;
      description?: string;
    }
  >
) => {
  const methodDefinitions = getObjectEntries(resolvedFunctions).map(
    ([name, functionDefinition]) => {
      const { output } = functionDefinition;
      const input = functionDefinition.input;
      const argumentTypes =
        !input ? "" : `args: ${getJSONBTSTypes(tablesOrViews, { type: input })}`;

      const removeSemicolon = (v: string) =>
        v.trim().endsWith(";") ? v.trim().slice(0, -1) : v.trim();
      const returnType = !output ? "void" : getJSONBTSTypes(tablesOrViews, output);
      return `  ${JSON.stringify(name)}: (${removeSemicolon(argumentTypes)}) => Promise<${removeSemicolon(returnType)}>`;
    }
  );
  if (methodDefinitions.length) {
    return ["\n", `export type GeneratedFunctionSchema = { `, ...methodDefinitions, `}`].join("\n");
  }
};
