import * as fs from "fs";
import * as path from "path";
import { getObjectEntries, isDefined, TableHandler } from "prostgles-types";
import { definitions } from "./clientTypes";
import { getResolvedTypes } from "./getResolvedTypes";
import { TS_Function, TS_Type } from "./getSerializableType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateClientDocs = () => {
  const clientFilePath = path.resolve(
    `${testFolderPath}/client/node_modules/prostgles-client/dist/prostgles.d.ts`
  );
  const excludedTypes = [
    // "FullFilter",
    // "FullFilter<T, S> | undefined",
    "FieldFilter | undefined",
    "SyncOptions",
    "SyncOneOptions",
    "PG_COLUMN_UDT_DATA_TYPE",
  ];
  const { resolvedTypes, visitedMaps } = getResolvedTypes({
    filePath: clientFilePath,
    filter: {
      nodeNames: ["TableHandlerClient"],
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

  const docPath = `${docsFolder}METHODS.md`;

  const tableHandler = definitions[0];
  const isomotphicMethodNames = {
    count: 1,
    delete: 1,
    find: 1,
    insert: 1,
    update: 1,
    findOne: 1,
    getColumns: 1,
    getInfo: 1,
    size: 1,
    subscribe: 1,
    subscribeOne: 1,
    updateBatch: 1,
    upsert: 1,
  } satisfies Record<keyof TableHandler, 1>;

  const isomorphicMd = getMethodsDocs(
    getObjectEntries(tableHandler.properties).filter(
      ([methodName]) => isomotphicMethodNames[methodName]
    )
  );
  const clientMd = getMethodsDocs(
    getObjectEntries(tableHandler.properties).filter(
      ([methodName]) => !isomotphicMethodNames[methodName]
    )
  );

  const result = [
    `# Isomorphic Methods`,
    ``,
    `The following methods are available on the client and server.`,
    ``,
    isomorphicMd.join("\n\n"),

    `# Client Methods`,
    ``,
    `The following methods are available on the client.`,
    ``,
    clientMd.join("\n\n"),
  ].join("\n");

  fs.writeFileSync(docPath, result, { encoding: "utf-8" });
};

const getAliasWithoutGenerics = (type: TS_Type) => {
  if (type.type === "union") return type.types.map(getAliasWithoutGenerics).join(" | ");
  return type.aliasSymbolescapedName || type.alias;
};

const getMethodsDocs = (methods: [name: string, TS_Type][]) => {
  return methods.map(([methodName, _methodInfo]) => {
    const methodInfo = (
      _methodInfo.type === "function" ?
        (_methodInfo as TS_Function)
        // : _methodInfo.type === "union" ? _methodInfo.types.find((t) => t.type === "function")
      : undefined) as TS_Function | undefined;
    if (!methodInfo) return "";
    const args = `${methodInfo.arguments
      .map((arg) => `${arg.name}${arg.optional ? "?" : ""}: ${getAliasWithoutGenerics(arg)}`)
      .join(", ")}`;
    const rType = `${methodInfo.returnType.aliasSymbolescapedName || methodInfo.returnType.alias}`
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return [
      `## ${methodName}<span style="opacity: 0.6;">(${args}): ${rType}</span>`,
      methodInfo.comments ?? "",
      `\`\`\`typescript`,
      `${methodName}: (): `,
      `\`\`\``,
      `#### Parameters`,
      ``,
      ...methodInfo.arguments.map((arg) => {
        return renderType(arg, 2, { name: arg.name, optional: arg.optional });
      }),
      // `#### Return type`,
      `#### ` + renderType(methodInfo.returnType, 0, undefined),
    ].join("\n");
  });
};

const renderedAliases = new Set<string>();
const renderType = (
  type: TS_Type,
  indent = 2,
  argOrProp: { name: string; optional: boolean } | undefined
): string => {
  const indentText = " ".repeat(indent);
  const typeAlias = `\`${type.aliasSymbolescapedName || type.alias}\``;
  const typeText =
    type.aliasSymbolescapedName && type.type === "object" ?
      `<span style="color: green;">${type.aliasSymbolescapedName}</span>`
    : typeAlias;
  const title = [
    `${indentText}${argOrProp?.name ? `- **${argOrProp.name}**: ` : ""}${typeAlias}`,
    `${type.comments ? `${removeLineBreaks(type.comments, indentText + "  ")}` : ""}`,
  ].join("\n\n");

  if (typeAlias?.includes("FullFilter")) {
    // debugger;
  }
  /**
   * Re-use rendered types by linking them through an anchor tag
   */
  if (type.aliasSymbolescapedName && argOrProp?.name) {
    renderedAliases.add(type.aliasSymbolescapedName);
    console.log(type.aliasSymbolescapedName);
  }

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

const removeLineBreaks = (str: string, indent: string) =>
  str
    .split("\n")
    .map((line) => {
      return `${indent}${line.trimStart()}`;
    })
    .join("\n");

const renderTypeAlias = (type: TS_Type) => {
  const typeAlias = type.aliasSymbolescapedName || type.alias;
  const style = type.aliasSymbolescapedName ? `style="color: green;"` : "";
  // if (renderedAliases.has(typeAlias)) {
  //   return `<a ${style} href="#${typeAlias}">${typeAlias}</a>`;
  // }
  return `<span ${style}>${typeAlias}</span>`;
};
