import * as ts from "typescript";
import { dirname } from "path";
import { resolveTypeToStructure } from "./resolveTypeToStructure";
import { getGlobalBuiltinTypes } from "./getGlobalBuiltinTypes";

export const getServerFunctionReturnTypes = (instancePath: string): Map<string, string> => {
  const configPath = ts.findConfigFile(dirname(instancePath), (f) => ts.sys.fileExists(f));
  if (!configPath) throw new Error("tsconfig.json not found");

  const { config } = ts.readConfigFile(configPath, (f) => ts.sys.readFile(f));
  const { fileNames, options } = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));

  const program = ts.createProgram(fileNames, options);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(instancePath);
  const result = new Map<string, string>();

  if (!sourceFile) {
    throw new Error(`Source file not found: ${instancePath}`);
  }

  const globalBuiltins = getGlobalBuiltinTypes(instancePath, checker, program);

  if (sourceFile.isDeclarationFile) {
    throw new Error(`Source file is a declaration file: ${instancePath}`);
  }

  ts.forEachChild(sourceFile, function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "prostgles"
    ) {
      const arg = node.arguments[0];
      if (!arg || !ts.isObjectLiteralExpression(arg)) return;

      const fnProp = arg.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "functions",
      );
      if (!fnProp) return;

      const functionsExpr = fnProp.initializer;
      const recordType = resolveToRecordType(functionsExpr);

      if (!recordType) return;

      for (const prop of checker.getPropertiesOfType(recordType)) {
        const propType = checker.getTypeOfSymbolAtLocation(
          prop,
          prop.valueDeclaration ?? prop.declarations![0]!,
        );
        const runReturnType = getRunReturnType(propType);

        /** Peel away any wrapping helper functions */
        let finalRunReturnType = runReturnType;
        while (
          finalRunReturnType &&
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          finalRunReturnType.symbol?.valueDeclaration &&
          ts.isFunctionLike(finalRunReturnType.symbol.valueDeclaration)
        ) {
          finalRunReturnType = unwrapMaybePromise(
            checker.getReturnTypeOfSignature(finalRunReturnType.getCallSignatures()[0]!),
          );
        }

        if (finalRunReturnType) {
          const resolvedReturnType = resolveTypeToStructure(
            globalBuiltins,
            prop.getName(),
            checker,
            finalRunReturnType,
          );
          result.set(prop.getName(), resolvedReturnType);
        }
      }
    }

    ts.forEachChild(node, visit);
  });

  return result;

  /** Resolve any expression to the final `Record<string, ServerFunctionDefinition>` */
  function resolveToRecordType(expr: ts.Expression): ts.Type | undefined {
    let t = checker.getTypeAtLocation(expr);

    // If it's a function type (ServerFunctionDefinitions)
    const [sig] = t.getCallSignatures();
    if (sig) {
      t = unwrapMaybePromise(checker.getReturnTypeOfSignature(sig));
    }

    // Strip undefined/null
    t = checker.getNonNullableType(t);
    return checker.getApparentType(t);
  }

  /** Extract `run` return type from ServerFunctionDefinition */
  function getRunReturnType(fnDefType: ts.Type) {
    const runSymbol = checker.getPropertyOfType(fnDefType, "run");
    if (!runSymbol) return;

    let runType = checker.getTypeOfSymbolAtLocation(
      runSymbol,
      runSymbol.valueDeclaration ?? runSymbol.declarations![0]!,
    );

    // run is usually `undefined | ((...) => MaybePromise<T>)`
    runType = checker.getNonNullableType(runType);

    /** Follow any wrapping function calls */

    const [sig] = runType.getCallSignatures();
    if (!sig) return;

    return unwrapMaybePromise(checker.getReturnTypeOfSignature(sig));
  }

  /** Unwrap `MaybePromise<T>` and `Promise<T>` */
  function unwrapMaybePromise(type: ts.Type) {
    const awaited = checker.getAwaitedType(type);
    return awaited ?? type;
  }
};
