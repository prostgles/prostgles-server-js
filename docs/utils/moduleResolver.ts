import * as ts from "typescript";

/**
 * Resolves a moduleSpecifier to its resolved file path using TypeScript's module resolution.
 *
 * @param moduleSpecifier - The module path (e.g., "./Auth").
 * @param currentFilePath - The path of the current file where the module is imported.
 * @returns The resolved file path, or `undefined` if not found.
 */
export const resolveModuleWithTypescript = (moduleSpecifier: string, currentFilePath: string) => {
  const compilerOptions: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Node16,
    baseUrl: "./", // Adjust as needed
  };
  const host: ts.ModuleResolutionHost = {
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getDirectories: ts.sys.getDirectories,
  };

  const { resolvedModule } = ts.resolveModuleName(
    moduleSpecifier,
    currentFilePath,
    compilerOptions,
    host
  );

  return resolvedModule?.resolvedFileName;
};
