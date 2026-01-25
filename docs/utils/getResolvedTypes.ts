import * as fs from "fs";
import * as ts from "typescript";
import {
  getSerializableType,
  ResolveTypeOptions,
  TS_Type,
  VisitedTypesMap,
} from "./getSerializableType/getSerializableType";
import { loadTsFile } from "./loadTsFile";

const docsFolder = `${__dirname}/../../`;

type Args = {
  filePath: string;
  filter?: {
    nodeNames: string[];
  } & ResolveTypeOptions;
  outputFilename?: string;
};

export const getResolvedTypes = ({ filePath, outputFilename, filter }: Args) => {
  const { checker, sourceFile } = loadTsFile(filePath);

  const results: TS_Type[] = [];
  const visitedMaps: VisitedTypesMap[] = [];

  const visit = (node: ts.Node) => {
    console.log(node.pos, ts.SyntaxKind[node.kind], node.getText());
    if (node.getText().startsWith("functions: ")) {
      debugger;
    }
    if (ts.isTypeAliasDeclaration(node)) {
      if (!filter || filter?.nodeNames.includes(node.name.text)) {
        const type1 = checker.getTypeAtLocation(node.type);
        const { resolvedType, visited } = getSerializableType({
          myType: type1,
          checker,
          visited: new Map(),
          parentAliases: [],
          opts: filter,
          depth: 0,
        });
        results.push(resolvedType);
        visitedMaps.push(visited);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  const result = { resolvedTypes: results, visitedMaps };

  if (outputFilename) {
    const serverTypesStr = [
      `import type { TS_Type } from "./getSerializableType/getSerializableType";`,
      `export const definitions = ${JSON.stringify(results, null, 2)} as const satisfies TS_Type[];`,
    ].join("\n");

    fs.writeFileSync(`${docsFolder}/utils/${outputFilename}.ts`, serverTypesStr, {
      encoding: "utf-8",
    });
  }

  return result;
};
