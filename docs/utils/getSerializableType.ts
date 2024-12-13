import * as ts from "typescript";
import { AnyObject, isDefined } from "prostgles-types";

type TS_Base = {
  alias?: string;
  aliasSymbolescapedName?: string;
  comments?: string;
  intersectionParent?: string;
};

export type TS_Literal = TS_Base & {
  type: "literal";
  value: string;
};

export type TS_Primitive = TS_Base & {
  type: "primitive";
  subType: "string" | "number" | "boolean" | "any" | "null" | "undefined";
};

export type TS_Object = TS_Base & {
  type: "object";
  properties: Record<string, TS_Type & { optional: boolean }>;
};

export type TS_Array = TS_Base & {
  type: "array";
  itemType: TS_Type;
};

export type TS_Tuple = TS_Base & {
  type: "tuple";
  itemTypes: TS_Type[];
};

export type TS_Function = TS_Base & {
  type: "function";
  arguments: (TS_Type & { name: string; optional: boolean })[];
  returnType: TS_Type;
};

export type TS_Promise = TS_Base & {
  type: "promise";
  innerType: Exclude<TS_Type, TS_Promise>;
};

export type TS_Union = TS_Base & {
  type: "union";
  types: TS_Type[];
};

export type TS_Reference = TS_Base & {
  type: "reference";
  alias: string;
};

export type TS_Type =
  | TS_Primitive
  | TS_Literal
  | TS_Object
  | TS_Array
  | TS_Tuple
  | TS_Function
  | TS_Union
  | TS_Promise
  | TS_Reference;

export type VisitedTypesMap = Map<
  string,
  { resolvedType: TS_Type; type: ts.Type; referenceType?: TS_Type }
>;

