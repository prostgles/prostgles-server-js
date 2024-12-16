import { getObjectEntries, isDefined } from "prostgles-types";
import { TS_Type } from "./getSerializableType/getSerializableType";

type ArgOrProp = { name: string; optional: boolean };
const renderedAliases = new Set<string>();
export const renderTsType = (
  type: TS_Type,
  indent = 2,
  argOrProp: ArgOrProp | undefined,
): string => {
  const indentText = " ".repeat(indent);
  const typeAlias = renderTypeAlias(type, argOrProp);
  const title = [
    `${indentText}${argOrProp?.name ? `- **${argOrProp.name}** <span style="color: ${argOrProp.optional ? "grey" : "red"}">${argOrProp.optional ? "optional" : "required"}</span> ` : ""}${typeAlias}`,
    type.comments
      ? `${reIndentLineStarts(type.comments, indentText + "  ")}`
      : undefined,
  ]
    .filter(isDefined)
    .join("\n\n");

  /**
   * Re-use rendered types by linking them through an anchor tag
   */
  if (type.aliasSymbolescapedName && argOrProp?.name) {
    renderedAliases.add(type.aliasSymbolescapedName);
    // console.log(type.aliasSymbolescapedName);
  }

  if (type.type === "primitive" || type.type === "literal") {
    return title;
  }

  if (type.type === "object") {
    return (
      title +
      `\n` +
      getObjectEntries(type.properties)
        .map(([name, p]) =>
          renderTsType(p, indent + 2, { name, optional: p.optional }),
        )
        .join("\n")
    );
  }

  if (type.type === "promise" && !argOrProp) {
    const innerType = renderTsType(type.innerType, indent, argOrProp);
    // if (argOrProp?.name) {
    //   return [title, innerType].join("\n");
    // }
    return innerType;
  }

  if (type.type === "array") {
    return renderTsType(type.itemType, indent, argOrProp);
  }

  return title;
};

const reIndentLineStarts = (str: string, indent: string) =>
  str
    .split("\n")
    .map((line) => {
      return `${indent}${line}`;
    })
    .join("\n");

const renderTypeAlias = (type: TS_Type, argOrProp: ArgOrProp | undefined) => {
  const typeAlias =
    type.type === "primitive"
      ? type.subType
      : (type.aliasSymbolescapedName || type.alias || type.type)
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
  const color = type.type === "literal" ? "brown" : "green";
  const style = `style="color: ${color};"`;

  // if (type.type === "union") {
  //   const types =
  //     argOrProp?.optional ?
  //       type.types.filter((t) => !(t.type === "primitive" && t.subType === "undefined"))
  //     : type.types;
  //   return types.map((t) => renderTypeAlias(t, undefined)).join(" | ");
  // }
  return `<span ${style}>${typeAlias}</span>`;
};
