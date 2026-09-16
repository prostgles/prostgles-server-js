import {
  fromEntries,
  getJSONBSchemaValidationError,
  getProperty,
  isObject,
  pickKeys,
  type TableSchema,
} from "prostgles-types";
import { isArray } from "../utils/utils";
import type {
  PublishContextValue,
  PublishedResult,
  PublishObject,
  PublishParams,
} from "./publishTypesAndUtils";

export const getPublishedObjectFromResult = (
  publish: PublishedResult | undefined,
  tablesOrViews: TableSchema[],
  publishParams: PublishParams | undefined,
  contextReplacementMode: "runtime" | "schemaGeneration" = "runtime",
): PublishObject => {
  if (!publish) return {};
  if (publish === "*") {
    return Object.fromEntries(tablesOrViews.map((table) => [table.name, "*"]));
  }

  if (isArray(publish)) {
    const validation = getJSONBSchemaValidationError(
      {
        tuple: [
          { enum: ["*"] },
          {
            record: {
              keysEnum: ["select", "update", "insert", "delete"] as const,
              values: { enum: ["*", false, true] },
              partial: true,
            },
          },
        ],
      } as const,
      publish,
    );
    if (validation.error !== undefined) {
      throw new Error(`Invalid publish all tables: ${validation.error}`);
    }

    const [_, allTableRules] = validation.data;
    return fromEntries(
      tablesOrViews.map((table) => {
        return [table.name, table.is_view ? pickKeys(allTableRules, ["select"]) : allTableRules];
      }),
    );
  }

  return replaceContextPlaceholders(publish, publishParams, contextReplacementMode);
};

const replaceContextPlaceholders = <T>(
  publish: T,
  publishParams: PublishParams | undefined,
  mode: "runtime" | "schemaGeneration",
): T => {
  const context = { user: publishParams?.user };
  if (!publishParams && mode === "runtime") return publish;
  if (isArray(publish)) {
    return publish.map((item) => replaceContextPlaceholders(item, publishParams, mode)) as T;
  }
  if (isObject(publish) && isPlainObject(publish)) {
    const { data } = getJSONBSchemaValidationError(
      {
        type: {
          $prostglesContext: {
            type: { objectName: { enum: ["user"] as const }, objectPropertyName: "string" },
          },
        },
      },
      publish,
      { allowExtraProperties: false },
    );
    if (data) {
      data satisfies PublishContextValue;
      if (mode === "schemaGeneration") return null as T;
      const { objectName, objectPropertyName } = data["$prostglesContext"];
      const contextObject = getProperty(context, objectName);
      if (!contextObject) {
        throw new Error(`Context object "${objectName}" not found`);
      }
      const contextProperty = getProperty(contextObject, objectPropertyName);
      if (contextProperty === undefined) {
        throw new Error(
          `Context property "${objectPropertyName}" not found/undefined in context object "${objectName}"`,
        );
      }
      return contextProperty as T;
    }
    return Object.fromEntries(
      Object.entries(publish).map(([key, value]) => [
        key,
        replaceContextPlaceholders(value, publishParams, mode),
      ]),
    ) as T;
  }
  return publish;
};
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