export const getSerializableType = (
  myType: ts.Type,
  checker: ts.TypeChecker,
  visited: VisitedTypesMap = new Map(),
  parentAliases: string[],
  opts: ResolveTypeOptions | undefined,
  depth: number
): { resolvedType: TS_Type; visited: VisitedTypesMap } => {
  let alias = "unknown";
  const { escapedName } = myType.aliasSymbol ?? {};
  const aliasSymbolescapedName = escapedName?.toString();
  const symbol = myType.aliasSymbol ?? myType.symbol;
  const comments = symbol ? getSymbolComments(symbol, checker) : undefined;
  try {
    alias = checker.typeToString(myType);
  } catch (e) {
    console.log("Error resolving type", myType, e);
  }

  /* Circular resolved type */
  const visitedType = visited.get(alias);
  if (visitedType) {
    return { resolvedType: visitedType.referenceType ?? visitedType.resolvedType, visited };
  }
  const withAlias = (_type: TS_Type) => {
    const finalComments = _type.comments || comments;
    const resolvedType: TS_Type = sortObjectsByKeyOrder(
      {
        alias: _type.alias ?? alias,
        aliasSymbolescapedName,
        ..._type,
        ...(finalComments && { comments: finalComments }),
      },
      ["type", "alias", "aliasSymbolescapedName", "comments"]
    );

    let referenceType: TS_Type | undefined;
    if (
      opts?.excludedTypes.includes(alias) ||
      (escapedName && opts?.excludedTypes.includes(escapedName)) ||
      (opts?.maxDepth !== undefined && depth >= opts.maxDepth)
    ) {
      referenceType =
        resolvedType.type === "primitive" ?
          resolvedType
        : {
            type: "reference",
            alias,
            aliasSymbolescapedName,
            comments: resolvedType.comments,
          };
    }

    visited.set(alias, { resolvedType, referenceType, type: myType });

    return { resolvedType: referenceType ?? resolvedType, visited };
  };

  const unresolvedParentAliases = parentAliases?.filter((a) => !visited.get(a)) ?? [];

  /* Circular unresolved type */
  if (unresolvedParentAliases.includes(alias)) {
    return withAlias({
      type: "reference",
      alias,
    });
  }
  const nextUnresolvedParentAliases = unresolvedParentAliases.concat(alias);

  // if (alias === "[FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][]") {
  //   debugger;
  // }

  if (myType.isUnion()) {
    const unionTypes = myType.types.map((t) => {
      const resolvedUnionMember = getSerializableType(
        t,
        checker,
        visited,
        nextUnresolvedParentAliases,
        opts,
        depth + 1
      );
      return resolvedUnionMember.resolvedType;
    });

    /**
     * "boolean | undefined" ends up in types as
     * { intrinsicName: "true" } | { intrinsicName: "false" } | { intrinsicName: "undefined" }
     * So we need to check for "true" and "false" and merge them into "boolean"
     */
    const booleanTypes = unionTypes.filter(
      (t) => t.type === "primitive" && t.subType === "boolean"
    );
    const dedupedTypes =
      booleanTypes.length > 1 ?
        unionTypes
          .filter((t) => t.type !== "primitive" || t.subType !== "boolean")
          .concat(booleanTypes[0]!)
      : unionTypes;

    const result = withAlias({
      type: "union",
      types: dedupedTypes,
    });

    return result;
  }

  if ((myType.flags & ts.TypeFlags.String) !== 0) {
    return withAlias({ type: "primitive", subType: "string" });
  }

  if ((myType.flags & ts.TypeFlags.NumberLike) !== 0) {
    return withAlias({ type: "primitive", subType: "number" });
  }

  if ((myType.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return withAlias({ type: "primitive", subType: "boolean" });
  }

  if ((myType.flags & ts.TypeFlags.Null) !== 0) {
    return withAlias({ type: "primitive", subType: "null" });
  }

  if ((myType.flags & ts.TypeFlags.Undefined) !== 0) {
    return withAlias({ type: "primitive", subType: "undefined" });
  }

  if (checker.isArrayType(myType)) {
    const itemType = checker.getTypeArguments(myType as ts.TypeReference)[0];
    if (itemType && checker.isTupleType(itemType)) {
      const tupleTypes =
        (itemType as unknown as { resolvedTypeArguments: ts.Type[] }).resolvedTypeArguments.map(
          (d: ts.Type) => {
            return getSerializableType(
              d,
              checker,
              visited,
              nextUnresolvedParentAliases,
              opts,
              depth + 1
            ).resolvedType;
          }
        ) ?? [];
      return withAlias({
        type: "tuple",
        itemTypes: tupleTypes,
      });
    }
    const resolvedItemType: TS_Type =
      itemType ?
        getSerializableType(
          itemType,
          checker,
          visited,
          nextUnresolvedParentAliases,
          opts,
          depth + 1
        ).resolvedType
      : { type: "primitive", subType: "any" };

    return withAlias({
      type: "array",
      itemType: resolvedItemType,
    });
  }

  const [firstSignature] = myType.getCallSignatures();
  if (firstSignature) {
    const parameters = firstSignature.parameters
      .map((param) => {
        const { valueDeclaration } = param;
        if (!valueDeclaration) return undefined;
        const paramType = checker.getTypeOfSymbolAtLocation(param, valueDeclaration);
        const resolvedParamType = getSerializableType(
          paramType,
          checker,
          visited,
          nextUnresolvedParentAliases,
          opts,
          depth + 1
        ).resolvedType;
        const paramComments = getSymbolComments(param, checker);
        const optional = Boolean(
          (ts as any).isParameterDeclaration(param.valueDeclaration) &&
            checker.isOptionalParameter(valueDeclaration as ts.ParameterDeclaration)
        );
        const name = param.escapedName.toString() || param.name;
        const resolvedParam =
          optional ? simplifyUnionForOptionalType(resolvedParamType) : resolvedParamType;
        return {
          name,
          optional,
          ...resolvedParam,
          comments: resolvedParam.comments || paramComments,
        };
      })
      .filter(isDefined);
    const returnType = getSerializableType(
      checker.getReturnTypeOfSignature(firstSignature),
      checker,
      visited,
      nextUnresolvedParentAliases,
      opts,
      depth + 1
    ).resolvedType;

    return withAlias({
      type: "function",
      arguments: parameters,
      returnType,
    });
  }

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
          getSerializableType(
            _innerType,
            checker,
            visited,
            nextUnresolvedParentAliases,
            opts,
            depth + 1
          ).resolvedType;
        const innerType: Exclude<TS_Type, TS_Promise> =
          resolvedInnerType?.type === "promise" ? defaultType : (resolvedInnerType ?? defaultType);
        return withAlias({
          type: "promise",
          innerType,
        });
      }
    }

    const properties: TS_Object["properties"] = {};
    myType.getProperties().forEach((symbol) => {
      const propertyType = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!);
      const resolvedPropertyType = getSerializableType(
        propertyType,
        checker,
        visited,
        nextUnresolvedParentAliases,
        opts,
        depth + 1
      ).resolvedType;
      const propertyComments = resolvedPropertyType.comments || getSymbolComments(symbol, checker);
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
    return withAlias({
      type: "object",
      properties,
      comments,
    });
  }

  /**
   * A & B
   */
  if (myType.isIntersection()) {
    const intersectionTypes = myType.types.map((t) => {
      const { resolvedType: intersectionType } = getSerializableType(
        t,
        checker,
        visited,
        nextUnresolvedParentAliases,
        opts,
        depth + 1
      );

      if (intersectionType.type === "object") {
        intersectionType.intersectionParent = aliasSymbolescapedName;
      }
      return intersectionType;
    });
    if (intersectionTypes.every((t) => t.type === "object")) {
      const properties = (intersectionTypes as TS_Object[]).reduce((acc, t) => {
        const propertiesWithParentObject = Object.entries(t.properties).reduce(
          (acc, [k, v]) => ({
            ...acc,
            [k]: { ...v, intersectionParent: t.aliasSymbolescapedName },
          }),
          {}
        );
        return { ...acc, ...propertiesWithParentObject };
      }, {});
      return withAlias({
        type: "object",
        properties,
      });
    }
    return withAlias({
      type: "union",
      types: intersectionTypes,
    });
  }

  /**
   * Type parameter. E.g.:
   * function example<T>(arg: T){ }
   */
  if (myType.isTypeParameter()) {
    const extendedType = myType.getConstraint();
    if (extendedType) {
      const { resolvedType: resolvedExtendedType } = getSerializableType(
        extendedType,
        checker,
        visited,
        nextUnresolvedParentAliases,
        opts,
        depth + 1
      );
      return withAlias(resolvedExtendedType);
    }
  }

  if (myType.isStringLiteral()) {
    return withAlias({ type: "literal", value: myType.value });
  }

  return withAlias({ type: "primitive", subType: "any" });
};

