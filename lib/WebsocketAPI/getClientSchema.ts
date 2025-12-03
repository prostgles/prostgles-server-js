import { isObject, omitKeys, tryCatchV2, type ClientSchema } from "prostgles-types";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import type { Prostgles } from "../Prostgles";
import type { PermissionScope, PublishParser } from "../PublishParser/PublishParser";
import { clientCanRunSqlRequest } from "../runClientRequest";
import { version } from "../../package.json";

export async function getClientSchema(
  this: Prostgles,
  clientReq: AuthClientRequest,
  scope: PermissionScope | undefined
) {
  const result = await tryCatchV2(async () => {
    const clientInfo =
      clientReq.socket ?
        { type: "socket" as const, ...clientReq }
      : { type: "http" as const, ...clientReq };

    const userData = await this.authHandler?.getSidAndUserFromRequest(clientInfo);
    if (userData === "new-session-redirect") {
      throw "new-session-redirect";
    }
    const { publishParser } = this;
    let fullSchema: Awaited<ReturnType<PublishParser["getSchemaFromPublish"]>> | undefined;
    let publishValidationError;

    try {
      if (!publishParser) throw "publishParser undefined";
      fullSchema = await publishParser.getSchemaFromPublish(
        {
          ...clientInfo,
          userData,
        },
        scope
      );
    } catch (e) {
      publishValidationError = e;
      console.error(`\nProstgles Publish validation failed (after socket connected):\n    ->`, e);
    }
    const { allowed: rawSQL } = await clientCanRunSqlRequest.bind(this)(clientInfo);

    const { schema, tables, tableSchemaErrors } = fullSchema ?? {
      schema: {},
      tables: [],
      tableSchemaErrors: {},
    };
    const joinTables2: string[][] = [];
    if (this.opts.joins) {
      const _joinTables2 = this.dboBuilder
        .getAllJoinPaths()
        .filter((jp) => ![jp.t1, jp.t2].find((t) => !schema[t] || !schema[t]?.findOne))
        .map((jp) => [jp.t1, jp.t2].sort());
      _joinTables2.map((jt) => {
        if (!joinTables2.find((_jt) => _jt.join() === jt.join())) {
          joinTables2.push(jt);
        }
      });
    }

    const methods = await publishParser?.getAllowedMethods(clientInfo, userData);

    const methodSchema: ClientSchema["methods"] =
      !methods ?
        []
      : Object.entries(methods)
          .map(([methodName, method]) => {
            if (isObject(method) && "run" in method) {
              return {
                name: methodName,
                ...omitKeys(method, ["run"]),
              };
            }
            return methodName;
          })
          .sort((a, b) => {
            const aName = isObject(a) ? a.name : a;
            const bName = isObject(b) ? b.name : b;
            return aName.localeCompare(bName);
          });

    const authInfo = await this.authHandler?.getClientAuth(clientReq);
    if (authInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }

    const clientSchema: ClientSchema = {
      schema,
      methods: methodSchema,
      tableSchema: tables,
      rawSQL,
      joinTables: joinTables2,
      tableSchemaErrors,
      auth: authInfo?.auth,
      version,
      err: publishValidationError ? "Server Error: User publish validation failed." : undefined,
    };

    return {
      publishValidationError,
      clientSchema,
      userData,
    };
  });
  const sid = this.authHandler?.getSIDNoError(clientReq);
  await this.opts.onLog?.({
    type: "connect.getClientSchema",
    duration: result.duration,
    sid,
    socketId: clientReq.socket?.id,
    error: result.error || result.data?.publishValidationError,
  });
  if (result.hasError) throw result.error;
  return result.data.clientSchema;
}
