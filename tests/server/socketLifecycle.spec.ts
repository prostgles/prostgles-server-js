import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import prostgles, { type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { CHANNELS, type ClientSchema } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import express from "express";

export const testSocketLifecycle = async (db: DB) => {
  await test(
    "destroy allows reusing Socket.IO on a running HTTP server",
    { timeout: 15000 },
    async () => {
      const app = express();
      app.use(express.json());
      const http = createServer(app);
      const io = new Server(http, { path: "/ws-api/restart" });
      const clients: Socket[] = [];
      const user = { id: "lifecycle-user", type: "test" };
      let beforeGetUser: (() => Promise<void>) | undefined;
      const options = {
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        io,
        publish: "*" as const,
        schemaFilter: { socket_lifecycle_test: 1 as const },
        auth: {
          sidKeyName: "token",
          getUser: async () => {
            await beforeGetUser?.();
            return { user, clientUser: user };
          },
          findUser: async () => user,
        },
        onReady: () => {},
        publishRawSQL: () => true,
        restApi: { expressApp: app, path: "/lifecycle" },
      };
      let instance: Awaited<ReturnType<typeof prostgles>> | undefined;
      try {
        await db.none("CREATE SCHEMA socket_lifecycle_test");
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const url = `http://127.0.0.1:${address.port}`;
        instance = await prostgles({ ...options, functions: getFunctions(0) });
        for (let cycle = 0; cycle < 2; cycle++) {
          const client = connect(url);
          clients.push(client.socket);
          const schema = await client.schema;
          assert(schema.methods.some(({ name }) => name === `only${cycle}`));
          assert.equal(await callMethod(client.socket, "version"), cycle);
          assert.equal(await (await callHttpMethod(url)).json(), cycle);
          const oldInstance = instance;
          const serverSocket = io.sockets.sockets.get(client.socket.id!);
          assert(serverSocket);
          const oldHandlers = await instance.getClientDBHandlers(
            { socket: serverSocket },
            undefined,
          );
          const closed = new Promise<string>((resolve) =>
            client.socket.once("disconnect", resolve),
          );
          let resumeAuth = () => {};
          const authPaused = new Promise<void>((resolve) => {
            beforeGetUser = () => {
              resolve();
              return new Promise<void>((resume) => {
                resumeAuth = resume;
              });
            };
          });
          const inFlight = assert.rejects(
            async () => oldHandlers.clientMethods.version.run(),
            /instance is destroyed/,
          );
          await authPaused;
          const destroying = instance.destroy();
          beforeGetUser = undefined;
          resumeAuth();
          await Promise.all([destroying, inFlight]);
          instance = undefined;
          assert.equal(await closed, "transport close");
          assert(http.listening);
          assert.equal((await callHttpMethod(url)).status, 404);
          await assert.rejects(
            async () => oldHandlers.clientMethods.version.run(),
            /instance is destroyed/,
          );
          await assert.rejects(() => oldHandlers.clientSql("SELECT 1"), /instance is destroyed/);
          await assert.rejects(oldInstance.restart, /instance is destroyed/);
          await assert.rejects(
            () => oldInstance.update({ functions: getFunctions(99) }),
            /instance is destroyed/,
          );

          // A reconnect may arrive before the replacement Prostgles instance is ready.
          const pending = connect(url);
          clients.push(pending.socket);
          await Promise.race([once(io, "connection"), pending.schema]);
          assert.equal(io.listenerCount("connection"), 0);
          instance = await prostgles({ ...options, functions: getFunctions(cycle + 1) });
          const newSchema = await pending.schema;
          assert(!newSchema.methods.some(({ name }) => name === `only${cycle}`));
          await assert.rejects(() => callMethod(pending.socket, `only${cycle}`));
          await oldInstance.destroy();
          assert.equal(await callMethod(pending.socket, "version"), cycle + 1);
          assert.equal(await (await callHttpMethod(url)).json(), cycle + 1);
          assert.equal(io.listenerCount("connection"), 1);
          pending.socket.close();
        }
      } finally {
        clients.forEach((client) => client.close());
        await instance?.destroy();
        await io.close();
        await db.none("DROP SCHEMA socket_lifecycle_test CASCADE");
      }
    },
  );
};

const connect = (url: string) => {
  const socket = createClient(url, {
    path: "/ws-api/restart",
    transports: ["websocket"],
    reconnection: false,
    query: { token: "lifecycle-session" },
  });
  const schema = new Promise<ClientSchema>((resolve, reject) => {
    socket.once("connect_error", reject);
    socket.once(CHANNELS.SCHEMA, (payload) => {
      if (payload.err) reject(new Error(JSON.stringify(payload.err)));
      else resolve(payload);
    });
  });
  return { socket, schema };
};

const getFunctions = (version: number): ProstglesInitOptions["functions"] => ({
  users: {
    userFilter: {},
    functions: {
      version: { run: () => version },
      [`only${version}`]: { run: () => version },
    },
  },
});

const callMethod = (socket: Socket, name: string) =>
  new Promise<unknown>((resolve, reject) => {
    socket.timeout(2000).emit(CHANNELS.METHOD, { name }, (timeoutError, error, result) => {
      if (timeoutError || error) reject(timeoutError || error);
      else resolve(result);
    });
  });

const callHttpMethod = (url: string) =>
  fetch(`${url}/lifecycle/methods/version`, {
    method: "POST",
    headers: { authorization: "Bearer lifecycle-session" },
  });
