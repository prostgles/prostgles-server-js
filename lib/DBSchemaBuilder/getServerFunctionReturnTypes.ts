import * as ts from "typescript";

export const getServerFunctionReturnTypes = (instancePath: string) => {
  const program = ts.createProgram([instancePath], {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
  });

  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(instancePath);
  const result: Map<string, string> = new Map();
  if (!sf) return result;

  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText() === "functions" &&
      ts.isArrowFunction(n.initializer)
    ) {
      const body = n.initializer.body;
      if (!ts.isBlock(body)) return;

      const ret = body.statements.find(ts.isReturnStatement);
      if (!ret?.expression || !ts.isObjectLiteralExpression(ret.expression)) return;

      for (const p of ret.expression.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        if (!ts.isCallExpression(p.initializer)) continue;

        const arg = p.initializer.arguments[0];
        if (!arg || !ts.isObjectLiteralExpression(arg)) continue;

        const runProp = arg.properties.find(
          (x): x is ts.PropertyAssignment =>
            ts.isPropertyAssignment(x) && x.name.getText() === "run",
        );
        if (!runProp) continue;

        const runExpr = runProp.initializer;
        if (!ts.isFunctionLike(runExpr)) continue;

        const sig = checker.getSignatureFromDeclaration(runExpr);
        if (!sig) continue;

        const rt = checker.getReturnTypeOfSignature(sig);

        result.set(p.name.getText(), checker.typeToString(rt));
      }
    }

    ts.forEachChild(n, visit);
  };

  visit(sf);
  return result;
};
