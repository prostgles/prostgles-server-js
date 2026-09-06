import { getKeys, pickKeys, type UserLike } from "prostgles-types";
import { parseFieldFilter } from "../../DboBuilder/ViewHandler/parseFieldFilter";
import type { AuthResultWithSID } from "../AuthTypes";

export const getSessionUser = (clientInfo: AuthResultWithSID | undefined): UserLike | undefined => {
  const user = clientInfo?.user;
  if (!user) return;

  const sessionFields = parseFieldFilter(
    (clientInfo.sessionFields ?? []) as Parameters<typeof parseFieldFilter>[0],
    false,
    getKeys(user),
  );

  return {
    ...pickKeys(user, sessionFields),
    ...pickKeys(user, ["id", "type"]),
  } as UserLike;
};
