import type {
  DetailedJoinSelect,
  JoinPath,
  JoinSelect,
  RawJoinPath,
  SimpleJoinSelect,
} from "prostgles-types";
import { getKeys, includes } from "prostgles-types";

const JOIN_KEYS = ["$innerJoin", "$leftJoin"] as const;
const JOIN_PARAM_KEYS = getKeys({
  $condition: 1,
  filter: 1,
  having: 1,
  limit: 1,
  offset: 1,
  orderBy: 1,
  select: 1,
} satisfies Record<keyof Omit<DetailedJoinSelect, (typeof JOIN_KEYS)[number]>, 1>);

export type ParsedJoin =
  | {
      type: "detailed";
      params: DetailedJoinSelect & {
        table: DetailedJoinSelect["$leftJoin"];
        path: RawJoinPath;
      };
    }
  | { type: "simple"; params: SimpleJoinSelect };

export const parseJoinSelect = (joinParams: JoinSelect): ParsedJoin | string => {
  if (!(joinParams as string)) {
    return "Empty join params";
  }
  if (typeof joinParams === "string") {
    if ((joinParams as string) !== "*") {
      throw "Join select can be * or { field: 1 }";
    }
    return {
      type: "simple",
      params: joinParams,
    };
  }
  const [joinKey, ...otherKeys] = getKeys(joinParams).filter((k) => includes(JOIN_KEYS, k));
  if (otherKeys.length) {
    return "Cannot specify more than one join type ( $innerJoin OR $leftJoin )";
  } else if (joinKey) {
    /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
    const invalidParams = Object.keys(joinParams).filter(
      (k) => !includes([...JOIN_PARAM_KEYS, ...JOIN_KEYS], k),
    );
    if (invalidParams.length) {
      throw "Invalid join params: " + invalidParams.join(", ");
    }
    const path = joinParams[joinKey] as string | JoinPath[];
    if (Array.isArray(path) && !path.length) {
      throw `Cannot have an empty join path/tableName ${joinKey}`;
    }
    return {
      type: "detailed",
      params: {
        ...(joinParams as DetailedJoinSelect),
        path,
        table: typeof path === "string" ? path : path.at(-1)!.table,
      },
    };
  }

  return {
    type: "simple",
    params: joinParams as SimpleJoinSelect,
  };
};
