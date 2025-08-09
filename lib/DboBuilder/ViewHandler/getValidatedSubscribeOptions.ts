import {
  getJSONBObjectSchemaValidationError,
  isDefined,
  isEmpty,
  type SubscribeOptions,
} from "prostgles-types";
import { type Required_ish, type SubscribeRule } from "../../PublishParser/PublishParser";

export const getValidatedSubscribeOptions = (
  rawVal: Required_ish<SubscribeOptions>,
  subscribeRule: SubscribeRule | undefined
): Required_ish<SubscribeOptions> => {
  const { data, error } = getJSONBObjectSchemaValidationError(
    {
      throttle: { type: "integer", optional: true },
      throttleOpts: {
        type: {
          skipFirst: { type: "boolean", optional: true },
        },
        optional: true,
      },
      skipFirst: { type: "boolean", optional: true },
      skipChangedColumnsCheck: { type: "boolean", optional: true },
      actions: {
        oneOf: [
          {
            record: {
              keysEnum: ["insert", "update", "delete"],
              partial: true,
              values: {
                enum: [true],
              },
            },
          },
          {
            record: {
              keysEnum: ["insert", "update", "delete"],
              partial: true,
              values: {
                enum: [false],
              },
            },
          },
        ],
        optional: true,
      },
    } as const,
    rawVal,
    "subscribeParams"
  );
  if (error !== undefined) {
    throw error;
  }

  const publishedThrottle = subscribeRule?.throttle || 0;
  const {
    actions,
    throttleOpts,
    skipFirst,
    throttle = publishedThrottle,
    skipChangedColumnsCheck,
  } = data;
  if (actions && isEmpty(actions)) {
    throw `addSub: actions cannot be empty`;
  }
  if (
    publishedThrottle &&
    Number.isInteger(publishedThrottle) &&
    publishedThrottle > 0 &&
    throttle < publishedThrottle
  ) {
    throw `addSub: throttle ${throttle} is less than the minimum allowed throttle ${publishedThrottle}`;
  }
  if (isDefined(throttle) && !Number.isInteger(throttle)) {
    throw `addSub: throttle ${throttle} must be an integer`;
  }
  return {
    actions: actions,
    skipFirst,
    throttle,
    throttleOpts,
    skipChangedColumnsCheck,
  };
};
