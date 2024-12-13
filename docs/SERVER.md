# Overview
Our Isomorphic Typescript API allows connecting to a PostgreSQL database to get a realtime view of the data and schema. Interact with the data with full end-to-end type safety.
### Installation
To install the package, run:
```bash
npm install prostgles-server
```
### Configuration
To get started, you need to provide a configuration object to the server.

Basic example:
```typescript
import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
prostgles<DBGeneratedSchema>({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "postgres"
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  tsGeneratedTypesDir: __dirname,
  onReady: async ({ dbo }) => {
    try {
      await dbo.items.insert({ name: "a" });
      console.log(await dbo.items.find());
    } catch(err) {
      console.error(err)
    }
  },
});
```
### Configuration options
- **dbConnection** <span style="color: red">required</span> : <span style="color: green;">string</span> | <span style="color: green;">IConnectionParameters&lt;IClient&gt;</span>

  Database connection details

- **onReady** <span style="color: red">required</span> : <span style="color: green;">OnReadyCallback</span>

  Called when the prostgles server is ready to accept connections.
  It waits for auth, tableConfig and other async configurations to complete before executing

- **tsGeneratedTypesDir** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

  If defined then a `DBGeneratedSchema.d.ts` file will be created in the provided directory.
  This file exports a `DBGeneratedSchema` type which contains types for the database tables and
  can be used as a generic type input for the prostgles instances to ensure type safety

- **disableRealtime** <span style="color: grey">optional</span> : <span style="color: green;">boolean | undefined</span>

  If true then schema watch, subscriptions and syncs will be disabled.
  No `prostgles` schema will be created which is needed for the realtime features.
  This is useful when you want to connect to a database and prevent any changes to the schema

