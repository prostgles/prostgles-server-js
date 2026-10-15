import type { JSONB } from "prostgles-types";
import type { ComputedJoin } from "../../ProstglesTypes";

/** Infers the SQL callback params from their runtime validation schema. */
export const defineComputedJoin = <const ParamsSchema extends JSONB.ObjectType["type"] = {}>(
  definition: Omit<ComputedJoin, "$params" | "$sql"> & {
    $params?: ParamsSchema;
    $sql: (
      args: Omit<Parameters<ComputedJoin["$sql"]>[0], "params"> & {
        params: JSONB.GetObjectType<NoInfer<ParamsSchema>>;
      },
    ) => string;
  },
): ComputedJoin => {
  // The join resolver validates params against $params before invoking $sql.
  return definition as ComputedJoin;
};
