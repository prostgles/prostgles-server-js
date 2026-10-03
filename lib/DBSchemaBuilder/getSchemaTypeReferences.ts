import * as ts from "typescript";
import { DB_GENERATED_NAMES } from "./constants";

/** Only reuse types from the schema we are writing, never a similarly named imported schema. */
export const getSchemaTypeReferences = (
  checker: ts.TypeChecker,
  schemaFile: ts.SourceFile | undefined,
): Map<ts.Type, string> => {
  const references = new Map<ts.Type, string>();
  const moduleSymbol = schemaFile && checker.getSymbolAtLocation(schemaFile);
  if (!schemaFile || !moduleSymbol) return references;

  const exports = checker.getExportsOfModule(moduleSymbol);
  const addReference = (type: ts.Type, reference: string) => {
    // Primitive types are shared across unrelated columns and must stay primitive.
    const parts = type.isUnion() ? type.types : [type];
    if (!parts.some((part) => part.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)))
      return;
    if (!references.has(type)) references.set(type, reference);
    const nonNullable = checker.getNonNullableType(type);
    if (nonNullable !== type && !references.has(nonNullable)) {
      references.set(nonNullable, `NonNullable<${reference}>`);
    }
  };
  const visited = new Set<ts.Type>();
  const addNestedReferences = (type: ts.Type, reference: string) => {
    if (visited.has(type) || !isSchemaType(checker, type, schemaFile)) return;
    visited.add(type);
    addReference(type, reference);

    const nonNullable = checker.getNonNullableType(type);
    const nestedReference = references.get(nonNullable)!;
    if (checker.isArrayType(nonNullable) || checker.isTupleType(nonNullable)) {
      const elementType = nonNullable.getNumberIndexType();
      if (elementType) addNestedReferences(elementType, `${nestedReference}[number]`);
      return;
    }
    for (const property of nonNullable.getProperties()) {
      addNestedReferences(
        checker.getTypeOfSymbol(property),
        `${nestedReference}[${JSON.stringify(property.name)}]`,
      );
    }
  };

  for (const name of [
    DB_GENERATED_NAMES.SCHEMA_OUTPUT,
    DB_GENERATED_NAMES.SCHEMA_INPUT,
    DB_GENERATED_NAMES.SCHEMA,
  ]) {
    const symbol = exports.find((item) => item.name === name);
    if (!symbol) continue;
    const schemaType = checker.getDeclaredTypeOfSymbol(symbol);
    addReference(schemaType, name);
    for (const table of schemaType.getProperties()) {
      const tableType = checker.getTypeOfSymbol(table);
      const tableReference = `${name}[${JSON.stringify(table.name)}]`;
      addReference(tableType, tableReference);
      const columns =
        name === DB_GENERATED_NAMES.SCHEMA ? tableType.getProperty("columns") : undefined;
      const rowType = columns ? checker.getTypeOfSymbol(columns) : tableType;
      const rowReference = columns ? `${tableReference}["columns"]` : tableReference;
      addReference(rowType, rowReference);
      for (const column of rowType.getProperties()) {
        addNestedReferences(
          checker.getTypeOfSymbol(column),
          `${rowReference}[${JSON.stringify(column.name)}]`,
        );
      }
    }
  }
  return references;
};

/** Array containers are shared built-ins, but their elements can belong to the schema. */
const isSchemaType = (
  checker: ts.TypeChecker,
  type: ts.Type,
  schemaFile: ts.SourceFile,
  visited = new Set<ts.Type>(),
): boolean => {
  if (visited.has(type)) return false;
  visited.add(type);
  if (type.isUnionOrIntersection()) {
    return type.types.some((part) => isSchemaType(checker, part, schemaFile, visited));
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const elementType = type.getNumberIndexType();
    return !!elementType && isSchemaType(checker, elementType, schemaFile, visited);
  }
  return !!type
    .getSymbol()
    ?.declarations?.some((declaration) => declaration.getSourceFile() === schemaFile);
};