- **io** <span style="color: grey">optional</span> : <span style="color: green;">Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

  Socket.IO server instance object
  - **sockets** <span style="color: red">required</span> : <span style="color: green;">Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    A Namespace is a communication channel that allows you to split the logic of your application over a single shared
    connection.
    
    Each namespace has its own:
    
    - event handlers
    
    ```
    io.of("/orders").on("connection", (socket) => {
    socket.on("order:list", () => {});
    socket.on("order:create", () => {});
    });
    
    io.of("/users").on("connection", (socket) => {
    socket.on("user:list", () => {});
    });
    ```
    
    - rooms
    
    ```
    const orderNamespace = io.of("/orders");
    
    orderNamespace.on("connection", (socket) => {
    socket.join("room1");
    orderNamespace.to("room1").emit("hello");
    });
    
    const userNamespace = io.of("/users");
    
    userNamespace.on("connection", (socket) => {
    socket.join("room1"); // distinct from the room in the "orders" namespace
    userNamespace.to("room1").emit("holà");
    });
    ```
    
    - middlewares
    
    ```
    const orderNamespace = io.of("/orders");
    
    orderNamespace.use((socket, next) => {
    // ensure the socket has access to the "orders" namespace
    });
    
    const userNamespace = io.of("/users");
    
    userNamespace.use((socket, next) => {
    // ensure the socket has access to the "users" namespace
    });
    ```
    - **name** <span style="color: red">required</span> : <span style="color: green;">string</span>
    - **sockets** <span style="color: red">required</span> : <span style="color: green;">Map&lt;string, Socket&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;&gt;</span>

      A map of currently connected sockets.
    - **_preConnectSockets** <span style="color: red">required</span> : <span style="color: green;">any</span>

      A map of currently connecting sockets.
    - **adapter** <span style="color: red">required</span> : <span style="color: green;">Adapter</span>
    - **server** <span style="color: red">required</span> : <span style="color: green;">Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Represents a Socket.IO server.
    - **_fns** <span style="color: red">required</span> : <span style="color: green;">any</span>
    - **_ids** <span style="color: red">required</span> : <span style="color: green;">number</span>
    - **_initAdapter** <span style="color: red">required</span> : <span style="color: green;">() =&gt; void</span>

      Initializes the `Adapter` for this nsp.
      Run upon changing adapter by `Server#adapter`
      in addition to the constructor.
    - **use** <span style="color: red">required</span> : <span style="color: green;">(fn: (socket: Socket&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;, next: (err?: ExtendedError | undefined) =&gt; void) =&gt; void) =&gt; Namespace&lt;...&gt;</span>

      Registers a middleware, which is a function that gets executed for every incoming  {@link  Socket } .
    - **run** <span style="color: red">required</span> : <span style="color: green;">any</span>

      Executes the middleware for an incoming client.
    - **to** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Targets a room when broadcasting.
    - **in** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Targets a room when broadcasting.
    - **except** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Targets a room when broadcasting.
    - **_add** <span style="color: red">required</span> : <span style="color: green;">(client: Client&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;, auth: Record&lt;string, unknown&gt;, fn: (socket: Socket&lt;...&gt;) =&gt; void) =&gt; Promise&lt;...&gt;</span>

      Adds a new client.
    - **_createSocket** <span style="color: red">required</span> : <span style="color: green;">any</span>
    - **_doConnect** <span style="color: red">required</span> : <span style="color: green;">any</span>
    - **_remove** <span style="color: red">required</span> : <span style="color: green;">(socket: Socket&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;) =&gt; void</span>

      Removes a socket. Called by each `Socket`.
    - **emit** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; boolean</span>

      Emits to this client.
    - **send** <span style="color: red">required</span> : <span style="color: green;">(...args: any[]) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Sends a `message` event to all clients.
      
      This method mimics the WebSocket.send() method.
    - **write** <span style="color: red">required</span> : <span style="color: green;">(...args: any[]) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Sends a `message` event to all clients.
      
      This method mimics the WebSocket.send() method.
    - **serverSideEmit** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; boolean</span>

      Emits to this client.
    - **serverSideEmitWithAck** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; Promise&lt;any[]&gt;</span>

      Sends a message and expect an acknowledgement from the other Socket.IO servers of the cluster.
    - **_onServerSideEmit** <span style="color: red">required</span> : <span style="color: green;">(args: [string, ...any[]]) =&gt; void</span>

      Called when a packet is received from another Socket.IO server
    - **allSockets** <span style="color: red">required</span> : <span style="color: green;">() =&gt; Promise&lt;Set&lt;string&gt;&gt;</span>

      Gets a list of clients.
    - **compress** <span style="color: red">required</span> : <span style="color: green;">(compress: boolean) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Sets the compress flag.
    - **volatile** <span style="color: red">required</span> : <span style="color: green;">BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to
      receive messages (because of network slowness or other issues, or because they’re connected through long polling
      and is in the middle of a request-response cycle).
    - **local** <span style="color: red">required</span> : <span style="color: green;">BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

      Sets a modifier for a subsequent event emission that the event data will only be broadcast to the current node.
    - **timeout** <span style="color: red">required</span> : <span style="color: green;">(timeout: number) =&gt; BroadcastOperator&lt;DecorateAcknowledgements&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;&gt;, any&gt;</span>

      Adds a timeout in milliseconds for the next operation
    - **fetchSockets** <span style="color: red">required</span> : <span style="color: green;">() =&gt; Promise&lt;RemoteSocket&lt;DefaultEventsMap, any&gt;[]&gt;</span>

      Returns the matching socket instances.
      
      Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
    - **socketsJoin** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; void</span>

      Makes the matching socket instances join the specified rooms.
      
      Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
    - **socketsLeave** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; void</span>

      Makes the matching socket instances join the specified rooms.
      
      Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
    - **disconnectSockets** <span style="color: red">required</span> : <span style="color: green;">(close?: boolean | undefined) =&gt; void</span>

      Makes the matching socket instances disconnect.
      
      Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
    - **on** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, listener: FallbackToUntypedListener&lt;Ev extends "connection" | "connect" ? NamespaceReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;) =&gt; Namespace&lt;...&gt;</span>

      Adds the `listener` function as an event listener for `ev`.
    - **once** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, listener: FallbackToUntypedListener&lt;Ev extends "connection" | "connect" ? NamespaceReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;) =&gt; Namespace&lt;...&gt;</span>

      Adds the `listener` function as an event listener for `ev`.
    - **emitReserved** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends "connection" | "connect"&gt;(ev: Ev, ...args: Parameters&lt;NamespaceReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev]&gt;) =&gt; boolean</span>

      Emits a reserved event.
      
      This method is `protected`, so that only a class extending
      `StrictEventEmitter` can emit its own reserved events.
    - **emitUntyped** <span style="color: red">required</span> : <span style="color: green;">(ev: string, ...args: any[]) =&gt; boolean</span>

      Emits an event.
      
      This method is `protected`, so that only a class extending
      `StrictEventEmitter` can get around the strict typing. This is useful for
      calling `emit.apply`, which can be called as `emitUntyped.apply`.
    - **listeners** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(event: Ev) =&gt; FallbackToUntypedListener&lt;Ev extends "connection" | "connect" ? NamespaceReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;[]</span>

      Returns the listeners listening to an event.
    - **__@captureRejectionSymbol@1254** <span style="color: grey">optional</span> : <span style="color: green;">(&lt;K&gt;(error: Error, event: string | symbol, ...args: AnyRest) =&gt; void) | undefined</span>
    - **addListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Alias for `emitter.on(eventName, listener)`.
    - **removeListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Alias for `emitter.on(eventName, listener)`.
    - **off** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Alias for `emitter.on(eventName, listener)`.
    - **removeAllListeners** <span style="color: red">required</span> : <span style="color: green;">(eventName?: string | symbol | undefined) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Removes all listeners, or those of the specified `eventName`.
      
      It is bad practice to remove listeners added elsewhere in the code,
      particularly when the `EventEmitter` instance was created by some other
      component or module (e.g. sockets or file streams).
      
      Returns a reference to the `EventEmitter`, so that calls can be chained.
    - **setMaxListeners** <span style="color: red">required</span> : <span style="color: green;">(n: number) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      By default `EventEmitter`s will print a warning if more than `10` listeners are
      added for a particular event. This is a useful default that helps finding
      memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
      modified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.
      
      Returns a reference to the `EventEmitter`, so that calls can be chained.
    - **getMaxListeners** <span style="color: red">required</span> : <span style="color: green;">() =&gt; number</span>

      Returns the current max listener value for the `EventEmitter` which is either
      set by `emitter.setMaxListeners(n)` or defaults to  {@link  defaultMaxListeners  } .
    - **rawListeners** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol) =&gt; Function[]</span>

      Returns a copy of the array of listeners for the event named `eventName`.
      
      ```js
      server.on('connection', (stream) => {
      console.log('someone connected!');
      });
      console.log(util.inspect(server.listeners('connection')));
      // Prints: [ [Function] ]
      ```
    - **listenerCount** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener?: Function | undefined) =&gt; number</span>

      Returns the number of listeners listening for the event named `eventName`.
      If `listener` is provided, it will return how many times the listener is found
      in the list of the listeners of the event.
    - **prependListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Alias for `emitter.on(eventName, listener)`.
    - **prependOnceListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

      Alias for `emitter.on(eventName, listener)`.
    - **eventNames** <span style="color: red">required</span> : <span style="color: green;">() =&gt; (string | symbol)[]</span>

      Returns an array listing the events for which the emitter has registered
      listeners. The values in the array are strings or `Symbol`s.
      
      ```js
      import { EventEmitter } from 'node:events';
      
      const myEE = new EventEmitter();
      myEE.on('foo', () => {});
      myEE.on('bar', () => {});
      
      const sym = Symbol('symbol');
      myEE.on(sym, () => {});
      
      console.log(myEE.eventNames());
      // Prints: [ 'foo', 'bar', Symbol(symbol) ]
      ```
  - **engine** <span style="color: red">required</span> : <span style="color: green;">Server</span>

    An Engine.IO server based on Node.js built-in HTTP server and the `ws` package for WebSocket connections.
  - **httpServer** <span style="color: red">required</span> : <span style="color: green;">TServerInstance</span>

    The underlying Node.js HTTP server.
  - **_parser** <span style="color: red">required</span> : <span style="color: green;">typeof import("/home/s/prostgles-server-js/node_modules/socket.io-parser/build/esm/index")</span>
  - **encoder** <span style="color: red">required</span> : <span style="color: green;">Encoder</span>

    A socket.io Encoder instance
  - **_nsps** <span style="color: red">required</span> : <span style="color: green;">Map&lt;string, Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;&gt;</span>
    - **clear** <span style="color: red">required</span> : <span style="color: green;">() =&gt; void</span>
    - **delete** <span style="color: red">required</span> : <span style="color: green;">(key: string) =&gt; boolean</span>
    - **forEach** <span style="color: red">required</span> : <span style="color: green;">(callbackfn: (value: Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;, key: string, map: Map&lt;string, Namespace&lt;...&gt;&gt;) =&gt; void, thisArg?: any) =&gt; void</span>

      Executes a provided function once per each key/value pair in the Map, in insertion order.
    - **get** <span style="color: red">required</span> : <span style="color: green;">(key: string) =&gt; Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt; | undefined</span>

      Returns a specified element from the Map object. If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.
    - **has** <span style="color: red">required</span> : <span style="color: green;">(key: string) =&gt; boolean</span>
    - **set** <span style="color: red">required</span> : <span style="color: green;">(key: string, value: Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;) =&gt; Map&lt;string, Namespace&lt;...&gt;&gt;</span>

      Adds a new element with a specified key and value to the Map. If an element with the same key already exists, the element will be updated.
    - **size** <span style="color: red">required</span> : <span style="color: green;">number</span>
    - **entries** <span style="color: red">required</span> : <span style="color: green;">() =&gt; IterableIterator&lt;[string, Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;]&gt;</span>

      Returns an iterable of key, value pairs for every entry in the map.
    - **keys** <span style="color: red">required</span> : <span style="color: green;">() =&gt; IterableIterator&lt;string&gt;</span>

      Returns an iterable of values in the array
    - **values** <span style="color: red">required</span> : <span style="color: green;">() =&gt; IterableIterator&lt;Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;&gt;</span>

      Returns an iterable of values in the map
    - **__@iterator@86** <span style="color: red">required</span> : <span style="color: green;">() =&gt; IterableIterator&lt;[string, Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;]&gt;</span>

      Returns an iterable of key, value pairs for every entry in the map.
    - **__@toStringTag@68** <span style="color: red">required</span> : <span style="color: green;">string</span>
  - **parentNsps** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **parentNamespacesFromRegExp** <span style="color: red">required</span> : <span style="color: green;">any</span>

    A subset of the  {@link  parentNsps }  map, only containing  {@link  ParentNamespace  }  which are based on a regular
    expression.
  - **_adapter** <span style="color: grey">optional</span> : <span style="color: green;">any</span>
  - **_serveClient** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **opts** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **eio** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **_path** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **clientPathRegex** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **_connectTimeout** <span style="color: red">required</span> : <span style="color: green;">number</span>
  - **_corsMiddleware** <span style="color: red">required</span> : <span style="color: green;">any</span>
  - **_opts** <span style="color: red">required</span> : <span style="color: green;">Partial</span>

    Make all properties in T optional
  - **serveClient** <span style="color: red">required</span> : <span style="color: green;">{ (v: boolean): Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;; (): boolean; (v?: boolean | undefined): boolean | Server&lt;...&gt;; }</span>

    Sets/gets whether client code is being served.
  - **_checkNamespace** <span style="color: red">required</span> : <span style="color: green;">(name: string, auth: { [key: string]: any; }, fn: (nsp: false | Namespace&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;) =&gt; void) =&gt; void</span>

    Executes the middleware for an incoming namespace not already created on the server.
  - **path** <span style="color: red">required</span> : <span style="color: green;">{ (v: string): Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;; (): string; (v?: string | undefined): string | Server&lt;...&gt;; }</span>

    Sets the client serving path.
  - **connectTimeout** <span style="color: red">required</span> : <span style="color: green;">{ (v: number): Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;; (): number; (v?: number | undefined): number | Server&lt;...&gt;; }</span>

    Set the delay after which a client without namespace is closed
  - **adapter** <span style="color: red">required</span> : <span style="color: green;">{ (): AdapterConstructor | undefined; (v: AdapterConstructor): Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;; }</span>

    Sets the adapter for rooms.
  - **listen** <span style="color: red">required</span> : <span style="color: green;">(srv: number | TServerInstance, opts?: Partial&lt;ServerOptions&gt; | undefined) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Attaches socket.io to a server or port.
  - **attach** <span style="color: red">required</span> : <span style="color: green;">(srv: number | TServerInstance, opts?: Partial&lt;ServerOptions&gt; | undefined) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Attaches socket.io to a server or port.
  - **attachApp** <span style="color: red">required</span> : <span style="color: green;">(app: any, opts?: Partial&lt;ServerOptions&gt; | undefined) =&gt; void</span>
  - **initEngine** <span style="color: red">required</span> : <span style="color: green;">any</span>

    Initialize engine
  - **attachServe** <span style="color: red">required</span> : <span style="color: green;">any</span>

    Attaches the static file serving.
  - **serve** <span style="color: red">required</span> : <span style="color: green;">any</span>

    Handles a request serving of client source and map
  - **bind** <span style="color: red">required</span> : <span style="color: green;">(engine: any) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Binds socket.io to an engine.io instance.
  - **onconnection** <span style="color: red">required</span> : <span style="color: green;">any</span>

    Called with each incoming transport connection.
  - **of** <span style="color: red">required</span> : <span style="color: green;">(name: string | RegExp | ParentNspNameMatchFn, fn?: ((socket: Socket&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;) =&gt; void) | undefined) =&gt; Namespace&lt;...&gt;</span>

    Looks up a namespace.
  - **close** <span style="color: red">required</span> : <span style="color: green;">(fn?: ((err?: Error | undefined) =&gt; void) | undefined) =&gt; Promise&lt;void&gt;</span>

    Closes server connection
  - **use** <span style="color: red">required</span> : <span style="color: green;">(fn: (socket: Socket&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;, next: (err?: ExtendedError | undefined) =&gt; void) =&gt; void) =&gt; Server&lt;...&gt;</span>

    Registers a middleware, which is a function that gets executed for every incoming  {@link  Socket } .
  - **to** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Targets a room when broadcasting.
  - **in** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Targets a room when broadcasting.
  - **except** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Targets a room when broadcasting.
  - **send** <span style="color: red">required</span> : <span style="color: green;">(...args: any[]) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Sends a `message` event to all clients.
    
    This method mimics the WebSocket.send() method.
  - **write** <span style="color: red">required</span> : <span style="color: green;">(...args: any[]) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Sends a `message` event to all clients.
    
    This method mimics the WebSocket.send() method.
  - **serverSideEmit** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; boolean</span>

    Emits to this client.
  - **serverSideEmitWithAck** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; Promise&lt;any[]&gt;</span>

    Sends a message and expect an acknowledgement from the other Socket.IO servers of the cluster.
  - **allSockets** <span style="color: red">required</span> : <span style="color: green;">() =&gt; Promise&lt;Set&lt;string&gt;&gt;</span>

    Gets a list of clients.
  - **compress** <span style="color: red">required</span> : <span style="color: green;">(compress: boolean) =&gt; BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Sets the compress flag.
  - **volatile** <span style="color: red">required</span> : <span style="color: green;">BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to
    receive messages (because of network slowness or other issues, or because they’re connected through long polling
    and is in the middle of a request-response cycle).
  - **local** <span style="color: red">required</span> : <span style="color: green;">BroadcastOperator&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;, any&gt;</span>

    Sets a modifier for a subsequent event emission that the event data will only be broadcast to the current node.
  - **timeout** <span style="color: red">required</span> : <span style="color: green;">(timeout: number) =&gt; BroadcastOperator&lt;DecorateAcknowledgements&lt;DecorateAcknowledgementsWithMultipleResponses&lt;DefaultEventsMap&gt;&gt;, any&gt;</span>

    Adds a timeout in milliseconds for the next operation
  - **fetchSockets** <span style="color: red">required</span> : <span style="color: green;">() =&gt; Promise&lt;RemoteSocket&lt;DefaultEventsMap, any&gt;[]&gt;</span>

    Returns the matching socket instances.
    
    Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
  - **socketsJoin** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; void</span>

    Makes the matching socket instances join the specified rooms.
    
    Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
  - **socketsLeave** <span style="color: red">required</span> : <span style="color: green;">(room: string | string[]) =&gt; void</span>

    Makes the matching socket instances join the specified rooms.
    
    Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
  - **disconnectSockets** <span style="color: red">required</span> : <span style="color: green;">(close?: boolean | undefined) =&gt; void</span>

    Makes the matching socket instances disconnect.
    
    Note: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .
  - **on** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, listener: FallbackToUntypedListener&lt;Ev extends "connection" | "connect" | "new_namespace" ? ServerReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;) =&gt; Server&lt;...&gt;</span>

    Adds the `listener` function as an event listener for `ev`.
  - **once** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, listener: FallbackToUntypedListener&lt;Ev extends "connection" | "connect" | "new_namespace" ? ServerReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;) =&gt; Server&lt;...&gt;</span>

    Adds the `listener` function as an event listener for `ev`.
  - **emit** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(ev: Ev, ...args: any[]) =&gt; boolean</span>

    Emits to this client.
  - **emitReserved** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends "connection" | "connect" | "new_namespace"&gt;(ev: Ev, ...args: Parameters&lt;ServerReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev]&gt;) =&gt; boolean</span>

    Emits a reserved event.
    
    This method is `protected`, so that only a class extending
    `StrictEventEmitter` can emit its own reserved events.
  - **emitUntyped** <span style="color: red">required</span> : <span style="color: green;">(ev: string, ...args: any[]) =&gt; boolean</span>

    Emits an event.
    
    This method is `protected`, so that only a class extending
    `StrictEventEmitter` can get around the strict typing. This is useful for
    calling `emit.apply`, which can be called as `emitUntyped.apply`.
  - **listeners** <span style="color: red">required</span> : <span style="color: green;">&lt;Ev extends string&gt;(event: Ev) =&gt; FallbackToUntypedListener&lt;Ev extends "connection" | "connect" | "new_namespace" ? ServerReservedEventsMap&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;[Ev] : Ev extends string ? (...args: any[]) =&gt; void : never&gt;[]</span>

    Returns the listeners listening to an event.
  - **__@captureRejectionSymbol@1254** <span style="color: grey">optional</span> : <span style="color: green;">(&lt;K&gt;(error: Error, event: string | symbol, ...args: AnyRest) =&gt; void) | undefined</span>
  - **addListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Alias for `emitter.on(eventName, listener)`.
  - **removeListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Alias for `emitter.on(eventName, listener)`.
  - **off** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Alias for `emitter.on(eventName, listener)`.
  - **removeAllListeners** <span style="color: red">required</span> : <span style="color: green;">(eventName?: string | symbol | undefined) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Removes all listeners, or those of the specified `eventName`.
    
    It is bad practice to remove listeners added elsewhere in the code,
    particularly when the `EventEmitter` instance was created by some other
    component or module (e.g. sockets or file streams).
    
    Returns a reference to the `EventEmitter`, so that calls can be chained.
  - **setMaxListeners** <span style="color: red">required</span> : <span style="color: green;">(n: number) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    By default `EventEmitter`s will print a warning if more than `10` listeners are
    added for a particular event. This is a useful default that helps finding
    memory leaks. The `emitter.setMaxListeners()` method allows the limit to be
    modified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.
    
    Returns a reference to the `EventEmitter`, so that calls can be chained.
  - **getMaxListeners** <span style="color: red">required</span> : <span style="color: green;">() =&gt; number</span>

    Returns the current max listener value for the `EventEmitter` which is either
    set by `emitter.setMaxListeners(n)` or defaults to  {@link  defaultMaxListeners  } .
  - **rawListeners** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol) =&gt; Function[]</span>

    Returns a copy of the array of listeners for the event named `eventName`.
    
    ```js
    server.on('connection', (stream) => {
    console.log('someone connected!');
    });
    console.log(util.inspect(server.listeners('connection')));
    // Prints: [ [Function] ]
    ```
  - **listenerCount** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener?: Function | undefined) =&gt; number</span>

    Returns the number of listeners listening for the event named `eventName`.
    If `listener` is provided, it will return how many times the listener is found
    in the list of the listeners of the event.
  - **prependListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Alias for `emitter.on(eventName, listener)`.
  - **prependOnceListener** <span style="color: red">required</span> : <span style="color: green;">&lt;K&gt;(eventName: string | symbol, listener: (...args: any[]) =&gt; void) =&gt; Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt;</span>

    Alias for `emitter.on(eventName, listener)`.
  - **eventNames** <span style="color: red">required</span> : <span style="color: green;">() =&gt; (string | symbol)[]</span>

    Returns an array listing the events for which the emitter has registered
    listeners. The values in the array are strings or `Symbol`s.
    
    ```js
    import { EventEmitter } from 'node:events';
    
    const myEE = new EventEmitter();
    myEE.on('foo', () => {});
    myEE.on('bar', () => {});
    
    const sym = Symbol('symbol');
    myEE.on(sym, () => {});
    
    console.log(myEE.eventNames());
    // Prints: [ 'foo', 'bar', Symbol(symbol) ]
    ```

