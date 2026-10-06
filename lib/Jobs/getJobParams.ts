import { getJSONBSchemaValidationErrorAsync, type JSONB, type TableHandler } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { JobValue, ParamsSchema } from "./JobTypes";
import { assertJobValue } from "./jobUtils";

export const getJobParams = async (prostgles: Prostgles, schema: ParamsSchema | undefined, input: Record<string, unknown>) => {
  const result: Record<string, JobValue> = {};
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(schema ?? {}, key)) throw new Error(`Unknown job parameter: ${key}`);
  }
  for (const [key, field] of Object.entries(schema ?? {})) {
    const hasDefault = Object.hasOwn(field, "default");
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!("optional" in field && field.optional) && !hasDefault) {
      throw new Error(`Job parameter ${key} must be optional or have a default`);
    }
    const value: unknown = input[key] === undefined && hasDefault && "default" in field ? field.default : input[key];
    if (value === undefined && !hasDefault) continue;
    const jsonSchema = field.jsonbSchema ?? { type: field.jsonbSchemaType };
    const validation = await getJSONBSchemaValidationErrorAsync(jsonSchema as JSONB.FieldType, value,
      prostgles.dboBuilder.dboMap as Map<string, TableHandler>);
    if (validation.error !== undefined) throw new Error(`Invalid job parameter ${key}: ${validation.error}`);
    assertJobValue(value);
    result[key] = value;
  }
  return result;
};
