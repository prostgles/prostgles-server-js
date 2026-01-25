import * as ts from "typescript";
let globalBuiltinsCache:
  | {
      instancePath: string;
      names: Set<string>;
    }
  | undefined = undefined;
export const getGlobalBuiltinTypes = (
  instancePath: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): Set<string> => {
  if (!globalBuiltinsCache || globalBuiltinsCache.instancePath !== instancePath) {
    // get all global type symbols
    const globals = checker
      .getSymbolsInScope(program.getSourceFiles()[0]!, ts.SymbolFlags.Type)
      .filter((sym) => sym.declarations?.some((d) => d.getSourceFile().hasNoDefaultLib))
      .map((sym) => sym.getName());
    // Also grab value symbols that have a type meaning (like Buffer)
    const valuesThatAreAlsoTypes = checker
      .getSymbolsInScope(program.getSourceFiles()[0]!, ts.SymbolFlags.Value)
      .filter((sym) => {
        const type = checker.getDeclaredTypeOfSymbol(sym);
        return (
          sym.declarations?.some((d) => d.getSourceFile().hasNoDefaultLib) &&
          type.flags !== ts.TypeFlags.Any
        );
      })
      .filter((sym) => {
        // Check if there's a matching type declaration
        const typeSymbol = checker.resolveName(
          sym.getName(),
          undefined,
          ts.SymbolFlags.Type,
          false,
        );
        return (
          typeSymbol && typeSymbol.declarations?.some((d) => d.getSourceFile().hasNoDefaultLib)
        );
      })
      .map((sym) => sym.getName());

    globalBuiltinsCache = {
      instancePath,
      names: new Set([...globals, ...valuesThatAreAlsoTypes]),
    };
  }
  const globalBuiltins = globalBuiltinsCache.names;
  if (
    globalBuiltins.size === 0 ||
    !globalBuiltins.has("String") ||
    !globalBuiltins.has("ArrayBuffer")
  ) {
    throw new Error("Global built-in types not ok");
  }
  return globalBuiltins;
};