type ResolveTypeOptions = {
  excludedTypes: string[];
  maxDepth?: number;
};
export const resolveType = (
  myType: ts.Type,
  checker: ts.TypeChecker,
  opts: ResolveTypeOptions
): { resolvedType: TS_Type; constituentTypes?: TS_Type[] } => {
  const { resolvedType } = getSerializableType(myType, checker, undefined, [], opts, 0);
  if (resolvedType.type === "reference" && opts.excludedTypes.includes(resolvedType.alias)) {
    return { resolvedType: { type: "primitive", subType: "any" } };
  }
  return { resolvedType, constituentTypes: [] };
};

const getNonInternalTSDeclarations = (declarations: ts.Declaration[]): ts.Declaration[] => {
  return declarations.filter((d) => {
    return !d.getSourceFile().fileName.includes("/node_modules/typescript/");
  });
};

const sortObjectsByKeyOrder = <T extends AnyObject, K extends keyof T & string>(
  obj: T,
  keyOrder: K[]
): T => {
  const newKeyOrder = arraySort(Object.keys(obj), keyOrder);

  return newKeyOrder.reduce(
    (acc, key) => ({
      ...acc,
      [key]: obj[key],
    }),
    {} as T
  );
};

const arraySort = (arrayToSort: string[], keyOrder: string[]): string[] => {
  const keyOrderMap = new Map(keyOrder.map((value, index) => [value, index]));

  return arrayToSort.sort((a, b) => {
    const aIndex = keyOrderMap.get(a) ?? Infinity;
    const bIndex = keyOrderMap.get(b) ?? Infinity;

    return aIndex - bIndex;
  });
};

const simplifyUnionForOptionalType = (resolvedParamType: TS_Type) => {
  if (resolvedParamType.type === "union" && resolvedParamType.types.length === 2) {
    const indexOfUndefined = resolvedParamType.types.findIndex(
      (t) => t.type === "primitive" && t.subType === "undefined"
    );
    if (indexOfUndefined === -1) return resolvedParamType;

    const unionTypes = resolvedParamType.types;
    const nonUndefined = unionTypes.find((_, i) => indexOfUndefined !== i);
    if (
      nonUndefined &&
      (nonUndefined.type !== "primitive" || nonUndefined.subType !== "undefined")
    ) {
      return nonUndefined;
    }
  }
  return resolvedParamType;
};

const getSymbolComments = (symbol: ts.Symbol, checker: ts.TypeChecker): string => {
  const comments = symbol.getDocumentationComment(checker);
  return comments
    .map((comment) => comment.text)
    .join(" ")
    .trim();
};
