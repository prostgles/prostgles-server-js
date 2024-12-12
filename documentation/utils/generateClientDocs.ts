import * as fs from "fs";
import * as path from "path";
import { isDefined } from "prostgles-types";
import { getResolvedTypes } from "./getResolvedTypes";
import { getObjectEntries } from "prostgles-types";
import { definitions } from "./clientTypes";
import { TS_Function, TS_Type } from "./getSerializableType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateClientDocs = () => {
  const clientFilePath = path.resolve(
    `${testFolderPath}/client/node_modules/prostgles-client/dist/prostgles.d.ts`
  );
  const excludedTypes = [
    "FullFilter",
    "FullFilter<T, S> | undefined",
    "FieldFilter | undefined",
    "SyncOptions",
    "SyncOneOptions",
    "PG_COLUMN_UDT_DATA_TYPE",
  ];
  const { resolvedTypes, visitedMaps } = getResolvedTypes({
    filePath: clientFilePath,
    filter: {
      nodeNames: [
        // "ViewHandlerClient",
        "TableHandlerClient",
      ],
      excludedTypes,
    },
  });

  const jsonTypes = JSON.stringify(
    [
      ...resolvedTypes,
      ...visitedMaps
        .flatMap((m) =>
          Array.from(m.values()).map((v) =>
            excludedTypes.includes(v.resolvedType.alias ?? "") ? v.resolvedType : undefined
          )
        )
        .filter(isDefined),
    ] satisfies TS_Type[],
    null,
    2
  );
  fs.writeFileSync(
    `${__dirname}/../clientTypes.ts`,
    [
      `import type { TS_Type } from "./getSerializableType";`,
      `export const definitions = ${jsonTypes} as const satisfies TS_Type[];`,
    ].join("\n"),
    {
      encoding: "utf-8",
    }
  );

  const docPath = `${docsFolder}CLIENT.md`;
  generateMDX(docPath);
};

const getAliasWithoutGenerics = (type: TS_Type) => {
  if (type.type === "union") return type.types.map(getAliasWithoutGenerics).join(" | ");
  return type.aliasSymbolescapedName || type.alias;
};

export const generateMDX = (filePath: string) => {
  const tableHandler = definitions[0];
  const mdxContent = getObjectEntries(tableHandler.properties).map(([methodName, _methodInfo]) => {
    const methodInfo = (
      _methodInfo.type === "function" ?
        (_methodInfo as TS_Function)
        // : _methodInfo.type === "union" ? _methodInfo.types.find((t) => t.type === "function")
      : undefined) as TS_Function | undefined;
    if (!methodInfo) return "";
    return [
      `## ${methodName}()`,
      methodInfo.comments ?? "",
      `\`\`\`typescript
  ${methodName}: (${methodInfo.arguments
    .map((arg) => `${arg.name}${arg.optional ? "?" : ""}: ${getAliasWithoutGenerics(arg)}`)
    .join(", ")}): ${methodInfo.returnType.aliasSymbolescapedName || methodInfo.returnType.alias}
  \`\`\``,
      `#### Arguments`,
      ``,
      ...methodInfo.arguments.map((arg) => {
        return renderType(arg, 2, { name: arg.name, optional: arg.optional });
      }),
      `#### Return type`,
      renderType(methodInfo.returnType, 0, undefined),
    ].join("\n");
  });
  const result = mdxContent.join("\n\n");
  fs.writeFileSync(filePath, result, { encoding: "utf-8" });
};

const renderType = (
  type: TS_Type,
  indent = 2,
  argOrProp: { name: string; optional: boolean } | undefined
): string => {
  const indentText = " ".repeat(indent);
  const title = `${indentText}${argOrProp?.name ? `- **${argOrProp.name}**: ` : ""}\`${
    type.aliasSymbolescapedName || type.alias
  }\`  ${type.comments ? ` - ${removeLineBreaks(type.comments)}` : ""}`;
  if (type.type === "primitive" || type.type === "literal") {
    return title;
  }
  if (type.type === "object") {
    return (
      title +
      `\n` +
      getObjectEntries(type.properties)
        .map(([name, p]) => renderType(p, indent + 2, { name, optional: p.optional }))
        .join("\n")
    );
  }

  if (type.type === "promise") {
    const innerType = renderType(type.innerType, indent, argOrProp);
    // if (argOrProp?.name) {
    //   return [title, innerType].join("\n");
    // }
    return innerType;
  }

  if (type.type === "array") {
    return renderType(type.itemType, indent, argOrProp);
  }

  return title;
};

const removeLineBreaks = (str = "") =>
  str
    .split("\n")
    .map((line) => {
      if (!line.trim().endsWith(".")) return `${line}.`;
    })
    .join(" ");
