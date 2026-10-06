import { as } from "pg-promise";
import { asName, isObject } from "prostgles-types";
import type { ConstraintDef } from "./getConstraintDefinitionQueries";
import type { TableCheck, TableCheckBranch, TableCheckValue } from "./TableConfigTypes";

export const getTableCheckBranches = (
  check: TableCheck,
  columns: readonly CheckColumn[],
): TableCheckBranch[] => {
  if (
    !isObject(check) ||
    Object.keys(check).length !== 1 ||
    !Array.isArray(check.$or) ||
    !check.$or.length
  ) {
    throw new Error("tableConfig.check must contain a non-empty $or array");
  }
  return check.$or.map((branch: TableCheckBranch) => {
    if (!isObject(branch)) throw new Error("Each tableConfig.check branch must be an object");
    for (const [name, condition] of Object.entries(branch)) {
      const column = columns.find((c) => c.name === name);
      if (!column) throw new Error(`Unknown tableConfig.check column: ${name}`);
      if (isObject(condition)) {
        if (!Object.keys(condition).length) continue;
        if (Object.keys(condition).length !== 1) {
          throw new Error(`Invalid tableConfig.check condition for ${name}`);
        }
        // Validate untyped configuration as well as TypeScript callers.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if ("$ne" in condition && condition.$ne === null) continue;
        if (!("enum" in condition) || !Array.isArray(condition.enum) || !condition.enum.length) {
          throw new Error(`Expected a non-empty enum or { $ne: null } for ${name}`);
        }
        condition.enum.forEach((value) => validateValue(value, column));
      } else {
        validateValue(condition, column);
      }
    }
    return Object.fromEntries(
      columns
        .filter((column) => Object.hasOwn(branch, column.name) || column.nullable)
        .filter((column) => {
          const condition = branch[column.name];
          return !isObject(condition) || Object.keys(condition).length > 0;
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((column) => [
          column.name,
          Object.hasOwn(branch, column.name) ? (branch[column.name] ?? null) : null,
        ]),
    );
  });
};

export const getTableCheckConstraint = (
  tableName: string,
  branches: readonly TableCheckBranch[],
): ConstraintDef & { name: string } => {
  const name = "prostgles_row_check";
  const expression = branches
    .map((branch) => {
      const conditions = Object.entries(branch).map(([column, condition]) => {
        const columnSQL = asName(column);
        if (isObject(condition) && !Object.keys(condition).length) return "TRUE";
        if (isObject(condition) && "$ne" in condition) return `${columnSQL} IS NOT NULL`;
        const values = isObject(condition) ? condition.enum : [condition];
        // JSON equality avoids casts or collations admitting values outside the inferred literals.
        return `(${values
          .map((value) =>
            value === null ?
              `${columnSQL} IS NULL`
            : `to_jsonb(${columnSQL}) = ${as.text(JSON.stringify(value))}::jsonb`,
          )
          .join(" OR ")})`;
      });
      return `(${conditions.join(" AND ") || "TRUE"})`;
    })
    .join(" OR ");
  // CHECK accepts UNKNOWN, so require TRUE to reject NULL discriminators as well.
  const content = `CHECK ((${expression}) IS TRUE)`;
  return {
    name,
    content,
    alterQuery: `ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(name)} ${content};`,
  };
};

type CheckColumn = { name: string; nullable: boolean; udt_name: string };

const validateValue = (value: TableCheckValue, column: CheckColumn) => {
  if (value === null && column.nullable) return;
  // These scalar types have the same JSON and row representations. Other types can use $ne: null.
  const supported =
    typeof value === "string" ? ["text", "varchar"]
    : typeof value === "boolean" ? ["bool"]
    : typeof value === "number" && Number.isFinite(value) ?
      ["int2", "int4", "float4", "float8", "oid"]
    : [];
  if (!supported.includes(column.udt_name)) {
    throw new Error(
      `Invalid tableConfig.check value for ${column.name} (${column.udt_name}): ${JSON.stringify(value)}`,
    );
  }
};