- **publish** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">"*"</span> | <span style="color: green;">any</span> | <span style="color: green;">(params: PublishParams&lt;S, SUser&gt;) =&gt; Awaitable&lt;PublishedResult&lt;S&gt;&gt;</span> | <span style="color: green;">boolean</span>

  Data access rules applied to clients.
  By default, nothing is allowed.

- **testRulesOnConnect** <span style="color: grey">optional</span> : <span style="color: green;">boolean | undefined</span>

  If true then will test all table methods on each socket connect.
  Not recommended for production

- **publishMethods** <span style="color: grey">optional</span> : <span style="color: green;">PublishMethods</span>

  Custom methods that can be called from the client

- **publishRawSQL** <span style="color: grey">optional</span> : <span style="color: green;">(params: PublishParams&lt;S, SUser&gt;) =&gt; boolean | "*" | Promise&lt;boolean | "*"&gt;</span>

  If defined and resolves to true then the connected client can run SQL queries

- **joins** <span style="color: grey">optional</span> : <span style="color: green;">Join[]</span> | <span style="color: brown;">"inferred"</span>

  Allows defining joins between tables:
  - `infered` - uses the foreign keys to infer the joins
  - `Join[]` - specifies the joins manually

- **schema** <span style="color: grey">optional</span> : <span style="color: green;">Record</span> | <span style="color: green;">Record</span>

  If defined then the specified schemas are included/excluded from the prostgles schema.
  By default the `public` schema is included.

