import * as ts from "typescript";

/**
 * Recursively resolve a type to its structural representation
 * using only built-in/primitive types
 */
export const resolveTypeToStructure = (
  functionName: string,
  checker: ts.TypeChecker,
  type: ts.Type,
  depth = 0,
  maxDepth = 10,
): string => {
  // Prevent infinite recursion
  if (depth > maxDepth) {
    console.warn(
      `Max type resolution depth (${maxDepth}) reached for function ${JSON.stringify(functionName)} ReturnType`,
    );
    return "unknown";
  }

  // Handle primitive types
  if (type.flags & ts.TypeFlags.String) return "string";
  if (type.flags & ts.TypeFlags.Number) return "number";
  if (type.flags & ts.TypeFlags.Boolean) return "boolean";
  if (type.flags & ts.TypeFlags.Null) return "null";
  if (type.flags & ts.TypeFlags.Undefined) return "undefined";
  if (type.flags & ts.TypeFlags.Void) return "void";
  if (type.flags & ts.TypeFlags.Never) return "never";
  if (type.flags & ts.TypeFlags.Unknown) return "unknown";
  if (type.flags & ts.TypeFlags.Any) return "any";
  if (type.flags & ts.TypeFlags.BigInt) return "bigint";

  // Handle literal types
  if (type.isStringLiteral()) return `"${type.value}"`;
  if (type.isNumberLiteral()) return `${type.value}`;
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    // @ts-expect-error intrinsicName exists on boolean literals
    return type.intrinsicName === "true" ? "true" : "false";
  }

  // Handle union types
  if (type.isUnion()) {
    const parts = type.types.map((t) =>
      resolveTypeToStructure(functionName, checker, t, depth + 1),
    );
    // Deduplicate
    const unique = [...new Set(parts)];
    return unique.length === 1 ? unique[0]! : unique.join(" | ");
  }

  // Handle intersection types
  if (type.isIntersection()) {
    const parts = type.types.map((t) =>
      resolveTypeToStructure(functionName, checker, t, depth + 1),
    );
    return parts.join(" & ");
  }

  // Handle Promise<T> - unwrap to Promise<ResolvedT>
  const symbol = type.getSymbol();
  const typeName = symbol?.getName();

  if (typeName === "Promise") {
    const [typeArg] = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArg) {
      const innerType = resolveTypeToStructure(functionName, checker, typeArg, depth + 1);
      return `Promise<${innerType}>`;
    }
    return "Promise<unknown>";
  }

  // Handle Array<T> or T[]
  if (checker.isArrayType(type)) {
    const [typeArg] = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArg) {
      const elementType = resolveTypeToStructure(functionName, checker, typeArg, depth + 1);
      return `${elementType}[]`;
    }
    return "unknown[]";
  }

  // Handle tuple types
  if (checker.isTupleType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const elements = typeArgs.map((t) =>
      resolveTypeToStructure(functionName, checker, t, depth + 1),
    );
    return `[${elements.join(", ")}]`;
  }

  // Handle Map<K, V>
  if (typeName === "Map") {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArgs.length === 2) {
      const keyType = resolveTypeToStructure(functionName, checker, typeArgs[0]!, depth + 1);
      const valueType = resolveTypeToStructure(functionName, checker, typeArgs[1]!, depth + 1);
      return `Map<${keyType}, ${valueType}>`;
    }
    return "Map<unknown, unknown>";
  }

  // Handle Set<T>
  if (typeName === "Set") {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArgs.length > 0) {
      const elementType = resolveTypeToStructure(functionName, checker, typeArgs[0]!, depth + 1);
      return `Set<${elementType}>`;
    }
    return "Set<unknown>";
  }

  // Handle Date, Error, RegExp, etc. (global built-in types)
  const globalBuiltIns = [
    "Date",
    "Error",
    "RegExp",
    "URL",
    "URLSearchParams",
    "Buffer",
    "Blob",
    "File",
    "FormData",
    "Headers",
    "Request",
    "Response",
    "ReadableStream",
    "WritableStream",
  ];
  if (typeName && globalBuiltIns.includes(typeName)) {
    return typeName;
  }

  // Handle function types
  const callSignatures = type.getCallSignatures();
  if (callSignatures.length > 0) {
    const sig = callSignatures[0]!;
    const params = sig.getParameters().map((param) => {
      const paramType = checker.getTypeOfSymbolAtLocation(param, param.valueDeclaration!);
      const paramTypeStr = resolveTypeToStructure(functionName, checker, paramType, depth + 1);
      const isOptional = param.flags & ts.SymbolFlags.Optional;
      return `${param.getName()}${isOptional ? "?" : ""}: ${paramTypeStr}`;
    });
    const returnType = resolveTypeToStructure(
      functionName,
      checker,
      checker.getReturnTypeOfSignature(sig),
      depth + 1,
    );
    return `(${params.join(", ")}) => ${returnType}`;
  }

  // Handle object types - expand to structural form
  const properties = type.getProperties();
  if (properties.length > 0 || type.flags & ts.TypeFlags.Object) {
    const members: string[] = [];

    for (const prop of properties) {
      const propDecl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!propDecl) continue;

      const propType = checker.getTypeOfSymbolAtLocation(prop, propDecl);
      const propTypeStr = resolveTypeToStructure(functionName, checker, propType, depth + 1);
      const isOptional = prop.flags & ts.SymbolFlags.Optional;
      const propName = prop.getName();

      // Handle property names that need quoting
      const needsQuotes = !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
      const quotedName = needsQuotes ? `"${propName}"` : propName;

      members.push(`${quotedName}${isOptional ? "?" : ""}: ${propTypeStr}`);
    }

    // Check for index signatures
    const stringIndexType = type.getStringIndexType();
    const numberIndexType = type.getNumberIndexType();

    if (stringIndexType) {
      members.push(
        `[key: string]: ${resolveTypeToStructure(functionName, checker, stringIndexType, depth + 1)}`,
      );
    }
    if (numberIndexType) {
      members.push(
        `[key: number]: ${resolveTypeToStructure(functionName, checker, numberIndexType, depth + 1)}`,
      );
    }

    if (members.length === 0) {
      // Empty object or object with no enumerable properties
      return "{}";
    }

    return `{ ${members.join("; ")} }`;
  }

  // Fallback - use the checker's string representation
  return checker.typeToString(type);
};
