import type { AuthClientRequest } from "../../../Auth/AuthTypes";
import type { LocalParams } from "../../DboBuilder";
import type { TableHandler } from "../TableHandler";

/* Must be allowed to insert into referenced table */
export const getInsertTableRules = async (
  tableHandler: TableHandler,
  targetTable: string,
  clientReq: AuthClientRequest | undefined,
  scope: LocalParams["scope"],
) => {
  const childRules = await tableHandler.dboBuilder.publishParser?.getValidatedRequestRuleWusr(
    {
      tableName: targetTable,
      command: "insert",
      clientReq,
    },
    scope,
  );
  if (!childRules || !childRules.insert)
    throw "Dissallowed nested insert into table " + targetTable;
  return childRules;
};
