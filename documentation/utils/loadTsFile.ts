import * as path from "path";
import * as ts from "typescript";

export const loadTsFile = (filePath: string) => {
  // Normalize file path
  const absolutePath = path.resolve(filePath);

  // Create compiler host and program
  const configPath = ts.findConfigFile(
    path.dirname(absolutePath),
    ts.sys.fileExists,
    "tsconfig.json"
  );

  if (!configPath) {
    throw new Error("Could not find a valid 'tsconfig.json'.");
  }

  // Parse the config file
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  // Create program
  const program = ts.createProgram({
    rootNames: [absolutePath],
    options: parsedConfig.options,
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(absolutePath);

  if (!sourceFile) {
    throw new Error(`Could not find source file: ${absolutePath}`);
  }

  return {
    program,
    checker,
    sourceFile,
  };
};
