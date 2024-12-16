import * as ts from "typescript";
import {
  getSerializableType,
  TS_Conditional,
  TsTypeParser,
} from "./getSerializableType";

/**
 * T<G> = G extends true? string : number
 */
export const getSerializableConditional: TsTypeParser = ({
  myType,
  opts,
  checker,
  visited,
  depth,
  nextUnresolvedParentAliases,
}) => {
  if ((myType.flags & ts.TypeFlags.Conditional) !== 0) {
    const condType = myType as ts.ConditionalType;

    const checkType = condType.checkType; // The type being checked
    const extendsType = condType.extendsType; // The type it extends
    const trueType = checker.getTypeAtLocation(condType.root.node.trueType);
    const falseType = checker.getTypeAtLocation(condType.root.node.falseType);

    const resolvedTrueType =
      trueType &&
      getSerializableType({
        myType: trueType,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      }).resolvedType;
    const resolvedFalseType =
      falseType &&
      getSerializableType({
        myType: falseType,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      }).resolvedType;
    const resolvedExtendsType = getSerializableType({
      myType: extendsType,
      checker,
      visited,
      parentAliases: nextUnresolvedParentAliases,
      opts,
      depth: depth + 1,
    }).resolvedType;

    return {
      type: "conditional",
      checkTypeAlias: checker.typeToString(checkType),
      extendsType: resolvedExtendsType,
      trueType: resolvedTrueType,
      falseType: resolvedFalseType,
    } satisfies TS_Conditional;
  }
};
