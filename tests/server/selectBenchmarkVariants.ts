import { strict as assert } from "node:assert";
import { asName } from "prostgles-types";

/** SQL prototypes for this fixture only; these are not general-purpose filter rewrites. */
export const getSelectBenchmarkVariants = ({
  sql,
  commonFields,
  emailExpression,
  equivalentFilter,
  suffix,
}: {
  sql: string;
  commonFields: string[];
  emailExpression: string;
  equivalentFilter: string;
  suffix: string;
}) => {
  const sourceStart = sql.indexOf("(SELECT CASE WHEN ");
  const projectionEnd = sql.indexOf(" FROM records WHERE ", sourceStart);
  const conditionStart = projectionEnd + " FROM records WHERE ".length;
  const conditionEnd = sql.indexOf(" OFFSET 0)", conditionStart);
  assert(sourceStart >= 0 && projectionEnd > sourceStart && conditionEnd > conditionStart);
  const source = sql.slice(sourceStart, conditionEnd + " OFFSET 0)".length);
  const projection = sql.slice(sourceStart + "(SELECT ".length, projectionEnd);
  // The first common field has exactly the row permission as its CASE guard.
  // Read it here because production's WHERE may also contain pushed filters/top-N.
  const firstField = asName(commonFields[0]!);
  const permissionEnd = projection.indexOf(` THEN ${firstField} END AS ${firstField}`);
  assert(projection.startsWith("CASE WHEN ") && permissionEnd > 0);
  const permission = projection.slice("CASE WHEN ".length, permissionEnd);
  const commonProjection = [...commonFields.map(asName), `${emailExpression} AS email`].join(", ");
  const replaceSource = (replacement: string) => sql.replace(source, replacement);
  // ORDER BY id would resolve to the masked output alias and require a sort.
  const innerSuffix = suffix.replace("ORDER BY id ", "ORDER BY records.id ");

  return [
    {
      name: "remove OFFSET only",
      sql: replaceSource(`(SELECT ${projection} FROM records WHERE ${permission})`),
    },
    {
      name: "common fields without CASE, keep OFFSET",
      sql: replaceSource(`(SELECT ${commonProjection} FROM records WHERE ${permission} OFFSET 0)`),
    },
    {
      // Measures the planner benefit, not a safe replacement for the permission boundary.
      name: "common fields without CASE or OFFSET",
      sql: replaceSource(`(SELECT ${commonProjection} FROM records WHERE ${permission})`),
    },
    {
      // The fixture uses strict int/text equality and int range predicates only.
      // In particular, email equality includes its visibility guard. NULL/OR/NOT need
      // separate proofs; arbitrary caller expressions must not cross this boundary.
      name: "guarded filter inside boundary",
      sql: replaceSource(
        `(SELECT ${projection} FROM records WHERE (${permission}) AND (${equivalentFilter}) OFFSET 0)`,
      ),
    },
    {
      // Valid only because this fixture has no residual filters, joins, aggregates,
      // scopes or caller offsets, and the ordered id is granted by every rule.
      name: "guarded filter and top-N inside boundary",
      sql: replaceSource(
        `(SELECT ${projection} FROM records WHERE (${permission}) AND (${equivalentFilter}) ${innerSuffix} OFFSET 0)`,
      ),
    },
  ];
};
