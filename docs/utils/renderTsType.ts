import { getObjectEntries, isDefined } from "prostgles-types";
import type { TS_Object, TS_Type } from "./getSerializableType/getSerializableType";

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
    type.comments ? `${reIndentLineStarts(type.comments, indentText + "  ")}` : undefined,
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
    return `${title}\n${renderObjectProperties([type], indent + 2)}`;
  }

  if (
    argOrProp &&
    type.type === "union" &&
    type.types.every((member) => member.type === "object")
  ) {
    return `${title}\n${renderObjectProperties(type.types, indent + 2)}`;
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

const renderObjectProperties = (types: TS_Object[], indent: number) =>
  [
    ...new Set(
      types.flatMap((type) =>
        getObjectEntries(type.properties)
          .filter(
            ([, property]) =>
              !(
                property.optional &&
                property.type === "primitive" &&
                property.subType === "undefined"
              ),
          )
          .map(([name, property]) =>
            renderTsType(property, indent, {
              name,
              optional: types.some((member) => member.properties[name]?.optional !== false),
            }),
          ),
      ),
    ),
  ].join("\n");

const reIndentLineStarts = (str: string, indent: string) =>
  str
    .split("\n")
    .map((line) => {
      return `${indent}${line}`;
    })
    .join("\n");

const renderTypeAlias = (type: TS_Type, argOrProp: ArgOrProp | undefined) => {
  const typeAlias =
    type.type === "primitive" ?
      type.subType
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