- **sqlFilePath** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

  Path to a SQL file that will be executed on startup (but before onReady)

- **transactions** <span style="color: grey">optional</span> : <span style="color: green;">string</span> | <span style="color: green;">boolean</span>

- **wsChannelNamePrefix** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

- **onSocketConnect** <span style="color: grey">optional</span> : <span style="color: green;">(args: AuthRequestParams&lt;S, SUser&gt; & { socket: PRGLIOSocket; }) =&gt; void | Promise&lt;void&gt;</span>

  Called when a socket connects
  Use for connection verification. Will disconnect socket on any errors

- **onSocketDisconnect** <span style="color: grey">optional</span> : <span style="color: green;">(args: AuthRequestParams&lt;S, SUser&gt; & { socket: PRGLIOSocket; }) =&gt; void | Promise&lt;void&gt;</span>

  Called when a socket disconnects

- **auth** <span style="color: grey">optional</span> : <span style="color: green;">Auth</span>

  Auth configuration.
  Supports email and OAuth strategies
  - **sidKeyName** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

    Name of the cookie or socket hadnshake query param that represents the session id.
    Defaults to "session_id"
  - **responseThrottle** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

    Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
  - **expressConfig** <span style="color: grey">optional</span> : <span style="color: green;">{ app: Express; cookieOptions?: AnyObject | undefined; disableSocketAuthGuard?: boolean | undefined; publicRoutes?: string[] | undefined; use?: ((args: { req: ExpressReq; res: ExpressRes; next: NextFunction; } & AuthRequestParams&lt;...&gt;) =&gt; void | Promise&lt;...&gt;) | undefined; onGetRequestOK?: ((req: ExpressReq, res: Exp...</span>

    Will setup auth routes
    /login
    /logout
    /magic-link/:id
  - **getUser** <span style="color: red">required</span> : <span style="color: green;">(sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB, client: AuthClientRequest & LoginClientInfo) =&gt; Awaitable&lt;AuthResult&lt;...&gt;&gt;</span>

    undefined sid is allowed to enable public users
  - **login** <span style="color: grey">optional</span> : <span style="color: green;">(params: LoginParams, dbo: DBOFullyTyped&lt;S&gt;, db: DB, client: LoginClientInfo) =&gt; Awaitable&lt;BasicSession&gt;</span>
  - **logout** <span style="color: grey">optional</span> : <span style="color: green;">(sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB) =&gt; any</span>
  - **cacheSession** <span style="color: grey">optional</span> : <span style="color: green;">{ getSession: (sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB) =&gt; Awaitable&lt;BasicSession&gt;; }</span>

    If provided then session info will be saved on socket.__prglCache and reused from there

- **DEBUG_MODE** <span style="color: grey">optional</span> : <span style="color: green;">boolean | undefined</span>

- **onQuery** <span style="color: grey">optional</span> : <span style="color: green;">(error: any, ctx: IEventContext&lt;IClient&gt;) =&gt; void</span>

  Callback called when a query is executed.
  Useful for logging or debugging

- **watchSchemaType** <span style="color: grey">optional</span> : <span style="color: brown;">"DDL_trigger"</span> | <span style="color: brown;">"prostgles_queries"</span>

- **watchSchema** <span style="color: grey">optional</span> : <span style="color: green;">"*"</span> | <span style="color: green;">Partial</span> | <span style="color: green;">Partial</span> | <span style="color: brown;">"hotReloadMode"</span> | <span style="color: green;">OnSchemaChangeCallback</span> | <span style="color: green;">boolean</span>

  If truthy then DBGeneratedSchema.d.ts will be updated
  and "onReady" will be called with new schema on both client and server

- **keywords** <span style="color: grey">optional</span> : <span style="color: green;">Keywords</span>
  - **$and** <span style="color: red">required</span> : <span style="color: green;">string</span>
  - **$or** <span style="color: red">required</span> : <span style="color: green;">string</span>
  - **$not** <span style="color: red">required</span> : <span style="color: green;">string</span>

- **onNotice** <span style="color: grey">optional</span> : <span style="color: green;">(notice: AnyObject, message?: string | undefined) =&gt; void</span>

- **fileTable** <span style="color: grey">optional</span> : <span style="color: green;">FileTableConfig | undefined</span>

  Enables file storage and serving.
  Currently supports saving files locally or to AWS S3

- **restApi** <span style="color: grey">optional</span> : <span style="color: green;">RestApiConfig</span>

  Rest API configuration.
  The REST API allows interacting with the database similarly to the socket connection
  with the exception of subscriptions and realtime features
  - **expressApp** <span style="color: red">required</span> : <span style="color: green;">Express</span>
  - **routePrefix** <span style="color: red">required</span> : <span style="color: green;">string</span>

- **tableConfig** <span style="color: grey">optional</span> : <span style="color: green;">TableConfig</span>

  A simple way of defining tables through a JSON-schema like object.
  Allowes adding runtime JSONB validation and type safety.
  Should be used with caution because it tends to revert any changes
  made to the database schema through SQL queries


- **tableConfigMigrations** <span style="color: grey">optional</span> : <span style="color: green;">{ silentFail?: boolean | undefined; version: number; versionTableName?: string | undefined; onMigrate: (args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: ("c" | ... 2 more ... | "f")[] | undefined) =&gt; Promise&lt;...&gt;; }) =&gt; void; }</span>
  - **silentFail** <span style="color: grey">optional</span> : <span style="color: green;">boolean | undefined</span>

    If false then prostgles won't start on any tableConfig error
    true by default
  - **version** <span style="color: red">required</span> : <span style="color: green;">number</span>
  - **versionTableName** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

    Table that will contain the schema version number and the tableConfig
    Defaults to schema_version
  - **onMigrate** <span style="color: red">required</span> : <span style="color: green;">(args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: ("c" | "p" | "u" | "f")[] | undefined) =&gt; Promise&lt;ColConstraint[]&gt;; }) =&gt; void</span>

    Script run before tableConfig is loaded IF an older schema_version is present

- **onLog** <span style="color: grey">optional</span> : <span style="color: green;">(evt: EventInfo) =&gt; Promise&lt;void&gt;</span>

  Usefull for logging or debugging