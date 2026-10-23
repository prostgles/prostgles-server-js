import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import prostgles, { type InitResult, type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { CHANNELS, type ClientSchema, type SubscriptionChannels } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import express from "express";
import type prostglesClient from "../client/node_modules/prostgles-client";

export const testSocketLifecycle = async (db: DB) => {
  await testSocketSessionCaching(db);
  await test(
    "Socket.IO survives instance replacement and API port changes",
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
          findUser: () => user,
        },
        onReady: () => {},
        publishRawSQL: () => true,
        restApi: { expressApp: app, path: "/lifecycle" },
      };

      const getInstance = () => {
        return prostgles({ ...options, functions: getFunctions(0) });
      };

      let instance: Awaited<ReturnType<typeof getInstance>> | undefined;
      try {
        await db.none("DROP SCHEMA IF EXISTS socket_lifecycle_test CASCADE");
        await db.none("CREATE SCHEMA socket_lifecycle_test");
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const url = `http://127.0.0.1:${address.port}`;
        instance = await getInstance();
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
            async () => await oldHandlers.clientMethods.version!.run(),
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
            async () => await oldHandlers.clientMethods.version!.run(),
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

        const connected = connect(url);
        clients.push(connected.socket);
        await connected.schema;
        const replacementApp = express();
        replacementApp.use(express.json());
        const replacementHttp = createServer(replacementApp);
        const replacementIO = new Server(replacementHttp, { path: "/ws-api/restart" });
        try {
          replacementHttp.listen(0, "127.0.0.1");
          await once(replacementHttp, "listening");
          const replacementAddress = replacementHttp.address();
          assert(replacementAddress && typeof replacementAddress === "object");
          const replacementUrl = `http://127.0.0.1:${replacementAddress.port}`;

          // Changing the API port updates both io and restApi, triggering a full init.
          await instance.update({
            io: replacementIO,
            restApi: { expressApp: replacementApp, path: "/lifecycle" },
          });
          assert.equal(replacementIO.listenerCount("connection"), 1);
          const replacement = connect(replacementUrl);
          clients.push(replacement.socket);
          await replacement.schema;
          assert.equal(await callMethod(replacement.socket, "version"), 2);
          assert.equal(await (await callHttpMethod(replacementUrl)).json(), 2);
          const serverSocket = replacementIO.sockets.sockets.get(replacement.socket.id!);
          assert(serverSocket);
          instance.invalidateAuth(["another-session"]);
          assert(serverSocket.connected, "Unrelated sessions stay connected");
          const revoked = new Promise<string>((resolve) => replacement.socket.once("disconnect", resolve));
          instance.invalidateAuth(["lifecycle-session"]);
          assert.equal(await revoked, "transport close");
        } finally {
          await instance.destroy();
          instance = undefined;
          await replacementIO.close();
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

const testSocketSessionCaching = async (db: DB) => {
  await test(
    "Socket session caching respects expiry, configuration and invalidation",
    { timeout: 15000 },
    async () => {
      const app = express();
      app.use(express.json());
      const http = createServer(app);
      const io = new Server(http, { path: "/ws-api/restart" });
      const clients: Socket[] = [];
      let lookups = 0;
      let expires: number | undefined = Date.now() + 30 * 24 * 60 * 60 * 1000;
      let beforeGetUser: (() => Promise<void>) | undefined;
      let user = { id: "cached-user", type: "test" };
      const getAuth = (): NonNullable<ProstglesInitOptions["auth"]> => ({
        sidKeyName: "token",
        cacheSession: true,
        getUser: async (sid) => {
          lookups++;
          const result = {
            user,
            clientUser: user,
            session:
              expires === undefined ? undefined : (
                {
                  sid: sid!,
                  expires,
                  onExpiration: "show_error" as const,
                }
              ),
          };
          await beforeGetUser?.();
          return result;
        },
        findUser: () => user,
      });
      const options = {
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { socket_cache_test: 1 as const },
        publish: "*" as const,
        functions: getFunctions(1),
        onReady: () => {},
      };
      let instance: InitResult | undefined;
      try {
        await db.none(
          "CREATE SCHEMA socket_cache_test; CREATE TABLE socket_cache_test.records (id integer PRIMARY KEY)",
        );
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const url = `http://127.0.0.1:${address.port}`;
        instance = await prostgles({
          ...options,
          io,
          auth: getAuth(),
          restApi: { expressApp: app, path: "/lifecycle" },
        });
        const client = connect(url);
        clients.push(client.socket);
        await client.schema;
        const serverSocket = io.sockets.sockets.get(client.socket.id!);
        assert(serverSocket);
        const handlers = await instance.getClientDBHandlers({ socket: serverSocket }, undefined);
        const initialLookups = lookups;
        await Promise.all([
          callMethod(client.socket, "version"),
          callMethod(client.socket, "version"),
        ]);
        assert.equal(lookups, initialLookups, "Socket requests reuse cached auth");
        await callHttpMethod(url);
      const afterFirstHttp = lookups;
      assert(afterFirstHttp > initialLookups);
        await callHttpMethod(url);
      assert(lookups > afterFirstHttp, "HTTP requests always authenticate");

      const beforeSecondSocket = lookups;
        const secondClient = connect(url);
        clients.push(secondClient.socket);
        await secondClient.schema;
        assert.equal(
          lookups,
        beforeSecondSocket + 1,
          "Another socket with the same SID authenticates separately",
        );
        secondClient.socket.close();
        const other = await prostgles({ ...options, auth: getAuth() });
        try {
          const beforeOtherInstance = lookups;
          await other.getClientDBHandlers({ socket: serverSocket }, undefined);
          assert.equal(
            lookups,
            beforeOtherInstance + 1,
            "Instances do not share cached auth on the same socket",
          );
        } finally {
          await other.destroy();
        }
        assert.equal(await callMethod(client.socket, "version"), 1);

        const updateAuth = async (auth = getAuth()) => {
          const schema = onceSocket(client.socket, CHANNELS.SCHEMA);
          await instance!.update({ auth });
          await schema;
        };
        expires = undefined;
        await updateAuth();
        const beforeUncached = lookups;
        await callMethod(client.socket, "version");
        await callMethod(client.socket, "version");
        assert.equal(
          lookups,
          beforeUncached + 2,
          "Results without session metadata are not cached",
        );
        expires = Infinity;
        await updateAuth({ ...getAuth(), cacheSession: false });
        const beforeDisabled = lookups;
        await callMethod(client.socket, "version");
        await callMethod(client.socket, "version");
        assert.equal(lookups, beforeDisabled + 2, "Caching is opt-in");

        expires = undefined;
        await updateAuth();
        let resume = () => {};
        const paused = new Promise<void>((resolve) => {
          beforeGetUser = () => {
            resolve();
            return new Promise<void>((resolveLookup) => {
              resume = resolveLookup;
            });
          };
        });
        const replacedLookup = assert.rejects(
          async () => handlers.clientMethods.version!.run(),
          /authentication was invalidated/,
        );
        await paused;
        beforeGetUser = undefined;
        expires = Date.now() + 1000;
        user = { id: "updated-user", type: "test" };
        await updateAuth();
        resume();
        await replacedLookup;
        const updated = await instance.getClientDBHandlers({ socket: serverSocket }, undefined);
        assert.equal(updated.clientSchema.auth?.user?.id, "updated-user");
        expires = Infinity;
        await updateAuth();
        await new Promise((resolve) => setTimeout(resolve, 1100));
        assert(serverSocket.connected, "Replacing auth cancels the old expiry timer");

        let resumeInitialAuth = () => {};
        const initialAuthPaused = new Promise<void>((resolve) => {
          beforeGetUser = () => {
            resolve();
            return new Promise<void>((resumeLookup) => {
              resumeInitialAuth = resumeLookup;
            });
          };
        });
        const reloadingClient = connect(url);
        clients.push(reloadingClient.socket);
        void reloadingClient.schema.catch(() => {});
        await initialAuthPaused;
        beforeGetUser = undefined;
        await instance.update({ auth: getAuth() });
        resumeInitialAuth();
        assert.equal(
          (await reloadingClient.schema).auth?.user?.id,
          "updated-user",
          "Connecting sockets receive the current schema when auth changes during their lookup",
        );
        reloadingClient.socket.close();

        expires = Date.now() + 1000;
        await updateAuth();
        const channels = await new Promise<SubscriptionChannels>((resolve, reject) => {
          client.socket.emit(
            CHANNELS.DEFAULT,
            {
              tableName: "socket_cache_test.records",
              command: "subscribe",
              param1: {},
              param2: { throttle: 0 },
            },
            (error: unknown, result: SubscriptionChannels) =>
              error ? reject(error) : resolve(result),
          );
        });
        let deliveries = 0;
        client.socket.on(channels.channelName, () => {
          deliveries++;
        });
        const firstDelivery = onceSocket(client.socket, channels.channelName);
        client.socket.emit(channels.channelNameReady);
        await firstDelivery;
        const beforeExpiry = lookups;
        const reason = await onceSocket(client.socket, "disconnect");
        assert.equal(reason, "transport close", "Idle sessions close without an auth guard");
        assert.equal(lookups, beforeExpiry, "Expiry requires no incoming auth requests");
        const deliveriesAtExpiry = deliveries;
        await db.none("INSERT INTO socket_cache_test.records VALUES (1)");
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(deliveries, deliveriesAtExpiry, "Expired subscriptions stop delivering");
        await assert.rejects(
          async () => handlers.clientMethods.version!.run(),
          /authentication was invalidated/,
        );

        expires = Infinity;
        const invalidationPaused = new Promise<void>((resolve) => {
          beforeGetUser = () => {
            resolve();
            return new Promise<void>((resolveLookup) => {
              resume = resolveLookup;
            });
          };
        });
        const pendingClient = connect(url);
        clients.push(pendingClient.socket);
        void pendingClient.schema.catch(() => {});
        await invalidationPaused;
      if (!pendingClient.socket.connected) await onceSocket(pendingClient.socket, "connect");
        const pendingSocket = io.sockets.sockets.get(pendingClient.socket.id!);
        assert(pendingSocket);
        const invalidatedLookup = assert.rejects(
          instance.getClientDBHandlers({ socket: pendingSocket }, undefined),
          /authentication was invalidated/,
        );
        instance.invalidateAuth(["unrelated-session"]);
        assert(pendingSocket.connected);
        const disconnected = onceSocket(pendingClient.socket, "disconnect");
        instance.invalidateAuth(["lifecycle-session"]);
        beforeGetUser = undefined;
        resume();
        await invalidatedLookup;
        await disconnected;
        const freshClient = connect(url);
        clients.push(freshClient.socket);
        const beforeReconnect = lookups;
        await freshClient.schema;
        assert(lookups > beforeReconnect, "Reconnection cannot reuse an invalidated lookup");

        await instance.update({
          auth: { ...getAuth(), cacheSession: false },
          publishRawSQL: () => true,
        });
        const connectClient = createRequire(
          path.resolve("../client/package.json"),
        )("prostgles-client").default as typeof prostglesClient;
        const requestSocket = createClient(url, {
          path: "/ws-api/restart",
          transports: ["websocket"],
          reconnection: false,
          query: { token: "lifecycle-session" },
        });
        clients.push(requestSocket);
        const requestClient = await connectClient({
          socket: requestSocket,
          onReady: () => {},
        });
        const disconnectListeners =
          requestSocket.listeners("disconnect").length;
        assert.deepEqual(
          await requestClient.db["socket_cache_test.records"]!.find!(),
          [{ id: 1 }],
        );
        assert.deepEqual(await requestClient.sql!("SELECT 1 AS value", {}, { returnType: "rows" }), [
          { value: 1 },
        ]);
        assert.equal(await requestClient.methods!.version!(), 1);
        await assert.rejects(() =>
          requestClient.sql!("SELECT * FROM missing_lifecycle_table"),
        );
        assert.equal(
          requestSocket.listeners("disconnect").length,
          disconnectListeners,
        );

        // Simulate a suspended tab whose heartbeat expired before its timer ran.
        requestSocket.io.engine["_pingTimeoutTime"] = Date.now() - 1;
        const bufferedUpdate = requestClient.sql!(
          "UPDATE socket_cache_test.records SET id = 2 WHERE id = 1",
        );
        requestSocket.emit("unrelated-buffered-event", "preserved");
        await assert.rejects(bufferedUpdate, /Socket disconnected/);
        assert.deepEqual(
          requestSocket.sendBuffer.map(({ data }) => data),
          [["unrelated-buffered-event", "preserved"]],
          "Only the rejected request is removed from the send buffer",
        );
        const unrelatedEvent = new Promise<unknown>((resolve) => {
          io.once("connection", (socket) => socket.once("unrelated-buffered-event", resolve));
        });
        const reconnectedSchema = onceSocket(requestSocket, CHANNELS.SCHEMA);
        requestSocket.connect();
        await reconnectedSchema;
        assert.equal(await unrelatedEvent, "preserved");
        assert.deepEqual(
          await requestClient.db["socket_cache_test.records"]!.find!(),
          [{ id: 1 }],
          "Rejected writes are not replayed after reconnecting",
        );

        let pendingLookups = 0;
        let resumeRequests = () => {};
        const requestsReleased = new Promise<void>((resolve) => {
          resumeRequests = resolve;
        });
        const requestsPaused = new Promise<void>((resolve) => {
          beforeGetUser = async () => {
            if (++pendingLookups === 3) resolve();
            await requestsReleased;
          };
        });
        const requests = [
          () => requestClient.db["socket_cache_test.records"]!.find!(),
          () => requestClient.sql!("SELECT 1"),
          () => requestClient.methods!.version!(),
        ];
        const pendingRequests = requests.map((request) =>
          assert.rejects(request, /Socket disconnected/),
        );
        try {
          await requestsPaused;
          instance.invalidateAuth(["lifecycle-session"]);
          await Promise.all(pendingRequests);
          assert.equal(
            requestSocket.listeners("disconnect").length,
            disconnectListeners,
          );
          await Promise.all(
            requests.map((request) => assert.rejects(request, /Socket disconnected/)),
          );
          assert.equal(
            requestSocket.sendBuffer.length,
            0,
            "Disconnected calls are not queued",
          );
        } finally {
          beforeGetUser = undefined;
          resumeRequests();
        }
      } finally {
        clients.forEach((client) => client.close());
        await instance?.destroy();
        await io.close();
        await db.none("DROP SCHEMA IF EXISTS socket_cache_test CASCADE");
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
    //@ts-ignore
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

const onceSocket = (socket: Socket, event: string) =>
  new Promise<unknown>((resolve) => socket.once(event, resolve));
