import { dirname } from "node:path";
import * as ts from "typescript";

export const getServerFunctionReturnTypes = (instancePath: string) => {
  const configPath = ts.findConfigFile(dirname(instancePath), (f) => ts.sys.fileExists(f));
  if (!configPath) throw new Error("tsconfig.json not found");

  // const program = ts.createProgram([instancePath], {
  //   strict: true,
  //   target: ts.ScriptTarget.ESNext,
  //   module: ts.ModuleKind.ESNext,
  // });

  const { config } = ts.readConfigFile(configPath, (f) => ts.sys.readFile(f));
  const { fileNames, options } = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));

  const program = ts.createProgram(fileNames, options);

  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(instancePath);
  const result: Map<string, string> = new Map();
  if (!sf) {
    throw new Error(`Source file not found: ${instancePath}`);
  }

  const extractFromFunctionBody = (body: ts.Block | ts.ConciseBody) => {
    if (!ts.isBlock(body)) return;

    const ret = body.statements.find(ts.isReturnStatement);
    if (!ret?.expression || !ts.isObjectLiteralExpression(ret.expression)) return;

    for (const p of ret.expression.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      if (!ts.isCallExpression(p.initializer)) continue;

      const arg = p.initializer.arguments[0];
      if (!arg || !ts.isObjectLiteralExpression(arg)) continue;

      const runProp = arg.properties.find(
        (x): x is ts.PropertyAssignment => ts.isPropertyAssignment(x) && x.name.getText() === "run",
      );
      if (!runProp) continue;

      const runExpr = runProp.initializer;
      if (!ts.isFunctionLike(runExpr)) continue;

      const sig = checker.getSignatureFromDeclaration(runExpr);
      if (!sig) continue;

      const rt = checker.getReturnTypeOfSignature(sig);

      result.set(p.name.getText(), checker.typeToString(rt));
    }
  };
  const resolveFunctionBody = (expr: ts.Expression): ts.Block | undefined => {
    // Case 1: Inline arrow function
    if (ts.isArrowFunction(expr) && ts.isBlock(expr.body)) {
      return expr.body;
    }

    // Case 2: Inline function expression
    if (ts.isFunctionExpression(expr)) {
      return expr.body;
    }

    // Case 3: Identifier referencing a function
    if (ts.isIdentifier(expr)) {
      const symbol = checker.getSymbolAtLocation(expr);
      const decl = symbol?.valueDeclaration;

      if (decl) {
        // Variable declaration: const getServerFunctions = () => { ... }
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          return resolveFunctionBody(decl.initializer);
        }

        // Function declaration: function getServerFunctions() { ... }
        if (ts.isFunctionDeclaration(decl) && decl.body) {
          return decl.body;
        }
      }
    }

    return undefined;
  };

  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && n.name.getText() === "functions") {
      const body = resolveFunctionBody(n.initializer);
      if (body) {
        extractFromFunctionBody(body);
      }
    }

    // Also handle shorthand: { functions }
    if (ts.isShorthandPropertyAssignment(n) && n.name.getText() === "functions") {
      const symbol = checker.getShorthandAssignmentValueSymbol(n);
      const decl = symbol?.valueDeclaration;

      if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
        const body = resolveFunctionBody(decl.initializer);
        if (body) {
          extractFromFunctionBody(body);
        }
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(sf);
  return result;
};
