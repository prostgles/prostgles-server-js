import {
  TS_Function,
  TS_Type,
} from "./getSerializableType/getSerializableType";
import { renderTsType } from "./renderTsType";
export const getMethodsDocs = (methods: [name: string, TS_Type][]) => {
  return methods.map(([methodName, _methodInfo]) => {
    const methodInfo = (
      _methodInfo.type === "function"
        ? (_methodInfo as TS_Function)
        : // : _methodInfo.type === "union" ? _methodInfo.types.find((t) => t.type === "function")
          undefined
    ) as TS_Function | undefined;
    if (!methodInfo) return "";
    const args = methodInfo.arguments.map(
      (arg) =>
        `${arg.name}${arg.optional ? "?" : ""}: ${getAliasWithoutGenerics(arg)}`,
    );

    const escapedAliasFirst = (t: TS_Type) =>
      t.aliasSymbolescapedName || t.alias || "";
    // const rType = `${methodInfo.returnType.aliasSymbolescapedName || methodInfo.returnType.alias}`
    const rType = replaceSigns(
      methodInfo.returnType.type === "promise"
        ? `Promise<${escapedAliasFirst(methodInfo.returnType.innerType)}>`
        : escapedAliasFirst(methodInfo.returnType),
    );
    return [
      `## ${methodName}<span style="opacity: 0.6;">(${args.join(", ")}): ${rType}</span>`,
      methodInfo.comments ?? "",
      // `\`\`\`typescript`,
      // `${methodName}: (): `,
      // `\`\`\``,
      ...(methodInfo.arguments.length
        ? [
            `#### Parameters`,
            ``,
            ...methodInfo.arguments.map((arg) => {
              return renderTsType(arg, 2, {
                name: arg.name,
                optional: arg.optional,
              });
            }),
          ]
        : []),
      `#### Return type`,
      `#### ` + renderTsType(methodInfo.returnType, 0, undefined),
    ].join("\n");
  });
};

const getAliasWithoutGenerics = (type: TS_Type) => {
  if (type.type === "union")
    return type.types.map(getAliasWithoutGenerics).join(" | ");
  return type.aliasSymbolescapedName || type.alias;
};

const replaceSigns = (str: string) =>
  str.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
