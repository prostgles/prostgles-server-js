import { dirname } from "node:path";
import * as ts from "typescript";

export const getServerFunctionReturnTypes = (instancePath: string) => {
  const configPath = ts.findConfigFile(dirname(instancePath), (f) => ts.sys.fileExists(f));
  if (!configPath) throw new Error("tsconfig.json not found");

  const { config } = ts.readConfigFile(configPath, (f) => ts.sys.readFile(f));
  const { fileNames, options } = ts.parseJsonConfigFileContent(config, ts.sys, dirname(configPath));

  const program = ts.createProgram(fileNames, options);

  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(instancePath);
  const result: Map<string, string> = new Map();
  if (!sf) {
    throw new Error(`Source file not found: ${instancePath}`);
  }

  const getActualSymbol = (symbol: ts.Symbol | undefined): ts.Symbol | undefined => {
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) {
      return checker.getAliasedSymbol(symbol);
    }
    return symbol;
  };

  const getDeclarationFromSymbol = (symbol: ts.Symbol | undefined): ts.Declaration | undefined => {
    const actualSymbol = getActualSymbol(symbol);
    if (!actualSymbol) return undefined;
    return actualSymbol.valueDeclaration ?? actualSymbol.declarations?.[0];
  };

  /**
   * Extract return type from a defineFunction/defineAdminFunction/definePublicFunction call
   */
  const extractFromDefineCall = (callExpr: ts.CallExpression, propertyName: string) => {
    const arg = callExpr.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return;

    const runProp = arg.properties.find(
      (x): x is ts.PropertyAssignment => ts.isPropertyAssignment(x) && x.name.getText() === "run",
    );
    if (!runProp) return;

    const runExpr = runProp.initializer;
    if (!ts.isFunctionLike(runExpr)) return;

    const sig = checker.getSignatureFromDeclaration(runExpr);
    if (!sig) return;

    const rt = checker.getReturnTypeOfSignature(sig);
    result.set(propertyName, checker.typeToString(rt));
  };

  /**
   * Check if a call expression is a define function call (defineFunction, defineAdminFunction, etc.)
   */
  const isDefineFunctionCall = (node: ts.Node): node is ts.CallExpression => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      const name = callee.getText();
      return name.includes("define") && name.toLowerCase().includes("function");
    }
    return false;
  };

  /**
   * Extract methods from an object literal expression (the return value)
   */
  const extractFromObjectLiteral = (obj: ts.ObjectLiteralExpression) => {
    for (const prop of obj.properties) {
      // Handle: methodName: defineFunction({ ... })
      if (ts.isPropertyAssignment(prop)) {
        if (isDefineFunctionCall(prop.initializer)) {
          extractFromDefineCall(prop.initializer, prop.name.getText());
        }
      }

      // Handle: ...adminMethods (spread of a variable containing methods)
      if (ts.isSpreadAssignment(prop)) {
        const spreadExpr = prop.expression;

        // If it's an identifier, resolve it
        if (ts.isIdentifier(spreadExpr)) {
          const symbol = checker.getSymbolAtLocation(spreadExpr);
          const decl = getDeclarationFromSymbol(symbol);

          if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
            // The variable might be an object literal with methods
            if (ts.isObjectLiteralExpression(decl.initializer)) {
              extractMethodsFromObjectLiteral(decl.initializer);
            }
          }
        }

        // If it's directly an object literal
        if (ts.isObjectLiteralExpression(spreadExpr)) {
          extractMethodsFromObjectLiteral(spreadExpr);
        }
      }

      // Handle shorthand: { methodName } where methodName is a variable
      if (ts.isShorthandPropertyAssignment(prop)) {
        const symbol = checker.getShorthandAssignmentValueSymbol(prop);
        const decl = symbol?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          if (isDefineFunctionCall(decl.initializer)) {
            extractFromDefineCall(decl.initializer, prop.name.getText());
          }
        }
      }
    }
  };

  /**
   * Extract methods from an object literal that contains method definitions
   * (like the adminMethods object)
   */
  const extractMethodsFromObjectLiteral = (obj: ts.ObjectLiteralExpression) => {
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop)) {
        if (isDefineFunctionCall(prop.initializer)) {
          extractFromDefineCall(prop.initializer, prop.name.getText());
        }
      }
    }
  };

  /**
   * Find return statements in a function body and extract from returned object literals
   */
  const extractFromFunctionBody = (body: ts.Block | ts.ConciseBody) => {
    // Handle concise body: () => ({ ... })
    if (!ts.isBlock(body)) {
      if (ts.isObjectLiteralExpression(body)) {
        extractFromObjectLiteral(body);
      }
      // Handle: () => someVariable
      if (ts.isIdentifier(body)) {
        const symbol = checker.getSymbolAtLocation(body);
        const decl = getDeclarationFromSymbol(symbol);
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          if (ts.isObjectLiteralExpression(decl.initializer)) {
            extractFromObjectLiteral(decl.initializer);
          }
        }
      }
      return;
    }

    // Find all return statements (there might be multiple in async functions)
    const findReturnStatements = (node: ts.Node): ts.ReturnStatement[] => {
      const returns: ts.ReturnStatement[] = [];

      const visit = (n: ts.Node) => {
        if (ts.isReturnStatement(n)) {
          returns.push(n);
        }
        // Don't descend into nested functions
        if (!ts.isFunctionLike(n)) {
          ts.forEachChild(n, visit);
        }
      };

      ts.forEachChild(node, visit);
      return returns;
    };

    const returnStatements = findReturnStatements(body);

    for (const ret of returnStatements) {
      if (!ret.expression) continue;

      // Direct object literal return
      if (ts.isObjectLiteralExpression(ret.expression)) {
        extractFromObjectLiteral(ret.expression);
      }

      // Return of a variable: return result
      if (ts.isIdentifier(ret.expression)) {
        const symbol = checker.getSymbolAtLocation(ret.expression);
        const decl = getDeclarationFromSymbol(symbol);
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          if (ts.isObjectLiteralExpression(decl.initializer)) {
            extractFromObjectLiteral(decl.initializer);
          }
        }
      }

      // Handle: return { ...a, ...b } as SomeType
      if (ts.isAsExpression(ret.expression)) {
        if (ts.isObjectLiteralExpression(ret.expression.expression)) {
          extractFromObjectLiteral(ret.expression.expression);
        }
      }
    }
  };

  const resolveFunctionBody = (expr: ts.Expression): ts.Block | ts.ConciseBody | undefined => {
    // Case 1: Inline arrow function (including async)
    if (ts.isArrowFunction(expr)) {
      return expr.body;
    }

    // Case 2: Inline function expression
    if (ts.isFunctionExpression(expr)) {
      return expr.body;
    }

    // Case 3: Identifier referencing a function
    if (ts.isIdentifier(expr)) {
      const symbol = checker.getSymbolAtLocation(expr);
      const decl = getDeclarationFromSymbol(symbol);

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
      const decl = getDeclarationFromSymbol(symbol);

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
