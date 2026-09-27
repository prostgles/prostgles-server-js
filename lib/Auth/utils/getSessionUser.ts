import { getKeys, pickKeys, type FieldFilter, type UserLike } from "prostgles-types";
import { parseFieldFilter } from "../../DboBuilder/ViewHandler/parseFieldFilter";

export const getSessionUser = <U extends UserLike = UserLike>(
  clientInfo: { user?: U } | undefined,
  sessionFieldsFilter: undefined | FieldFilter<U>,
): UserLike | undefined => {
  const user = clientInfo?.user;
  if (!user) return;

  const sessionFields = parseFieldFilter(
    //@ts-expect-error
    sessionFieldsFilter ?? [],
    false,
    getKeys(user),
  ) as string[];

  return {
    ...pickKeys(user, sessionFields),
    ...pickKeys(user, ["id", "type"]),
  } as UserLike;
};
