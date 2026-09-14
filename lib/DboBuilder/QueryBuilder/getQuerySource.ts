import { asName, type SelectParams } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type {
  Awaitable,
  SelectRequestData,
  SelectRule,
} from "../../PublishParser/publishTypesAndUtils";
import type { PGIdentifier } from "../DboBuilder";
import type { ViewHandler } from "../ViewHandler/ViewHandler";

const GET_TABLE_EXPRESSION = Symbol("getTableExpression");
const TABLE_EXPRESSION_ALIAS = "prostgles_table_expression";

type SelectRuleWithTableExpression = SelectRule & {
  [GET_TABLE_EXPRESSION]?: (request: SelectRequestData) => Awaitable<string | undefined>;
};

export type QuerySource = {
  expression: string;
  alias?: PGIdentifier;
};

export const withTableExpression = <T extends SelectRule>(
  selectRule: T,
  getTableExpression: NonNullable<SelectRuleWithTableExpression[typeof GET_TABLE_EXPRESSION]>,
): T => {
  return Object.assign(selectRule, { [GET_TABLE_EXPRESSION]: getTableExpression });
};

export const getQuerySource = async (
  viewHandler: ViewHandler,
  tableRules: ParsedTableRule | undefined,
  filter: SelectRequestData["filter"],
  params: SelectParams,
  preferredAlias?: PGIdentifier,
): Promise<QuerySource> => {
  const selectRule = tableRules?.select as SelectRuleWithTableExpression | undefined;
  const getTableExpression = selectRule?.[GET_TABLE_EXPRESSION];
  const tableExpression =
    getTableExpression ? await getTableExpression({ filter, params }) : undefined;
  const alias =
    preferredAlias ??
    (tableExpression ?
      { raw: TABLE_EXPRESSION_ALIAS, escaped: asName(TABLE_EXPRESSION_ALIAS) }
    : undefined);

  return {
    expression: tableExpression ?? viewHandler.escapedName,
    alias,
  };
};

export const getQuerySourceSQL = ({ expression, alias }: QuerySource) => {
  return `${expression}${alias ? ` ${alias.escaped}` : ""}`;
};
