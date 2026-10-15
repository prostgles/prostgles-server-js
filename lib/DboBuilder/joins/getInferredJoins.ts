import type { TableSchema } from "../DboBuilderTypes";
import type { ColumnJoin as Join } from "../../ProstglesTypes";
import { sortedArraysMatch } from "../../utils/utils";
import { isEqual } from "prostgles-types";

export const getInferredJoins = (schema: TableSchema[]): Join[] => {
  const joins: Join[] = [];
  const upsertJoin = (t1: string, t2: string, cols: { col1: string; col2: string }[]) => {
    const existingIdx = joins.findIndex((j) => sortedArraysMatch(j.tables, [t1, t2]));
    const existing = joins[existingIdx];
    const normalCond = cols.reduce((a, v) => ({ ...a, [v.col1]: v.col2 }), {});
    const revertedCond = cols.reduce((a, v) => ({ ...a, [v.col2]: v.col1 }), {});
    if (existing) {
      const isLTR = existing.tables[0] === t1;
      const cond = isLTR ? normalCond : revertedCond;

      /** Avoid duplicates */
      if (!existing.on.some((existingOnCondition) => isEqual(existingOnCondition, cond))) {
        existing.on.push(cond);
        joins[existingIdx] = existing;
      }
    } else {
      joins.push({
        tables: [t1, t2],
        on: [normalCond],
      });
    }
  };
  schema.map((tov) => {
    tov.columns.map((col) => {
      if (col.references) {
        col.references.forEach((r) => {
          const joinCols = r.cols.map((c, i) => ({
            col1: c,
            col2: r.fcols[i]!,
          }));
          upsertJoin(tov.name, r.ftable, joinCols);
        });
      }
    });
  });
  return joins;
};
