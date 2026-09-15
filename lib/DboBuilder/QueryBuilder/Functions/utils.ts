import type { FunctionSpec } from "./Functions";

export const asFunction = (def: FunctionSpec) => def;

export const getAggregateQuery = (
  name: string,
  args: string,
  aggregateFilter?: string,
  aggregateOrderBy?: string,
) =>
  `${name}(${args}${aggregateOrderBy ? ` ${aggregateOrderBy}` : ""})${
    aggregateFilter ? ` FILTER (WHERE ${aggregateFilter})` : ""
  }`;
