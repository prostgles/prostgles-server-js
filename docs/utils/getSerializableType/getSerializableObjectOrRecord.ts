import * as ts from "typescript";
import {
  getSerializableType,
  getSymbolComments,
  TS_Object,
  TS_Promise,
  TS_Record,
  TS_Type,
  TsTypeParser,
} from "./getSerializableType";
import { simplifyUnionForOptionalType } from "./getSerializableFunction";

export const getSerializableObjectOrRecord: TsTypeParser = ({
  myType,
  checker,
  visited,
  nextUnresolvedParentAliases,
  opts,
  depth,
}) => {
  if ((myType.flags & ts.TypeFlags.Object) !== 0) {
    const objectType = myType as ts.ObjectType;
    if (objectType.objectFlags & ts.ObjectFlags.Reference) {
      const typeReference = objectType as ts.TypeReference;
      const target = typeReference.target;

      if (target.symbol?.escapedName === "Promise") {
        const _innerType = checker.getTypeArguments(typeReference)[0];
        const defaultType: TS_Type = { type: "primitive", subType: "any" };
        const resolvedInnerType =
          _innerType &&
          getSerializableType({
            myType: _innerType,
            checker,
            visited,
            parentAliases: nextUnresolvedParentAliases,
            opts,
            depth: depth + 1,
          }).resolvedType;
        const innerType: Exclude<TS_Type, TS_Promise> =
          resolvedInnerType?.type === "promise" ? defaultType : (resolvedInnerType ?? defaultType);
        return {
          type: "promise",
          innerType,
        };
      }
    }

    const properties: TS_Object["properties"] = {};
    myType.getProperties().forEach((symbol) => {
      const propertyType =
        symbol.valueDeclaration ?
          checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration)
        : checker.getTypeOfSymbol(symbol);

      const resolvedPropertyType = getSerializableType({
        myType: propertyType,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      }).resolvedType;

      /**
       * Prioritise symbol comments over resolved property type comments
       */
      const propertyComments = getSymbolComments(symbol, checker) || resolvedPropertyType.comments;
      const optional = Boolean(symbol.flags & ts.SymbolFlags.Optional);
      properties[symbol.name] = {
        ...(optional ? simplifyUnionForOptionalType(resolvedPropertyType) : resolvedPropertyType),
        optional,
        comments: propertyComments || undefined,
      };
    });

    const comments =
      myType.aliasSymbol?.declarations &&
      getNonInternalTSDeclarations(myType.aliasSymbol?.declarations)
        //@ts-ignore
        ?.flatMap((d) => (!d.jsDoc ? [] : d.jsDoc.map((jd) => jd.comment)))
        .join("\n");

    const indexInfos = checker.getIndexInfosOfType(myType).map((indexInfo) => {
      const resolvedIndexType = getSerializableType({
        myType: indexInfo.type,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      }).resolvedType;
      const resolvedKeyType = getSerializableType({
        myType: indexInfo.keyType,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      }).resolvedType;

      return {
        keyType: resolvedKeyType,
        valueType: resolvedIndexType,
      } satisfies TS_Record["indexInfos"][number];
    });

    if (indexInfos.length) {
      return {
        type: "record",
        indexInfos,
        comments,
      };
    }
    return {
      type: "object",
      properties,
      comments,
    };
  }
};

const getNonInternalTSDeclarations = (declarations: ts.Declaration[]): ts.Declaration[] => {
  return declarations.filter((d) => {
    return !d.getSourceFile().fileName.includes("/node_modules/typescript/");
  });
};
