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
  const sf = program.getSourceFile(instancePath);
  const result = new Map();

  if (!sf) {
    throw new Error(`Source file not found: ${instancePath}`);
  }

  const globalBuiltins = getGlobalBuiltinTypes(instancePath, checker, program);

  const getActualSymbol = (symbol: ts.Symbol | undefined) => {
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      const aliased = checker.getAliasedSymbol(symbol);
      return aliased;
    }
    return symbol;
  };

  const getDeclarationFromSymbol = (symbol: ts.Symbol | undefined) => {
    const actualSymbol = getActualSymbol(symbol);
    if (!actualSymbol) return undefined;
    return actualSymbol.valueDeclaration ?? actualSymbol.declarations?.[0];
  };

  /**
   * Unwrap AsExpression, ParenthesizedExpression, etc. to get the actual expression
   */
  const unwrapExpression = (expr: ts.Expression) => {
    let current = expr;
    let iterations = 0;
    while (iterations < 10) {
      iterations++;
      if (ts.isAsExpression(current)) {
        current = current.expression;
      } else if (ts.isParenthesizedExpression(current)) {
        current = current.expression;
      } else if (ts.isSatisfiesExpression(current)) {
        current = current.expression;
      } else if (ts.isTypeAssertionExpression(current)) {
        current = current.expression;
      } else {
        break;
      }
    }
    return current;
  };

  /**
   * Extract return type from a defineFunction call
   */
  const extractFromDefineCall = (callExpr: ts.CallExpression, propertyName: string) => {
    const arg = callExpr.arguments[0];
    if (!arg) {
      return;
    }

    if (!ts.isObjectLiteralExpression(arg)) {
      return;
    }

    const runProp = arg.properties.find(
      (x): x is ts.PropertyAssignment | ts.MethodDeclaration =>
        (ts.isPropertyAssignment(x) || ts.isMethodDeclaration(x)) && x.name.getText() === "run",
    );
    if (!runProp) {
      return;
    }

    const runExpr = ts.isPropertyAssignment(runProp) ? runProp.initializer : runProp; // method declarations are already function-like

    if (!ts.isFunctionLike(runExpr)) {
      return;
    }

    const sig = checker.getSignatureFromDeclaration(runExpr);
    if (!sig) {
      return;
    }

    const returnType = checker.getReturnTypeOfSignature(sig);
    const resolvedReturnType = resolveTypeToStructure(
      globalBuiltins,
      propertyName,
      checker,
      returnType,
    );
    result.set(propertyName, resolvedReturnType);
  };

  /**
   * Check if a call expression is a define function call
   */
  const isDefineFunctionCall = (node: ts.Node): node is ts.CallExpression => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      const name = callee.getText();
      const isDefine =
        name.toLowerCase().includes("define") && name.toLowerCase().includes("function");

      return isDefine;
    }
    return false;
  };

  const extractFromAwaitExpression = (spreadExpr: ts.AwaitExpression, depth: number) => {
    const awaitedExpr = spreadExpr.expression;

    if (ts.isCallExpression(awaitedExpr)) {
      // Resolve the function being called and extract from its return
      const calleeExpr = awaitedExpr.expression;
      if (ts.isIdentifier(calleeExpr)) {
        const symbol = checker.getSymbolAtLocation(calleeExpr);
        const decl = getDeclarationFromSymbol(symbol);

        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          const body = resolveFunctionBody(decl.initializer);
          if (body) {
            extractFromFunctionBody(body, depth + 2);
          }
        }
        if (decl && ts.isFunctionDeclaration(decl) && decl.body) {
          extractFromFunctionBody(decl.body, depth + 2);
        }
      }
    }
  };

  /**
   * Extract methods from an object literal that contains method definitions
   */
  const extractMethodsFromObjectLiteral = (obj: ts.ObjectLiteralExpression, depth = 0) => {
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const propName = prop.name.getText();

        if (isDefineFunctionCall(prop.initializer) || ts.isCallExpression(prop.initializer)) {
          extractFromDefineCall(prop.initializer, propName);
        }
      }

      if (ts.isSpreadAssignment(prop)) {
        const spreadExpr = prop.expression;

        if (ts.isIdentifier(spreadExpr)) {
          const symbol = checker.getSymbolAtLocation(spreadExpr);
          const decl = getDeclarationFromSymbol(symbol);

          if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
            if (ts.isObjectLiteralExpression(decl.initializer)) {
              extractMethodsFromObjectLiteral(decl.initializer, depth + 2);
            } else {
              const init = unwrapExpression(decl.initializer);
              if (ts.isAwaitExpression(init)) {
                extractFromAwaitExpression(init, depth);
              }
            }
          }
        }

        if (ts.isObjectLiteralExpression(spreadExpr)) {
          extractMethodsFromObjectLiteral(spreadExpr, depth + 2);
        }

        // Handle await expressions: ...await someAsyncFunction()
        if (ts.isAwaitExpression(spreadExpr)) {
          extractFromAwaitExpression(spreadExpr, depth);
        }
      }

      if (ts.isShorthandPropertyAssignment(prop)) {
        const propName = prop.name.getText();

        const symbol = checker.getShorthandAssignmentValueSymbol(prop);
        const decl = symbol?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          if (isDefineFunctionCall(decl.initializer)) {
            extractFromDefineCall(decl.initializer, propName);
          }
        }
      }
    }
  };

  /**
   * Find return statements in a function body
   */
  const findReturnStatements = (node: ts.Node) => {
    const returns: ts.ReturnStatement[] = [];

    const visit = (n: ts.Node) => {
      if (ts.isReturnStatement(n)) {
        returns.push(n);
      }
      if (!ts.isFunctionLike(n) || n === node) {
        ts.forEachChild(n, visit);
      }
    };

    ts.forEachChild(node, visit);
    return returns;
  };

  /**
   * Extract from function body
   */
  const extractFromFunctionBody = (body: ts.FunctionBody | ts.ConciseBody, depth = 0) => {
    // Handle concise body: () => ({ ... })
    if (!ts.isBlock(body)) {
      const unwrapped = unwrapExpression(body);
      if (ts.isObjectLiteralExpression(unwrapped)) {
        extractMethodsFromObjectLiteral(unwrapped, depth + 1);
      }
      return;
    }

    const returnStatements = findReturnStatements(body);

    for (let i = 0; i < returnStatements.length; i++) {
      const ret = returnStatements[i];

      if (!ret?.expression) {
        continue;
      }

      // Unwrap any type assertions
      const unwrapped = unwrapExpression(ret.expression);

      // Direct object literal return
      if (ts.isObjectLiteralExpression(unwrapped)) {
        extractMethodsFromObjectLiteral(unwrapped, depth + 2);
      }

      // Return of a variable: return result
      if (ts.isIdentifier(unwrapped)) {
        const symbol = checker.getSymbolAtLocation(unwrapped);
        const decl = getDeclarationFromSymbol(symbol);
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          if (ts.isObjectLiteralExpression(decl.initializer)) {
            extractMethodsFromObjectLiteral(decl.initializer, depth + 2);
          }
        }
      }
    }
  };

  const resolveFunctionBody = (expr: ts.Expression) => {
    // Arrow function (including async)
    if (ts.isArrowFunction(expr)) {
      return expr.body;
    }

    // Function expression
    if (ts.isFunctionExpression(expr)) {
      return expr.body;
    }

    // Identifier referencing a function
    if (ts.isIdentifier(expr)) {
      const symbol = checker.getSymbolAtLocation(expr);

      const decl = getDeclarationFromSymbol(symbol);

      if (decl) {
        if (ts.isVariableDeclaration(decl) && decl.initializer) {
          return resolveFunctionBody(decl.initializer);
        }

        if (ts.isFunctionDeclaration(decl) && decl.body) {
          return decl.body;
        }
      }
    }

    return undefined;
  };

  const visit = (n: ts.Node) => {
    // Look for: functions: someExpression
    if (ts.isPropertyAssignment(n) && n.name.getText() === "functions") {
      const body = resolveFunctionBody(n.initializer);
      if (body) {
        extractFromFunctionBody(body);
      } else {
        console.warn("Could not resolve functions property initializer:", n.initializer.getText());
      }
    }

    // Look for: { functions } (shorthand)
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
