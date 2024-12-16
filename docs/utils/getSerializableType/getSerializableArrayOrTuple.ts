import * as ts from "typescript";
import { getSerializableType, TS_Type, TsTypeParser } from "./getSerializableType";

export const getSerializableArrayOrTuple: TsTypeParser = ({
  myType,
  opts,
  checker,
  visited,
  depth,
  nextUnresolvedParentAliases,
}) => {
  const arrayOrTuple =
    checker.isArrayType(myType) ? "array"
    : checker.isTupleType(myType) ? "tuple"
    : undefined;
  if (arrayOrTuple) {
    const itemType =
      arrayOrTuple === "tuple" ? myType : checker.getTypeArguments(myType as ts.TypeReference)[0];
    if (itemType && checker.isTupleType(itemType)) {
      const tupleTypes =
        (itemType as unknown as { resolvedTypeArguments: ts.Type[] }).resolvedTypeArguments.map(
          (d: ts.Type) => {
            return getSerializableType({
              myType: d,
              checker,
              visited,
              parentAliases: nextUnresolvedParentAliases,
              opts,
              depth: depth + 1,
            }).resolvedType;
          }
        ) ?? [];
      return {
        type: "tuple",
        itemTypes: tupleTypes,
      };
    }
    const resolvedItemType: TS_Type =
      itemType ?
        getSerializableType({
          myType: itemType,
          checker,
          visited,
          parentAliases: nextUnresolvedParentAliases,
          opts,
          depth: depth + 1,
        }).resolvedType
      : { type: "primitive", subType: "any" };

    return {
      type: "array",
      itemType: resolvedItemType,
    };
  }
};
