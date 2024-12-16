import { AnyObject } from "prostgles-types";
import * as ts from "typescript";
import { getSerializableArrayOrTuple } from "./getSerializableArrayOrTuple";
import { getSerializableConditional } from "./getSerializableConditional";
import { getSerializableFunction } from "./getSerializableFunction";
import { getSerializableObjectOrRecord } from "./getSerializableObjectOrRecord";
import { getSerializablePrimitive } from "./getSerializablePrimitive";
import { getSerializableUnion } from "./getSerializableUnion";
import { getSerializableIntersection } from "./getSerializableIntersection";

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

export type TS_Record = TS_Base & {
  type: "record";
  indexInfos: {
    keyType: TS_Type;
    valueType: TS_Type;
  }[];
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

export type TS_Intersection = TS_Base & {
  type: "intersection";
  types: TS_Type[];
};

export type TS_Conditional = TS_Base & {
  type: "conditional";
  checkTypeAlias: string;
  extendsType: TS_Type;
  trueType?: TS_Type;
  falseType?: TS_Type;
};

export type TS_Reference = TS_Base & {
  type: "reference";
  alias: string;
};

export type TS_Type =
  | TS_Primitive
  | TS_Literal
  | TS_Object
  | TS_Record
  | TS_Array
  | TS_Tuple
  | TS_Function
  | TS_Union
  | TS_Intersection
  | TS_Conditional
  | TS_Promise
  | TS_Reference;

export type VisitedTypesMap = Map<
  string,
  {
    resolvedType: TS_Type;
    type: ts.Type;
    reference?: { type: TS_Type; reason: "depth" | "excluded" };
  }
>;

type GetSerializableTypeArgs = {
  myType: ts.Type;
  checker: ts.TypeChecker;
  visited: VisitedTypesMap;
  parentAliases: string[];
  opts: ResolveTypeOptions | undefined;
  depth: number;
};

export type TsTypeParser = (
  args: Omit<GetSerializableTypeArgs, "parentAliases"> & {
    nextUnresolvedParentAliases: string[];
  }
) => TS_Type | undefined;

export const getSerializableType = (
  args: GetSerializableTypeArgs
): { resolvedType: TS_Type; visited: VisitedTypesMap } => {
  const { myType, checker, depth, opts, parentAliases, visited = new Map() } = args;
  let alias = "unknown";
  const { escapedName } = myType.aliasSymbol ?? {};
  const aliasSymbolescapedName = escapedName?.toString();
  const symbol = myType.aliasSymbol ?? (myType.symbol as ts.Symbol | undefined);
  const comments = symbol ? getSymbolComments(symbol, checker) : undefined;
  try {
    alias = checker.typeToString(myType);
  } catch (e) {
    console.log("Error resolving type", myType, e);
  }

  const isTooDeep = opts?.maxDepth !== undefined && depth >= opts.maxDepth;

  const unresolvedParentAliases = parentAliases?.filter((a) => !visited.get(a)) ?? [];
  // console.log(unresolvedParentAliases, alias);

  /* Circular resolved type */
  const visitedType = visited.get(alias);
  if (visitedType) {
    return { resolvedType: visitedType.reference?.type ?? visitedType.resolvedType, visited };
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
    const fileName = symbol?.declarations?.[0]?.getSourceFile().fileName;
    const referenceReason =
      (
        opts?.excludedTypes.includes(alias) ||
        (fileName &&
          opts?.excludedFilenameParts?.length &&
          opts.excludedFilenameParts.some((part) => fileName.includes(part))) ||
        (escapedName && opts?.excludedTypes.includes(escapedName))
      ) ?
        // TODO: Add a way to exclude well known types (Date, Array, UInt8Array, etc)
        "excluded"
      : isTooDeep ? "depth"
      : undefined;
    if (referenceReason) {
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

    visited.set(alias, {
      resolvedType,
      reference: referenceType &&
        referenceReason && { type: referenceType, reason: referenceReason },
      type: myType,
    });

    return { resolvedType: referenceType ?? resolvedType, visited };
  };

  /* Circular unresolved type */
  if (unresolvedParentAliases.includes(alias) || isTooDeep) {
    return withAlias({
      type: "reference",
      alias,
    });
  }
  const nextUnresolvedParentAliases = unresolvedParentAliases.concat(alias);

  const parsers = [
    getSerializableConditional,
    getSerializableArrayOrTuple,
    getSerializableUnion,
    getSerializablePrimitive,
    getSerializableFunction,
    getSerializableObjectOrRecord,
    getSerializableIntersection,
  ];
  // if (aliasSymbolescapedName === "InitOptions") {
  //   debugger;
  // }
  for (const parser of parsers) {
    const parsedType = parser({ ...args, nextUnresolvedParentAliases });
    if (parsedType) {
      return withAlias(parsedType);
    }
  }

  /**
   * Type parameter. E.g.:
   * function example<T>(arg: T){ }
   */
  if (myType.isTypeParameter()) {
    const extendedType = myType.getConstraint();
    if (extendedType) {
      const { resolvedType: resolvedExtendedType } = getSerializableType({
        myType: extendedType,
        checker,
        visited,
        parentAliases: nextUnresolvedParentAliases,
        opts,
        depth: depth + 1,
      });
      return withAlias(resolvedExtendedType);
    }
  }

  if (myType.isStringLiteral()) {
    return withAlias({ type: "literal", value: myType.value });
  }

  return withAlias({ type: "primitive", subType: "any" });
};

export type ResolveTypeOptions = {
  excludedTypes: string[];
  excludedFilenameParts?: string[];
  maxDepth?: number;
};
export const resolveType = (
  myType: ts.Type,
  checker: ts.TypeChecker,
  opts: ResolveTypeOptions
): { resolvedType: TS_Type; constituentTypes?: TS_Type[] } => {
  const { resolvedType } = getSerializableType({
    myType,
    checker,
    visited: new Map(),
    parentAliases: [],
    opts,
    depth: 0,
  });
  if (resolvedType.type === "reference" && opts.excludedTypes.includes(resolvedType.alias)) {
    return { resolvedType: { type: "primitive", subType: "any" } };
  }
  return { resolvedType, constituentTypes: [] };
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

export const getSymbolComments = (symbol: ts.Symbol, checker: ts.TypeChecker): string => {
  const comments = symbol.getDocumentationComment(checker);
  return comments
    .map((comment) => comment.text)
    .join(" ")
    .trim();
};
