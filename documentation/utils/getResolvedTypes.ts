import * as ts from "typescript";
import { getSerializableType, TS_Type, VisitedTypesMap } from "./getSerializableType";
import { loadTsFile } from "./loadTsFile";

type Args = {
  filePath: string;
  filter?: {
    nodeNames: string[];
    excludedTypes: string[];
    maxDepth?: number;
  };
};
export const getResolvedTypes = ({ filePath, filter }: Args) => {
  const { checker, sourceFile } = loadTsFile(filePath);

  const results: TS_Type[] = [];
  const visitedMaps: VisitedTypesMap[] = [];

  const visit = (node: ts.Node) => {
    // const nodeText = node.getText();
    // if (nodeText.includes("DBOFullyTyped")) {
    //   console.log("node.name.text", node.getText());
    // }
    if (ts.isTypeAliasDeclaration(node)) {
      if (!filter || filter?.nodeNames.includes(node.name.text)) {
        const type1 = checker.getTypeAtLocation(node.type);
        const { resolvedType, visited } = getSerializableType(
          type1,
          checker,
          undefined,
          [],
          filter,
          0
        );
        results.push(resolvedType);
        visitedMaps.push(visited);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { resolvedTypes: results, visitedMaps };
};
