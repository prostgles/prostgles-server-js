import * as ts from "typescript";
import {
  getSerializableType,
  getSymbolComments,
  TS_Function,
  TS_Type,
  TsTypeParser,
} from "./getSerializableType";
import { isDefined } from "prostgles-types";

export const getSerializableFunction: TsTypeParser = ({
  myType,
  opts,
  checker,
  visited,
  depth,
  nextUnresolvedParentAliases,
}) => {
  const [firstSignature] = myType.getCallSignatures();
  if (firstSignature) {
    const parameters = firstSignature.parameters
      .map((param) => {
        const { valueDeclaration } = param;
        if (!valueDeclaration) return undefined;
        const paramType = checker.getTypeOfSymbolAtLocation(
          param,
          valueDeclaration,
        );
        const resolvedParamType = getSerializableType({
          myType: paramType,
          checker,
          visited,
          parentAliases: nextUnresolvedParentAliases,
          opts,
          depth: depth + 1,
        }).resolvedType;
        const paramComments = getSymbolComments(param, checker);
        const optional = Boolean(
          (ts as any).isParameterDeclaration(param.valueDeclaration) &&
            checker.isOptionalParameter(
              valueDeclaration as ts.ParameterDeclaration,
            ),
        );
        const name = param.escapedName.toString() || param.name;

        // if (name === "selectParams") {
        //   debugger;
        // }
        const resolvedParam = optional
          ? simplifyUnionForOptionalType(resolvedParamType)
          : resolvedParamType;
        return {
          name,
          optional,
          ...resolvedParam,
          comments: resolvedParam.comments || paramComments,
        };
      })
      .filter(isDefined);
    const returnType = getSerializableType({
      myType: checker.getReturnTypeOfSignature(firstSignature),
      checker,
      visited,
      parentAliases: nextUnresolvedParentAliases,
      opts,
      depth: depth + 1,
    }).resolvedType;

    return {
      type: "function",
      arguments: parameters,
      returnType,
    } satisfies TS_Function;
  }
};

/**
 * Optional types (function arguments or object properties) are represented as a union of some types AND `undefined`.
 * Here we remove the needless `undefined` type from the union for brevity.
 */
export const simplifyUnionForOptionalType = (resolvedType: TS_Type) => {
  if (resolvedType.type === "union") {
    const indexOfUndefined = resolvedType.types.findIndex(
      (t) => t.type === "primitive" && t.subType === "undefined",
    );
    if (indexOfUndefined === -1) return resolvedType;

    if (resolvedType.types.length === 2) {
      const unionTypes = resolvedType.types;
      const nonUndefined = unionTypes.find((_, i) => indexOfUndefined !== i);
      if (
        nonUndefined &&
        (nonUndefined.type !== "primitive" ||
          nonUndefined.subType !== "undefined")
      ) {
        return nonUndefined;
      }
    } else {
      return {
        ...resolvedType,
        types: resolvedType.types.filter((_, i) => indexOfUndefined !== i),
      };
    }
  }
  return resolvedType;
};
