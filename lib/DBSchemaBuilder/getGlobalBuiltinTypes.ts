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
    const sourceFile = program.getSourceFiles()[0];
    if (!sourceFile) throw new Error("No source files found in program");

    const globals = checker
      .getSymbolsInScope(
        program.getSourceFiles()[0]!,
        ts.SymbolFlags.Type | ts.SymbolFlags.Namespace,
      )
      // .filter((sym) => sym.declarations?.some((d) => d.getSourceFile().hasNoDefaultLib))
      .filter((sym) =>
        sym.declarations?.some((d) => isGlobalDeclarationFile(d.getSourceFile(), program)),
      )
      .map((sym) => sym.getName());
    // Also grab value symbols that have a type meaning (like Buffer)
    const valuesThatAreAlsoTypes = checker
      .getSymbolsInScope(sourceFile, ts.SymbolFlags.Value)
      .filter((sym) => {
        const declarations = sym.declarations || [];
        const isGlobal = declarations.some((d) =>
          isGlobalDeclarationFile(d.getSourceFile(), program),
        );

        if (!isGlobal) return false;
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
    !globalBuiltins.has("Buffer") ||
    !globalBuiltins.has("ArrayBuffer")
  ) {
    throw new Error("Global built-in types not ok");
  }
  return globalBuiltins;
};

/**
 * Checks if a source file is either a standard TS library
 * or part of the Node.js global type definitions.
 */
const isGlobalDeclarationFile = (file: ts.SourceFile, program: ts.Program): boolean => {
  return (
    program.isSourceFileDefaultLibrary(file) ||
    file.hasNoDefaultLib ||
    file.fileName.includes("node_modules/@types/node")
  );
};
