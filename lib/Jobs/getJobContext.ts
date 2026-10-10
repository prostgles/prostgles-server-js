import type { Prostgles } from "../Prostgles";
import { createServerSideRequest } from "../Auth/utils/serverSideRequest";
import { getClientHandlers } from "../WebsocketAPI/getClientHandlers";
import type { RuntimeJobDefinition } from "./JobTypes";
import type { DBHandlerServer } from "../DBSchemaBuilder/DBSchemaBuilder";

export const getJobContext = async (
  prostgles: Prostgles,
  definition: RuntimeJobDefinition,
  userId: string | undefined,
) => {
  const request = userId ? createServerSideRequest(prostgles, userId) : undefined;
  const params =
    request ? await prostgles.publishParser?.getPublishParams(request, undefined) : undefined;
  const base = { user: params?.user, context: prostgles.context };
  if (definition.runAs !== "user") return { ...base, dbo: prostgles.dbo! as DBHandlerServer };
  if (!request || !params?.user) throw new Error("Job user no longer exists");
  const handlers = await getClientHandlers(prostgles, request, undefined);
  return {
    ...base,
    dbo: {
      ...handlers.clientDb,
      tx: handlers.withClientDbTx,
      sql: handlers.clientSql,
    } as unknown as DBHandlerServer,
  };
};
