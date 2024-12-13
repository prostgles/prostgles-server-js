import type { TS_Type } from "./getSerializableType";
export const definitions = [
  {
    "type": "object",
    "alias": "ProstglesInitOptions<S, SUser>",
    "aliasSymbolescapedName": "ProstglesInitOptions",
    "comments": "",
    "properties": {
      "dbConnection": {
        "type": "union",
        "alias": "DbConnection",
        "aliasSymbolescapedName": "DbConnection",
        "comments": "Database connection details",
        "types": [
          {
            "type": "primitive",
            "alias": "string",
            "subType": "string"
          },
          {
            "type": "object",
            "alias": "IConnectionParameters<IClient>",
            "properties": {
              "connectionString": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "host": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "database": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "user": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "password": {
                "type": "union",
                "alias": "DynamicPassword | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string"
                  },
                  {
                    "type": "reference",
                    "alias": "() => string"
                  },
                  {
                    "type": "reference",
                    "alias": "() => Promise<string>"
                  }
                ],
                "optional": true
              },
              "port": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "ssl": {
                "type": "union",
                "alias": "boolean | ISSLConfig | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "reference",
                    "alias": "ISSLConfig"
                  },
                  {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean"
                  }
                ],
                "optional": true
              },
              "binary": {
                "type": "reference",
                "alias": "boolean | undefined",
                "optional": true
              },
              "client_encoding": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "encoding": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "application_name": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "fallback_application_name": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "isDomainSocket": {
                "type": "reference",
                "alias": "boolean | undefined",
                "optional": true
              },
              "max": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "maxUses": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "idleTimeoutMillis": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "parseInputDatesAsUTC": {
                "type": "reference",
                "alias": "boolean | undefined",
                "optional": true
              },
              "rows": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "statement_timeout": {
                "type": "union",
                "alias": "number | boolean | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  },
                  {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean"
                  }
                ],
                "optional": true
              },
              "lock_timeout": {
                "type": "union",
                "alias": "number | boolean | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  },
                  {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean"
                  }
                ],
                "optional": true
              },
              "idle_in_transaction_session_timeout": {
                "type": "union",
                "alias": "number | boolean | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  },
                  {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean"
                  }
                ],
                "optional": true
              },
              "query_timeout": {
                "type": "union",
                "alias": "number | boolean | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  },
                  {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean"
                  }
                ],
                "optional": true
              },
              "connectionTimeoutMillis": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "keepAliveInitialDelayMillis": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "keepAlive": {
                "type": "reference",
                "alias": "boolean | undefined",
                "optional": true
              },
              "keepalives": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "keepalives_idle": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              },
              "stream": {
                "type": "union",
                "alias": "Socket | ((cn: IConnectionParameters<IClient>) => Socket) | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "reference",
                    "alias": "Socket"
                  },
                  {
                    "type": "reference",
                    "alias": "(cn: IConnectionParameters<IClient>) => Socket"
                  }
                ],
                "optional": true
              },
              "Client": {
                "type": "reference",
                "alias": "new (config: string | IConnectionParameters<IClient>) => IClient",
                "optional": true
              },
              "Promise": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "types": {
                "type": "reference",
                "alias": "ITypeOverrides",
                "optional": true
              },
              "allowExitOnIdle": {
                "type": "reference",
                "alias": "boolean | undefined",
                "optional": true
              },
              "maxLifetimeSeconds": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true
              }
            }
          }
        ],
        "optional": false
      },
      "onReady": {
        "type": "function",
        "alias": "OnReadyCallback<S>",
        "aliasSymbolescapedName": "OnReadyCallback",
        "arguments": [
          {
            "name": "params",
            "optional": false,
            "type": "object",
            "alias": "OnReadyParams<S>",
            "aliasSymbolescapedName": "OnReadyParams",
            "properties": {
              "db": {
                "type": "reference",
                "alias": "DB",
                "aliasSymbolescapedName": "DB",
                "optional": false,
                "intersectionParent": "OnReadyParamsCommon"
              },
              "tables": {
                "type": "reference",
                "alias": "DbTableInfo[]",
                "optional": false,
                "intersectionParent": "OnReadyParamsCommon"
              },
              "reason": {
                "type": "reference",
                "alias": "OnInitReason",
                "aliasSymbolescapedName": "OnInitReason",
                "optional": false,
                "intersectionParent": "OnReadyParamsCommon"
              },
              "dbo": {
                "type": "reference",
                "alias": "DBOFullyTyped<S>",
                "aliasSymbolescapedName": "DBOFullyTyped",
                "optional": false
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "primitive",
          "alias": "any",
          "subType": "any"
        },
        "optional": false,
        "comments": "Called when the prostgles server is ready to accept connections.\nIt waits for auth, tableConfig and other async configurations to complete before executing"
      },
      "tsGeneratedTypesDir": {
        "type": "primitive",
        "alias": "string",
        "subType": "string",
        "optional": true,
        "comments": "If defined then a `DBGeneratedSchema.d.ts` file will be created in the provided directory.\nThis file exports a `DBGeneratedSchema` type which contains types for the database tables and\ncan be used as a generic type input for the prostgles instances to ensure type safety"
      },
      "disableRealtime": {
        "type": "reference",
        "alias": "boolean | undefined",
        "comments": "If true then schema watch, subscriptions and syncs will be disabled.\nNo `prostgles` schema will be created which is needed for the realtime features.\nThis is useful when you want to connect to a database and prevent any changes to the schema",
        "optional": true
      },
      "io": {
        "type": "object",
        "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
        "comments": "Socket.IO server instance object",
        "properties": {
          "sockets": {
            "type": "object",
            "alias": "Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "A Namespace is a communication channel that allows you to split the logic of your application over a single shared\nconnection.\n\nEach namespace has its own:\n\n- event handlers\n\n```\nio.of(\"/orders\").on(\"connection\", (socket) => {\n  socket.on(\"order:list\", () => {});\n  socket.on(\"order:create\", () => {});\n});\n\nio.of(\"/users\").on(\"connection\", (socket) => {\n  socket.on(\"user:list\", () => {});\n});\n```\n\n- rooms\n\n```\nconst orderNamespace = io.of(\"/orders\");\n\norderNamespace.on(\"connection\", (socket) => {\n  socket.join(\"room1\");\n  orderNamespace.to(\"room1\").emit(\"hello\");\n});\n\nconst userNamespace = io.of(\"/users\");\n\nuserNamespace.on(\"connection\", (socket) => {\n  socket.join(\"room1\"); // distinct from the room in the \"orders\" namespace\n  userNamespace.to(\"room1\").emit(\"holà\");\n});\n```\n\n- middlewares\n\n```\nconst orderNamespace = io.of(\"/orders\");\n\norderNamespace.use((socket, next) => {\n  // ensure the socket has access to the \"orders\" namespace\n});\n\nconst userNamespace = io.of(\"/users\");\n\nuserNamespace.use((socket, next) => {\n  // ensure the socket has access to the \"users\" namespace\n});\n```",
            "properties": {
              "name": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": false
              },
              "sockets": {
                "type": "reference",
                "alias": "Map<string, Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>",
                "comments": "A map of currently connected sockets.",
                "optional": false
              },
              "_preConnectSockets": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": false,
                "comments": "A map of currently connecting sockets."
              },
              "adapter": {
                "type": "reference",
                "alias": "Adapter",
                "optional": false
              },
              "server": {
                "type": "reference",
                "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Represents a Socket.IO server.",
                "optional": false
              },
              "_fns": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": false
              },
              "_ids": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": false
              },
              "_initAdapter": {
                "type": "reference",
                "alias": "() => void",
                "comments": "Initializes the `Adapter` for this nsp.\nRun upon changing adapter by `Server#adapter`\nin addition to the constructor.",
                "optional": false
              },
              "use": {
                "type": "reference",
                "alias": "(fn: (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, next: (err?: ExtendedError | undefined) => void) => void) => Namespace<...>",
                "comments": "Registers a middleware, which is a function that gets executed for every incoming  {@link  Socket } .",
                "optional": false
              },
              "run": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": false,
                "comments": "Executes the middleware for an incoming client."
              },
              "to": {
                "type": "reference",
                "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Targets a room when broadcasting.",
                "optional": false
              },
              "in": {
                "type": "reference",
                "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Targets a room when broadcasting.",
                "optional": false
              },
              "except": {
                "type": "reference",
                "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Targets a room when broadcasting.",
                "optional": false
              },
              "_add": {
                "type": "reference",
                "alias": "(client: Client<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, auth: Record<string, unknown>, fn: (socket: Socket<...>) => void) => Promise<...>",
                "comments": "Adds a new client.",
                "optional": false
              },
              "_createSocket": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": false
              },
              "_doConnect": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": false
              },
              "_remove": {
                "type": "reference",
                "alias": "(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void",
                "comments": "Removes a socket. Called by each `Socket`.",
                "optional": false
              },
              "emit": {
                "type": "reference",
                "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
                "comments": "Emits to this client.",
                "optional": false
              },
              "send": {
                "type": "reference",
                "alias": "(...args: any[]) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
                "optional": false
              },
              "write": {
                "type": "reference",
                "alias": "(...args: any[]) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
                "optional": false
              },
              "serverSideEmit": {
                "type": "reference",
                "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
                "comments": "Emits to this client.",
                "optional": false
              },
              "serverSideEmitWithAck": {
                "type": "reference",
                "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => Promise<any[]>",
                "comments": "Sends a message and expect an acknowledgement from the other Socket.IO servers of the cluster.",
                "optional": false
              },
              "_onServerSideEmit": {
                "type": "reference",
                "alias": "(args: [string, ...any[]]) => void",
                "comments": "Called when a packet is received from another Socket.IO server",
                "optional": false
              },
              "allSockets": {
                "type": "reference",
                "alias": "() => Promise<Set<string>>",
                "comments": "Gets a list of clients.",
                "optional": false
              },
              "compress": {
                "type": "reference",
                "alias": "(compress: boolean) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Sets the compress flag.",
                "optional": false
              },
              "volatile": {
                "type": "reference",
                "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to\nreceive messages (because of network slowness or other issues, or because they’re connected through long polling\nand is in the middle of a request-response cycle).",
                "optional": false
              },
              "local": {
                "type": "reference",
                "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                "comments": "Sets a modifier for a subsequent event emission that the event data will only be broadcast to the current node.",
                "optional": false
              },
              "timeout": {
                "type": "reference",
                "alias": "(timeout: number) => BroadcastOperator<DecorateAcknowledgements<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>>, any>",
                "comments": "Adds a timeout in milliseconds for the next operation",
                "optional": false
              },
              "fetchSockets": {
                "type": "reference",
                "alias": "() => Promise<RemoteSocket<DefaultEventsMap, any>[]>",
                "comments": "Returns the matching socket instances.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                "optional": false
              },
              "socketsJoin": {
                "type": "reference",
                "alias": "(room: string | string[]) => void",
                "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                "optional": false
              },
              "socketsLeave": {
                "type": "reference",
                "alias": "(room: string | string[]) => void",
                "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                "optional": false
              },
              "disconnectSockets": {
                "type": "reference",
                "alias": "(close?: boolean | undefined) => void",
                "comments": "Makes the matching socket instances disconnect.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                "optional": false
              },
              "on": {
                "type": "reference",
                "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Namespace<...>",
                "comments": "Adds the `listener` function as an event listener for `ev`.",
                "optional": false
              },
              "once": {
                "type": "reference",
                "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Namespace<...>",
                "comments": "Adds the `listener` function as an event listener for `ev`.",
                "optional": false
              },
              "emitReserved": {
                "type": "reference",
                "alias": "<Ev extends \"connection\" | \"connect\">(ev: Ev, ...args: Parameters<NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev]>) => boolean",
                "comments": "Emits a reserved event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can emit its own reserved events.",
                "optional": false
              },
              "emitUntyped": {
                "type": "reference",
                "alias": "(ev: string, ...args: any[]) => boolean",
                "comments": "Emits an event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can get around the strict typing. This is useful for\ncalling `emit.apply`, which can be called as `emitUntyped.apply`.",
                "optional": false
              },
              "listeners": {
                "type": "reference",
                "alias": "<Ev extends string>(event: Ev) => FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>[]",
                "comments": "Returns the listeners listening to an event.",
                "optional": false
              },
              "__@captureRejectionSymbol@1254": {
                "type": "reference",
                "alias": "(<K>(error: Error, event: string | symbol, ...args: AnyRest) => void) | undefined",
                "optional": true
              },
              "addListener": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Alias for `emitter.on(eventName, listener)`.",
                "optional": false
              },
              "removeListener": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Alias for `emitter.on(eventName, listener)`.",
                "optional": false
              },
              "off": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Alias for `emitter.on(eventName, listener)`.",
                "optional": false
              },
              "removeAllListeners": {
                "type": "reference",
                "alias": "(eventName?: string | symbol | undefined) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Removes all listeners, or those of the specified `eventName`.\n\nIt is bad practice to remove listeners added elsewhere in the code,\nparticularly when the `EventEmitter` instance was created by some other\ncomponent or module (e.g. sockets or file streams).\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
                "optional": false
              },
              "setMaxListeners": {
                "type": "reference",
                "alias": "(n: number) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "By default `EventEmitter`s will print a warning if more than `10` listeners are\nadded for a particular event. This is a useful default that helps finding\nmemory leaks. The `emitter.setMaxListeners()` method allows the limit to be\nmodified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
                "optional": false
              },
              "getMaxListeners": {
                "type": "reference",
                "alias": "() => number",
                "comments": "Returns the current max listener value for the `EventEmitter` which is either\nset by `emitter.setMaxListeners(n)` or defaults to  {@link  defaultMaxListeners  } .",
                "optional": false
              },
              "rawListeners": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol) => Function[]",
                "comments": "Returns a copy of the array of listeners for the event named `eventName`.\n\n```js\nserver.on('connection', (stream) => {\n  console.log('someone connected!');\n});\nconsole.log(util.inspect(server.listeners('connection')));\n// Prints: [ [Function] ]\n```",
                "optional": false
              },
              "listenerCount": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener?: Function | undefined) => number",
                "comments": "Returns the number of listeners listening for the event named `eventName`.\nIf `listener` is provided, it will return how many times the listener is found\nin the list of the listeners of the event.",
                "optional": false
              },
              "prependListener": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Alias for `emitter.on(eventName, listener)`.",
                "optional": false
              },
              "prependOnceListener": {
                "type": "reference",
                "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                "comments": "Alias for `emitter.on(eventName, listener)`.",
                "optional": false
              },
              "eventNames": {
                "type": "reference",
                "alias": "() => (string | symbol)[]",
                "comments": "Returns an array listing the events for which the emitter has registered\nlisteners. The values in the array are strings or `Symbol`s.\n\n```js\nimport { EventEmitter } from 'node:events';\n\nconst myEE = new EventEmitter();\nmyEE.on('foo', () => {});\nmyEE.on('bar', () => {});\n\nconst sym = Symbol('symbol');\nmyEE.on(sym, () => {});\n\nconsole.log(myEE.eventNames());\n// Prints: [ 'foo', 'bar', Symbol(symbol) ]\n```",
                "optional": false
              }
            },
            "optional": false
          },
          "engine": {
            "type": "reference",
            "alias": "Server",
            "comments": "An Engine.IO server based on Node.js built-in HTTP server and the `ws` package for WebSocket connections.",
            "optional": false
          },
          "httpServer": {
            "type": "reference",
            "alias": "TServerInstance",
            "aliasSymbolescapedName": "TServerInstance",
            "comments": "The underlying Node.js HTTP server.",
            "optional": false
          },
          "_parser": {
            "type": "reference",
            "alias": "typeof import(\"/home/s/prostgles-server-js/node_modules/socket.io-parser/build/esm/index\")",
            "optional": false
          },
          "encoder": {
            "type": "reference",
            "alias": "Encoder",
            "comments": "A socket.io Encoder instance",
            "optional": false
          },
          "_nsps": {
            "type": "object",
            "alias": "Map<string, Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>",
            "properties": {
              "clear": {
                "type": "reference",
                "alias": "() => void",
                "optional": false
              },
              "delete": {
                "type": "reference",
                "alias": "(key: string) => boolean",
                "optional": false
              },
              "forEach": {
                "type": "reference",
                "alias": "(callbackfn: (value: Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, key: string, map: Map<string, Namespace<...>>) => void, thisArg?: any) => void",
                "comments": "Executes a provided function once per each key/value pair in the Map, in insertion order.",
                "optional": false
              },
              "get": {
                "type": "reference",
                "alias": "(key: string) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | undefined",
                "comments": "Returns a specified element from the Map object. If the value that is associated to the provided key is an object, then you will get a reference to that object and any change made to that object will effectively modify it inside the Map.",
                "optional": false
              },
              "has": {
                "type": "reference",
                "alias": "(key: string) => boolean",
                "optional": false
              },
              "set": {
                "type": "reference",
                "alias": "(key: string, value: Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => Map<string, Namespace<...>>",
                "comments": "Adds a new element with a specified key and value to the Map. If an element with the same key already exists, the element will be updated.",
                "optional": false
              },
              "size": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": false
              },
              "entries": {
                "type": "reference",
                "alias": "() => IterableIterator<[string, Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>]>",
                "comments": "Returns an iterable of key, value pairs for every entry in the map.",
                "optional": false
              },
              "keys": {
                "type": "reference",
                "alias": "() => IterableIterator<string>",
                "comments": "Returns an iterable of values in the array",
                "optional": false
              },
              "values": {
                "type": "reference",
                "alias": "() => IterableIterator<Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>",
                "comments": "Returns an iterable of values in the map",
                "optional": false
              },
              "__@iterator@86": {
                "type": "reference",
                "alias": "() => IterableIterator<[string, Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>]>",
                "comments": "Returns an iterable of key, value pairs for every entry in the map.",
                "optional": false
              },
              "__@toStringTag@68": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": false
              }
            },
            "optional": false
          },
          "parentNsps": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "parentNamespacesFromRegExp": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false,
            "comments": "A subset of the  {@link  parentNsps }  map, only containing  {@link  ParentNamespace  }  which are based on a regular\nexpression."
          },
          "_adapter": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          },
          "_serveClient": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "opts": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "eio": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "_path": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "clientPathRegex": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "_connectTimeout": {
            "type": "primitive",
            "alias": "number",
            "subType": "number",
            "optional": false
          },
          "_corsMiddleware": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          },
          "_opts": {
            "type": "reference",
            "alias": "Partial<ServerOptions>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "optional": false
          },
          "serveClient": {
            "type": "function",
            "alias": "{ (v: boolean): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>; (): boolean; (v?: boolean | undefined): boolean | Server<...>; }",
            "comments": "Sets/gets whether client code is being served.",
            "arguments": [
              {
                "name": "v",
                "optional": false,
                "type": "reference",
                "alias": "boolean",
                "comments": "- whether to serve client code"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "_checkNamespace": {
            "type": "function",
            "alias": "(name: string, auth: { [key: string]: any; }, fn: (nsp: false | Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void) => void",
            "comments": "Executes the middleware for an incoming namespace not already created on the server.",
            "arguments": [
              {
                "name": "name",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "- name of incoming namespace"
              },
              {
                "name": "auth",
                "optional": false,
                "type": "reference",
                "alias": "{ [key: string]: any; }",
                "comments": "- the auth parameters"
              },
              {
                "name": "fn",
                "optional": false,
                "type": "reference",
                "alias": "(nsp: false | Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void",
                "comments": "- callback"
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "optional": false
          },
          "path": {
            "type": "function",
            "alias": "{ (v: string): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>; (): string; (v?: string | undefined): string | Server<...>; }",
            "comments": "Sets the client serving path.",
            "arguments": [
              {
                "name": "v",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "pathname"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "connectTimeout": {
            "type": "function",
            "alias": "{ (v: number): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>; (): number; (v?: number | undefined): number | Server<...>; }",
            "comments": "Set the delay after which a client without namespace is closed",
            "arguments": [
              {
                "name": "v",
                "optional": false,
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "adapter": {
            "type": "function",
            "alias": "{ (): AdapterConstructor | undefined; (v: AdapterConstructor): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>; }",
            "comments": "Sets the adapter for rooms.",
            "arguments": [],
            "returnType": {
              "type": "reference",
              "alias": "AdapterConstructor | undefined"
            },
            "optional": false
          },
          "listen": {
            "type": "function",
            "alias": "(srv: number | TServerInstance, opts?: Partial<ServerOptions> | undefined) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Attaches socket.io to a server or port.",
            "arguments": [
              {
                "name": "srv",
                "optional": false,
                "type": "reference",
                "alias": "number | TServerInstance",
                "comments": "- server or port"
              },
              {
                "name": "opts",
                "optional": true,
                "type": "reference",
                "alias": "Partial<ServerOptions> | undefined",
                "comments": "- options passed to engine.io"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "attach": {
            "type": "function",
            "alias": "(srv: number | TServerInstance, opts?: Partial<ServerOptions> | undefined) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Attaches socket.io to a server or port.",
            "arguments": [
              {
                "name": "srv",
                "optional": false,
                "type": "reference",
                "alias": "number | TServerInstance",
                "comments": "- server or port"
              },
              {
                "name": "opts",
                "optional": true,
                "type": "reference",
                "alias": "Partial<ServerOptions> | undefined",
                "comments": "- options passed to engine.io"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "attachApp": {
            "type": "reference",
            "alias": "(app: any, opts?: Partial<ServerOptions> | undefined) => void",
            "optional": false
          },
          "initEngine": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false,
            "comments": "Initialize engine"
          },
          "attachServe": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false,
            "comments": "Attaches the static file serving."
          },
          "serve": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false,
            "comments": "Handles a request serving of client source and map"
          },
          "bind": {
            "type": "function",
            "alias": "(engine: any) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Binds socket.io to an engine.io instance.",
            "arguments": [
              {
                "name": "engine",
                "optional": false,
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "comments": "engine.io (or compatible) server"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "onconnection": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false,
            "comments": "Called with each incoming transport connection."
          },
          "of": {
            "type": "function",
            "alias": "(name: string | RegExp | ParentNspNameMatchFn, fn?: ((socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void) | undefined) => Namespace<...>",
            "comments": "Looks up a namespace.",
            "arguments": [
              {
                "name": "name",
                "optional": false,
                "type": "reference",
                "alias": "string | RegExp | ParentNspNameMatchFn",
                "comments": "- nsp name"
              },
              {
                "name": "fn",
                "optional": true,
                "type": "reference",
                "alias": "((socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void) | undefined",
                "comments": "optional, nsp `connection` ev handler"
              }
            ],
            "returnType": {
              "type": "object",
              "alias": "Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "A Namespace is a communication channel that allows you to split the logic of your application over a single shared\nconnection.\n\nEach namespace has its own:\n\n- event handlers\n\n```\nio.of(\"/orders\").on(\"connection\", (socket) => {\n  socket.on(\"order:list\", () => {});\n  socket.on(\"order:create\", () => {});\n});\n\nio.of(\"/users\").on(\"connection\", (socket) => {\n  socket.on(\"user:list\", () => {});\n});\n```\n\n- rooms\n\n```\nconst orderNamespace = io.of(\"/orders\");\n\norderNamespace.on(\"connection\", (socket) => {\n  socket.join(\"room1\");\n  orderNamespace.to(\"room1\").emit(\"hello\");\n});\n\nconst userNamespace = io.of(\"/users\");\n\nuserNamespace.on(\"connection\", (socket) => {\n  socket.join(\"room1\"); // distinct from the room in the \"orders\" namespace\n  userNamespace.to(\"room1\").emit(\"holà\");\n});\n```\n\n- middlewares\n\n```\nconst orderNamespace = io.of(\"/orders\");\n\norderNamespace.use((socket, next) => {\n  // ensure the socket has access to the \"orders\" namespace\n});\n\nconst userNamespace = io.of(\"/users\");\n\nuserNamespace.use((socket, next) => {\n  // ensure the socket has access to the \"users\" namespace\n});\n```",
              "properties": {
                "name": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false
                },
                "sockets": {
                  "type": "reference",
                  "alias": "Map<string, Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>>",
                  "comments": "A map of currently connected sockets.",
                  "optional": false
                },
                "_preConnectSockets": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": false,
                  "comments": "A map of currently connecting sockets."
                },
                "adapter": {
                  "type": "reference",
                  "alias": "Adapter",
                  "optional": false
                },
                "server": {
                  "type": "reference",
                  "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Represents a Socket.IO server.",
                  "optional": false
                },
                "_fns": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": false
                },
                "_ids": {
                  "type": "primitive",
                  "alias": "number",
                  "subType": "number",
                  "optional": false
                },
                "_initAdapter": {
                  "type": "reference",
                  "alias": "() => void",
                  "comments": "Initializes the `Adapter` for this nsp.\nRun upon changing adapter by `Server#adapter`\nin addition to the constructor.",
                  "optional": false
                },
                "use": {
                  "type": "reference",
                  "alias": "(fn: (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, next: (err?: ExtendedError | undefined) => void) => void) => Namespace<...>",
                  "comments": "Registers a middleware, which is a function that gets executed for every incoming  {@link  Socket } .",
                  "optional": false
                },
                "run": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": false,
                  "comments": "Executes the middleware for an incoming client."
                },
                "to": {
                  "type": "reference",
                  "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Targets a room when broadcasting.",
                  "optional": false
                },
                "in": {
                  "type": "reference",
                  "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Targets a room when broadcasting.",
                  "optional": false
                },
                "except": {
                  "type": "reference",
                  "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Targets a room when broadcasting.",
                  "optional": false
                },
                "_add": {
                  "type": "reference",
                  "alias": "(client: Client<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, auth: Record<string, unknown>, fn: (socket: Socket<...>) => void) => Promise<...>",
                  "comments": "Adds a new client.",
                  "optional": false
                },
                "_createSocket": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": false
                },
                "_doConnect": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": false
                },
                "_remove": {
                  "type": "reference",
                  "alias": "(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => void",
                  "comments": "Removes a socket. Called by each `Socket`.",
                  "optional": false
                },
                "emit": {
                  "type": "reference",
                  "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
                  "comments": "Emits to this client.",
                  "optional": false
                },
                "send": {
                  "type": "reference",
                  "alias": "(...args: any[]) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
                  "optional": false
                },
                "write": {
                  "type": "reference",
                  "alias": "(...args: any[]) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
                  "optional": false
                },
                "serverSideEmit": {
                  "type": "reference",
                  "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
                  "comments": "Emits to this client.",
                  "optional": false
                },
                "serverSideEmitWithAck": {
                  "type": "reference",
                  "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => Promise<any[]>",
                  "comments": "Sends a message and expect an acknowledgement from the other Socket.IO servers of the cluster.",
                  "optional": false
                },
                "_onServerSideEmit": {
                  "type": "reference",
                  "alias": "(args: [string, ...any[]]) => void",
                  "comments": "Called when a packet is received from another Socket.IO server",
                  "optional": false
                },
                "allSockets": {
                  "type": "reference",
                  "alias": "() => Promise<Set<string>>",
                  "comments": "Gets a list of clients.",
                  "optional": false
                },
                "compress": {
                  "type": "reference",
                  "alias": "(compress: boolean) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Sets the compress flag.",
                  "optional": false
                },
                "volatile": {
                  "type": "reference",
                  "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to\nreceive messages (because of network slowness or other issues, or because they’re connected through long polling\nand is in the middle of a request-response cycle).",
                  "optional": false
                },
                "local": {
                  "type": "reference",
                  "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
                  "comments": "Sets a modifier for a subsequent event emission that the event data will only be broadcast to the current node.",
                  "optional": false
                },
                "timeout": {
                  "type": "reference",
                  "alias": "(timeout: number) => BroadcastOperator<DecorateAcknowledgements<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>>, any>",
                  "comments": "Adds a timeout in milliseconds for the next operation",
                  "optional": false
                },
                "fetchSockets": {
                  "type": "reference",
                  "alias": "() => Promise<RemoteSocket<DefaultEventsMap, any>[]>",
                  "comments": "Returns the matching socket instances.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                  "optional": false
                },
                "socketsJoin": {
                  "type": "reference",
                  "alias": "(room: string | string[]) => void",
                  "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                  "optional": false
                },
                "socketsLeave": {
                  "type": "reference",
                  "alias": "(room: string | string[]) => void",
                  "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                  "optional": false
                },
                "disconnectSockets": {
                  "type": "reference",
                  "alias": "(close?: boolean | undefined) => void",
                  "comments": "Makes the matching socket instances disconnect.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
                  "optional": false
                },
                "on": {
                  "type": "reference",
                  "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Namespace<...>",
                  "comments": "Adds the `listener` function as an event listener for `ev`.",
                  "optional": false
                },
                "once": {
                  "type": "reference",
                  "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Namespace<...>",
                  "comments": "Adds the `listener` function as an event listener for `ev`.",
                  "optional": false
                },
                "emitReserved": {
                  "type": "reference",
                  "alias": "<Ev extends \"connection\" | \"connect\">(ev: Ev, ...args: Parameters<NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev]>) => boolean",
                  "comments": "Emits a reserved event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can emit its own reserved events.",
                  "optional": false
                },
                "emitUntyped": {
                  "type": "reference",
                  "alias": "(ev: string, ...args: any[]) => boolean",
                  "comments": "Emits an event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can get around the strict typing. This is useful for\ncalling `emit.apply`, which can be called as `emitUntyped.apply`.",
                  "optional": false
                },
                "listeners": {
                  "type": "reference",
                  "alias": "<Ev extends string>(event: Ev) => FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" ? NamespaceReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>[]",
                  "comments": "Returns the listeners listening to an event.",
                  "optional": false
                },
                "__@captureRejectionSymbol@1254": {
                  "type": "reference",
                  "alias": "(<K>(error: Error, event: string | symbol, ...args: AnyRest) => void) | undefined",
                  "optional": true
                },
                "addListener": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Alias for `emitter.on(eventName, listener)`.",
                  "optional": false
                },
                "removeListener": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Alias for `emitter.on(eventName, listener)`.",
                  "optional": false
                },
                "off": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Alias for `emitter.on(eventName, listener)`.",
                  "optional": false
                },
                "removeAllListeners": {
                  "type": "reference",
                  "alias": "(eventName?: string | symbol | undefined) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Removes all listeners, or those of the specified `eventName`.\n\nIt is bad practice to remove listeners added elsewhere in the code,\nparticularly when the `EventEmitter` instance was created by some other\ncomponent or module (e.g. sockets or file streams).\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
                  "optional": false
                },
                "setMaxListeners": {
                  "type": "reference",
                  "alias": "(n: number) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "By default `EventEmitter`s will print a warning if more than `10` listeners are\nadded for a particular event. This is a useful default that helps finding\nmemory leaks. The `emitter.setMaxListeners()` method allows the limit to be\nmodified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
                  "optional": false
                },
                "getMaxListeners": {
                  "type": "reference",
                  "alias": "() => number",
                  "comments": "Returns the current max listener value for the `EventEmitter` which is either\nset by `emitter.setMaxListeners(n)` or defaults to  {@link  defaultMaxListeners  } .",
                  "optional": false
                },
                "rawListeners": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol) => Function[]",
                  "comments": "Returns a copy of the array of listeners for the event named `eventName`.\n\n```js\nserver.on('connection', (stream) => {\n  console.log('someone connected!');\n});\nconsole.log(util.inspect(server.listeners('connection')));\n// Prints: [ [Function] ]\n```",
                  "optional": false
                },
                "listenerCount": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener?: Function | undefined) => number",
                  "comments": "Returns the number of listeners listening for the event named `eventName`.\nIf `listener` is provided, it will return how many times the listener is found\nin the list of the listeners of the event.",
                  "optional": false
                },
                "prependListener": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Alias for `emitter.on(eventName, listener)`.",
                  "optional": false
                },
                "prependOnceListener": {
                  "type": "reference",
                  "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
                  "comments": "Alias for `emitter.on(eventName, listener)`.",
                  "optional": false
                },
                "eventNames": {
                  "type": "reference",
                  "alias": "() => (string | symbol)[]",
                  "comments": "Returns an array listing the events for which the emitter has registered\nlisteners. The values in the array are strings or `Symbol`s.\n\n```js\nimport { EventEmitter } from 'node:events';\n\nconst myEE = new EventEmitter();\nmyEE.on('foo', () => {});\nmyEE.on('bar', () => {});\n\nconst sym = Symbol('symbol');\nmyEE.on(sym, () => {});\n\nconsole.log(myEE.eventNames());\n// Prints: [ 'foo', 'bar', Symbol(symbol) ]\n```",
                  "optional": false
                }
              }
            },
            "optional": false
          },
          "close": {
            "type": "reference",
            "alias": "(fn?: ((err?: Error | undefined) => void) | undefined) => Promise<void>",
            "comments": "Closes server connection",
            "optional": false
          },
          "use": {
            "type": "function",
            "alias": "(fn: (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, next: (err?: ExtendedError | undefined) => void) => void) => Server<...>",
            "comments": "Registers a middleware, which is a function that gets executed for every incoming  {@link  Socket } .",
            "arguments": [
              {
                "name": "fn",
                "optional": false,
                "type": "reference",
                "alias": "(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, next: (err?: ExtendedError | undefined) => void) => void",
                "comments": "- the middleware function"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "to": {
            "type": "reference",
            "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Targets a room when broadcasting.",
            "optional": false
          },
          "in": {
            "type": "reference",
            "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Targets a room when broadcasting.",
            "optional": false
          },
          "except": {
            "type": "reference",
            "alias": "(room: string | string[]) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Targets a room when broadcasting.",
            "optional": false
          },
          "send": {
            "type": "function",
            "alias": "(...args: any[]) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
            "arguments": [
              {
                "name": "args",
                "optional": false,
                "type": "reference",
                "alias": "any[]",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "write": {
            "type": "function",
            "alias": "(...args: any[]) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Sends a `message` event to all clients.\n\nThis method mimics the WebSocket.send() method.",
            "arguments": [
              {
                "name": "args",
                "optional": false,
                "type": "reference",
                "alias": "any[]",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "serverSideEmit": {
            "type": "reference",
            "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
            "comments": "Emits to this client.",
            "optional": false
          },
          "serverSideEmitWithAck": {
            "type": "reference",
            "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => Promise<any[]>",
            "comments": "Sends a message and expect an acknowledgement from the other Socket.IO servers of the cluster.",
            "optional": false
          },
          "allSockets": {
            "type": "reference",
            "alias": "() => Promise<Set<string>>",
            "comments": "Gets a list of clients.",
            "optional": false
          },
          "compress": {
            "type": "reference",
            "alias": "(compress: boolean) => BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Sets the compress flag.",
            "optional": false
          },
          "volatile": {
            "type": "reference",
            "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Sets a modifier for a subsequent event emission that the event data may be lost if the client is not ready to\nreceive messages (because of network slowness or other issues, or because they’re connected through long polling\nand is in the middle of a request-response cycle).",
            "optional": false
          },
          "local": {
            "type": "reference",
            "alias": "BroadcastOperator<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>, any>",
            "comments": "Sets a modifier for a subsequent event emission that the event data will only be broadcast to the current node.",
            "optional": false
          },
          "timeout": {
            "type": "reference",
            "alias": "(timeout: number) => BroadcastOperator<DecorateAcknowledgements<DecorateAcknowledgementsWithMultipleResponses<DefaultEventsMap>>, any>",
            "comments": "Adds a timeout in milliseconds for the next operation",
            "optional": false
          },
          "fetchSockets": {
            "type": "reference",
            "alias": "() => Promise<RemoteSocket<DefaultEventsMap, any>[]>",
            "comments": "Returns the matching socket instances.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
            "optional": false
          },
          "socketsJoin": {
            "type": "reference",
            "alias": "(room: string | string[]) => void",
            "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
            "optional": false
          },
          "socketsLeave": {
            "type": "reference",
            "alias": "(room: string | string[]) => void",
            "comments": "Makes the matching socket instances join the specified rooms.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
            "optional": false
          },
          "disconnectSockets": {
            "type": "reference",
            "alias": "(close?: boolean | undefined) => void",
            "comments": "Makes the matching socket instances disconnect.\n\nNote: this method also works within a cluster of multiple Socket.IO servers, with a compatible  {@link  Adapter } .",
            "optional": false
          },
          "on": {
            "type": "function",
            "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Server<...>",
            "comments": "Adds the `listener` function as an event listener for `ev`.",
            "arguments": [
              {
                "name": "ev",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "Name of the event"
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>",
                "aliasSymbolescapedName": "FallbackToUntypedListener",
                "comments": "Returns an untyped listener type if `T` is `never`; otherwise, returns `T`.\n\nThis is a hack to mitigate https://github.com/socketio/socket.io/issues/3833.\nNeeded because of https://github.com/microsoft/TypeScript/issues/41778"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "once": {
            "type": "function",
            "alias": "<Ev extends string>(ev: Ev, listener: FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>) => Server<...>",
            "comments": "Adds the `listener` function as an event listener for `ev`.",
            "arguments": [
              {
                "name": "ev",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "Name of the event"
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>",
                "aliasSymbolescapedName": "FallbackToUntypedListener",
                "comments": "Returns an untyped listener type if `T` is `never`; otherwise, returns `T`.\n\nThis is a hack to mitigate https://github.com/socketio/socket.io/issues/3833.\nNeeded because of https://github.com/microsoft/TypeScript/issues/41778"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "emit": {
            "type": "reference",
            "alias": "<Ev extends string>(ev: Ev, ...args: any[]) => boolean",
            "comments": "Emits to this client.",
            "optional": false
          },
          "emitReserved": {
            "type": "function",
            "alias": "<Ev extends \"connection\" | \"connect\" | \"new_namespace\">(ev: Ev, ...args: Parameters<ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev]>) => boolean",
            "comments": "Emits a reserved event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can emit its own reserved events.",
            "arguments": [
              {
                "name": "ev",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "Reserved event name"
              },
              {
                "name": "args",
                "optional": false,
                "type": "primitive",
                "alias": "Parameters<ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev]>",
                "aliasSymbolescapedName": "Parameters",
                "comments": "Obtain the parameters of a function type in a tuple",
                "subType": "any"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "boolean"
            },
            "optional": false
          },
          "emitUntyped": {
            "type": "reference",
            "alias": "(ev: string, ...args: any[]) => boolean",
            "comments": "Emits an event.\n\nThis method is `protected`, so that only a class extending\n`StrictEventEmitter` can get around the strict typing. This is useful for\ncalling `emit.apply`, which can be called as `emitUntyped.apply`.",
            "optional": false
          },
          "listeners": {
            "type": "function",
            "alias": "<Ev extends string>(event: Ev) => FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>[]",
            "comments": "Returns the listeners listening to an event.",
            "arguments": [
              {
                "name": "event",
                "optional": false,
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "comments": "Event name"
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "FallbackToUntypedListener<Ev extends \"connection\" | \"connect\" | \"new_namespace\" ? ServerReservedEventsMap<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>[Ev] : Ev extends string ? (...args: any[]) => void : never>[]"
            },
            "optional": false
          },
          "__@captureRejectionSymbol@1254": {
            "type": "reference",
            "alias": "(<K>(error: Error, event: string | symbol, ...args: AnyRest) => void) | undefined",
            "optional": true
          },
          "addListener": {
            "type": "function",
            "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Alias for `emitter.on(eventName, listener)`.",
            "arguments": [
              {
                "name": "eventName",
                "optional": false,
                "type": "reference",
                "alias": "string | symbol",
                "comments": ""
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "(...args: any[]) => void",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "removeListener": {
            "type": "function",
            "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Alias for `emitter.on(eventName, listener)`.",
            "arguments": [
              {
                "name": "eventName",
                "optional": false,
                "type": "reference",
                "alias": "string | symbol",
                "comments": ""
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "(...args: any[]) => void",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "off": {
            "type": "function",
            "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Alias for `emitter.on(eventName, listener)`.",
            "arguments": [
              {
                "name": "eventName",
                "optional": false,
                "type": "reference",
                "alias": "string | symbol",
                "comments": ""
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "(...args: any[]) => void",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "removeAllListeners": {
            "type": "function",
            "alias": "(eventName?: string | symbol | undefined) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Removes all listeners, or those of the specified `eventName`.\n\nIt is bad practice to remove listeners added elsewhere in the code,\nparticularly when the `EventEmitter` instance was created by some other\ncomponent or module (e.g. sockets or file streams).\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
            "arguments": [
              {
                "name": "eventName",
                "optional": true,
                "type": "reference",
                "alias": "string | symbol | undefined",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "setMaxListeners": {
            "type": "function",
            "alias": "(n: number) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "By default `EventEmitter`s will print a warning if more than `10` listeners are\nadded for a particular event. This is a useful default that helps finding\nmemory leaks. The `emitter.setMaxListeners()` method allows the limit to be\nmodified for this specific `EventEmitter` instance. The value can be set to `Infinity` (or `0`) to indicate an unlimited number of listeners.\n\nReturns a reference to the `EventEmitter`, so that calls can be chained.",
            "arguments": [
              {
                "name": "n",
                "optional": false,
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "getMaxListeners": {
            "type": "reference",
            "alias": "() => number",
            "comments": "Returns the current max listener value for the `EventEmitter` which is either\nset by `emitter.setMaxListeners(n)` or defaults to  {@link  defaultMaxListeners  } .",
            "optional": false
          },
          "rawListeners": {
            "type": "reference",
            "alias": "<K>(eventName: string | symbol) => Function[]",
            "comments": "Returns a copy of the array of listeners for the event named `eventName`.\n\n```js\nserver.on('connection', (stream) => {\n  console.log('someone connected!');\n});\nconsole.log(util.inspect(server.listeners('connection')));\n// Prints: [ [Function] ]\n```",
            "optional": false
          },
          "listenerCount": {
            "type": "reference",
            "alias": "<K>(eventName: string | symbol, listener?: Function | undefined) => number",
            "comments": "Returns the number of listeners listening for the event named `eventName`.\nIf `listener` is provided, it will return how many times the listener is found\nin the list of the listeners of the event.",
            "optional": false
          },
          "prependListener": {
            "type": "function",
            "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Alias for `emitter.on(eventName, listener)`.",
            "arguments": [
              {
                "name": "eventName",
                "optional": false,
                "type": "reference",
                "alias": "string | symbol",
                "comments": ""
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "(...args: any[]) => void",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "prependOnceListener": {
            "type": "function",
            "alias": "<K>(eventName: string | symbol, listener: (...args: any[]) => void) => Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
            "comments": "Alias for `emitter.on(eventName, listener)`.",
            "arguments": [
              {
                "name": "eventName",
                "optional": false,
                "type": "reference",
                "alias": "string | symbol",
                "comments": ""
              },
              {
                "name": "listener",
                "optional": false,
                "type": "reference",
                "alias": "(...args: any[]) => void",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
              "comments": "Represents a Socket.IO server."
            },
            "optional": false
          },
          "eventNames": {
            "type": "reference",
            "alias": "() => (string | symbol)[]",
            "comments": "Returns an array listing the events for which the emitter has registered\nlisteners. The values in the array are strings or `Symbol`s.\n\n```js\nimport { EventEmitter } from 'node:events';\n\nconst myEE = new EventEmitter();\nmyEE.on('foo', () => {});\nmyEE.on('bar', () => {});\n\nconst sym = Symbol('symbol');\nmyEE.on(sym, () => {});\n\nconsole.log(myEE.eventNames());\n// Prints: [ 'foo', 'bar', Symbol(symbol) ]\n```",
            "optional": false
          }
        },
        "optional": true
      },
      "publish": {
        "type": "union",
        "alias": "Publish<S, SUser> | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "primitive",
            "alias": "null",
            "subType": "null"
          },
          {
            "type": "reference",
            "alias": "\"*\""
          },
          {
            "type": "primitive",
            "alias": "PublishFullyTyped<S>",
            "aliasSymbolescapedName": "PublishFullyTyped",
            "subType": "any"
          },
          {
            "type": "function",
            "alias": "(params: PublishParams<S, SUser>) => Awaitable<PublishedResult<S>>",
            "arguments": [
              {
                "name": "params",
                "optional": false,
                "type": "object",
                "alias": "PublishParams<S, SUser>",
                "aliasSymbolescapedName": "PublishParams",
                "comments": "",
                "properties": {
                  "sid": {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string",
                    "optional": true
                  },
                  "dbo": {
                    "type": "reference",
                    "alias": "DBOFullyTyped<S>",
                    "aliasSymbolescapedName": "DBOFullyTyped",
                    "optional": false
                  },
                  "db": {
                    "type": "reference",
                    "alias": "DB",
                    "aliasSymbolescapedName": "DB",
                    "optional": false
                  },
                  "user": {
                    "type": "reference",
                    "alias": "SUser[\"user\"] | undefined",
                    "optional": true
                  },
                  "socket": {
                    "type": "reference",
                    "alias": "PRGLIOSocket",
                    "aliasSymbolescapedName": "PRGLIOSocket",
                    "optional": false
                  },
                  "tables": {
                    "type": "reference",
                    "alias": "DbTableInfo[]",
                    "optional": false
                  }
                }
              }
            ],
            "returnType": {
              "type": "union",
              "alias": "Awaitable<PublishedResult<S>>",
              "aliasSymbolescapedName": "Awaitable",
              "types": [
                {
                  "type": "primitive",
                  "alias": "null",
                  "subType": "null"
                },
                {
                  "type": "reference",
                  "alias": "\"*\""
                },
                {
                  "type": "primitive",
                  "alias": "PublishFullyTyped<S>",
                  "aliasSymbolescapedName": "PublishFullyTyped",
                  "subType": "any"
                },
                {
                  "type": "reference",
                  "alias": "Promise<PublishedResult<S>>",
                  "comments": "Represents the completion of an asynchronous operation"
                },
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ]
            }
          },
          {
            "type": "primitive",
            "alias": "false",
            "subType": "boolean"
          }
        ],
        "optional": true,
        "comments": "Data access rules applied to clients.\nBy default, nothing is allowed."
      },
      "testRulesOnConnect": {
        "type": "reference",
        "alias": "boolean | undefined",
        "comments": "If true then will test all table methods on each socket connect.\nNot recommended for production",
        "optional": true
      },
      "publishMethods": {
        "type": "function",
        "alias": "PublishMethods<S, SUser>",
        "aliasSymbolescapedName": "PublishMethods",
        "arguments": [
          {
            "name": "params",
            "optional": false,
            "type": "object",
            "alias": "PublishParams<S, SUser>",
            "aliasSymbolescapedName": "PublishParams",
            "comments": "",
            "properties": {
              "sid": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "dbo": {
                "type": "reference",
                "alias": "DBOFullyTyped<S>",
                "aliasSymbolescapedName": "DBOFullyTyped",
                "optional": false
              },
              "db": {
                "type": "reference",
                "alias": "DB",
                "aliasSymbolescapedName": "DB",
                "optional": false
              },
              "user": {
                "type": "reference",
                "alias": "SUser[\"user\"] | undefined",
                "optional": true
              },
              "socket": {
                "type": "reference",
                "alias": "PRGLIOSocket",
                "aliasSymbolescapedName": "PRGLIOSocket",
                "optional": false
              },
              "tables": {
                "type": "reference",
                "alias": "DbTableInfo[]",
                "optional": false
              }
            }
          }
        ],
        "returnType": {
          "type": "union",
          "alias": "{ [key: string]: Method; } | Promise<{ [key: string]: Method; } | null>",
          "types": [
            {
              "type": "reference",
              "alias": "{ [key: string]: Method; }"
            },
            {
              "type": "reference",
              "alias": "Promise<{ [key: string]: Method; } | null>",
              "comments": "Represents the completion of an asynchronous operation"
            }
          ]
        },
        "optional": true,
        "comments": "Custom methods that can be called from the client"
      },
      "publishRawSQL": {
        "type": "function",
        "alias": "(params: PublishParams<S, SUser>) => boolean | \"*\" | Promise<boolean | \"*\">",
        "comments": "If defined and resolves to true then the connected client can run SQL queries",
        "arguments": [
          {
            "name": "params",
            "optional": false,
            "type": "object",
            "alias": "PublishParams<S, SUser>",
            "aliasSymbolescapedName": "PublishParams",
            "comments": "",
            "properties": {
              "sid": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true
              },
              "dbo": {
                "type": "reference",
                "alias": "DBOFullyTyped<S>",
                "aliasSymbolescapedName": "DBOFullyTyped",
                "optional": false
              },
              "db": {
                "type": "reference",
                "alias": "DB",
                "aliasSymbolescapedName": "DB",
                "optional": false
              },
              "user": {
                "type": "reference",
                "alias": "SUser[\"user\"] | undefined",
                "optional": true
              },
              "socket": {
                "type": "reference",
                "alias": "PRGLIOSocket",
                "aliasSymbolescapedName": "PRGLIOSocket",
                "optional": false
              },
              "tables": {
                "type": "reference",
                "alias": "DbTableInfo[]",
                "optional": false
              }
            }
          }
        ],
        "returnType": {
          "type": "union",
          "alias": "boolean | \"*\" | Promise<boolean | \"*\">",
          "types": [
            {
              "type": "reference",
              "alias": "\"*\""
            },
            {
              "type": "reference",
              "alias": "Promise<boolean | \"*\">",
              "comments": "Represents the completion of an asynchronous operation"
            },
            {
              "type": "primitive",
              "alias": "false",
              "subType": "boolean"
            }
          ]
        },
        "optional": true
      },
      "joins": {
        "type": "union",
        "alias": "Joins | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "array",
            "alias": "Join[]",
            "itemType": {
              "type": "object",
              "alias": "Join",
              "aliasSymbolescapedName": "Join",
              "comments": "",
              "properties": {
                "tables": {
                  "type": "reference",
                  "alias": "[string, string]",
                  "optional": false
                },
                "on": {
                  "type": "reference",
                  "alias": "{ [key: string]: string; }[]",
                  "optional": false
                },
                "type": {
                  "type": "reference",
                  "alias": "\"one-many\" | \"many-one\" | \"one-one\" | \"many-many\"",
                  "optional": false
                }
              }
            }
          },
          {
            "type": "literal",
            "alias": "\"inferred\"",
            "value": "inferred"
          }
        ],
        "optional": true,
        "comments": "Allows defining joins between tables:\n - `infered` - uses the foreign keys to infer the joins\n - `Join[]` - specifies the joins manually"
      },
      "schema": {
        "type": "union",
        "alias": "Record<string, 1> | Record<string, 0> | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "object",
            "alias": "Record<string, 1>",
            "aliasSymbolescapedName": "Record",
            "comments": "Construct a type with a set of properties K of type T",
            "properties": {}
          },
          {
            "type": "object",
            "alias": "Record<string, 0>",
            "aliasSymbolescapedName": "Record",
            "comments": "Construct a type with a set of properties K of type T",
            "properties": {}
          }
        ],
        "optional": true,
        "comments": "If defined then the specified schemas are included/excluded from the prostgles schema.\nBy default the `public` schema is included."
      },
      "sqlFilePath": {
        "type": "primitive",
        "alias": "string",
        "subType": "string",
        "optional": true,
        "comments": "Path to a SQL file that will be executed on startup (but before onReady)"
      },
      "transactions": {
        "type": "union",
        "alias": "string | boolean | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "primitive",
            "alias": "string",
            "subType": "string"
          },
          {
            "type": "primitive",
            "alias": "false",
            "subType": "boolean"
          }
        ],
        "optional": true
      },
      "wsChannelNamePrefix": {
        "type": "primitive",
        "alias": "string",
        "subType": "string",
        "optional": true
      },
      "onSocketConnect": {
        "type": "function",
        "alias": "(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>",
        "arguments": [
          {
            "name": "args",
            "optional": false,
            "type": "union",
            "alias": "AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }",
            "types": [
              {
                "type": "reference",
                "alias": "AuthRequestParams<S, SUser>",
                "aliasSymbolescapedName": "AuthRequestParams",
                "comments": ""
              },
              {
                "type": "reference",
                "alias": "{ socket: PRGLIOSocket; }"
              }
            ],
            "comments": ""
          }
        ],
        "returnType": {
          "type": "reference",
          "alias": "void | Promise<void>"
        },
        "optional": true,
        "comments": "Called when a socket connects\nUse for connection verification. Will disconnect socket on any errors"
      },
      "onSocketDisconnect": {
        "type": "function",
        "alias": "(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>",
        "arguments": [
          {
            "name": "args",
            "optional": false,
            "type": "union",
            "alias": "AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }",
            "types": [
              {
                "type": "reference",
                "alias": "AuthRequestParams<S, SUser>",
                "aliasSymbolescapedName": "AuthRequestParams",
                "comments": ""
              },
              {
                "type": "reference",
                "alias": "{ socket: PRGLIOSocket; }"
              }
            ],
            "comments": ""
          }
        ],
        "returnType": {
          "type": "reference",
          "alias": "void | Promise<void>"
        },
        "optional": true,
        "comments": "Called when a socket disconnects"
      },
      "auth": {
        "type": "object",
        "alias": "Auth<S, SUser>",
        "aliasSymbolescapedName": "Auth",
        "comments": "Auth configuration.\nSupports email and OAuth strategies",
        "properties": {
          "sidKeyName": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": true,
            "comments": "Name of the cookie or socket hadnshake query param that represents the session id.\nDefaults to \"session_id\""
          },
          "responseThrottle": {
            "type": "primitive",
            "alias": "number",
            "subType": "number",
            "optional": true,
            "comments": "Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds"
          },
          "expressConfig": {
            "type": "reference",
            "alias": "{ app: Express; cookieOptions?: AnyObject | undefined; disableSocketAuthGuard?: boolean | undefined; publicRoutes?: string[] | undefined; use?: ((args: { req: ExpressReq; res: ExpressRes; next: NextFunction; } & AuthRequestParams<...>) => void | Promise<...>) | undefined; onGetRequestOK?: ((req: ExpressReq, res: Exp...",
            "comments": "Will setup auth routes\n /login\n /logout\n /magic-link/:id",
            "optional": true
          },
          "getUser": {
            "type": "function",
            "alias": "(sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB, client: AuthClientRequest & LoginClientInfo) => Awaitable<AuthResult<...>>",
            "arguments": [
              {
                "name": "sid",
                "optional": false,
                "type": "union",
                "alias": "string | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string"
                  }
                ],
                "comments": ""
              },
              {
                "name": "dbo",
                "optional": false,
                "type": "reference",
                "alias": "DBOFullyTyped<S>",
                "aliasSymbolescapedName": "DBOFullyTyped",
                "comments": ""
              },
              {
                "name": "db",
                "optional": false,
                "type": "reference",
                "alias": "DB",
                "aliasSymbolescapedName": "DB",
                "comments": ""
              },
              {
                "name": "client",
                "optional": false,
                "type": "reference",
                "alias": "AuthClientRequest & LoginClientInfo",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "reference",
              "alias": "Awaitable<AuthResult<SUser>>",
              "aliasSymbolescapedName": "Awaitable"
            },
            "optional": false,
            "comments": "undefined sid is allowed to enable public users"
          },
          "login": {
            "type": "reference",
            "alias": "(params: LoginParams, dbo: DBOFullyTyped<S>, db: DB, client: LoginClientInfo) => Awaitable<BasicSession>",
            "optional": true
          },
          "logout": {
            "type": "reference",
            "alias": "(sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => any",
            "optional": true
          },
          "cacheSession": {
            "type": "reference",
            "alias": "{ getSession: (sid: string | undefined, dbo: DBOFullyTyped<S>, db: DB) => Awaitable<BasicSession>; }",
            "comments": "If provided then session info will be saved on socket.__prglCache and reused from there",
            "optional": true
          }
        },
        "optional": true
      },
      "DEBUG_MODE": {
        "type": "reference",
        "alias": "boolean | undefined",
        "optional": true
      },
      "onQuery": {
        "type": "function",
        "alias": "(error: any, ctx: IEventContext<IClient>) => void",
        "arguments": [
          {
            "name": "error",
            "optional": false,
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "comments": ""
          },
          {
            "name": "ctx",
            "optional": false,
            "type": "reference",
            "alias": "IEventContext<IClient>",
            "comments": ""
          }
        ],
        "returnType": {
          "type": "primitive",
          "alias": "void",
          "subType": "any"
        },
        "optional": true,
        "comments": "Callback called when a query is executed.\nUseful for logging or debugging"
      },
      "watchSchemaType": {
        "type": "union",
        "alias": "\"DDL_trigger\" | \"prostgles_queries\" | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "literal",
            "alias": "\"DDL_trigger\"",
            "value": "DDL_trigger"
          },
          {
            "type": "literal",
            "alias": "\"prostgles_queries\"",
            "value": "prostgles_queries"
          }
        ],
        "optional": true
      },
      "watchSchema": {
        "type": "union",
        "alias": "boolean | EventTriggerTagFilter | \"hotReloadMode\" | OnSchemaChangeCallback | undefined",
        "types": [
          {
            "type": "primitive",
            "alias": "undefined",
            "subType": "undefined"
          },
          {
            "type": "reference",
            "alias": "\"*\""
          },
          {
            "type": "object",
            "alias": "Partial<Record<\"ALTER AGGREGATE\" | \"ALTER COLLATION\" | \"ALTER CONVERSION\" | \"ALTER DOMAIN\" | \"ALTER DEFAULT PRIVILEGES\" | \"ALTER EXTENSION\" | \"ALTER FOREIGN DATA WRAPPER\" | \"ALTER FOREIGN TABLE\" | ... 102 more ... | \"SELECT INTO\", 1>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "properties": {
              "ALTER AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER DEFAULT PRIVILEGES": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER LARGE OBJECT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER ROUTINE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "COMMENT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE ACCESS METHOD": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE CAST": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE INDEX": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE RULE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TABLE AS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP ACCESS METHOD": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP CAST": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP INDEX": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OWNED": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP ROUTINE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP RULE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "GRANT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "IMPORT FOREIGN SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "REFRESH MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "REVOKE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "SECURITY LABEL": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "SELECT INTO": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              }
            }
          },
          {
            "type": "object",
            "alias": "Partial<Record<\"ALTER AGGREGATE\" | \"ALTER COLLATION\" | \"ALTER CONVERSION\" | \"ALTER DOMAIN\" | \"ALTER DEFAULT PRIVILEGES\" | \"ALTER EXTENSION\" | \"ALTER FOREIGN DATA WRAPPER\" | \"ALTER FOREIGN TABLE\" | ... 102 more ... | \"SELECT INTO\", 0>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "properties": {
              "ALTER AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER DEFAULT PRIVILEGES": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER LARGE OBJECT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER ROUTINE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "ALTER VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "COMMENT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE ACCESS METHOD": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE CAST": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE INDEX": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE RULE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TABLE AS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "CREATE VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP ACCESS METHOD": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP AGGREGATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP CAST": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP COLLATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP CONVERSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP DOMAIN": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP EXTENSION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FOREIGN DATA WRAPPER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FOREIGN TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP FUNCTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP INDEX": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP LANGUAGE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR CLASS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OPERATOR FAMILY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP OWNED": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP POLICY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP PROCEDURE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP PUBLICATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP ROUTINE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP RULE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SEQUENCE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SERVER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP STATISTICS": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP SUBSCRIPTION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TABLE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH CONFIGURATION": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH DICTIONARY": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH PARSER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TEXT SEARCH TEMPLATE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TRIGGER": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP TYPE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP USER MAPPING": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "DROP VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "GRANT": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "IMPORT FOREIGN SCHEMA": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "REFRESH MATERIALIZED VIEW": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "REVOKE": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "SECURITY LABEL": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              },
              "SELECT INTO": {
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "optional": true
              }
            }
          },
          {
            "type": "literal",
            "alias": "\"hotReloadMode\"",
            "value": "hotReloadMode"
          },
          {
            "type": "function",
            "alias": "OnSchemaChangeCallback",
            "aliasSymbolescapedName": "OnSchemaChangeCallback",
            "arguments": [
              {
                "name": "event",
                "optional": false,
                "type": "object",
                "alias": "{ command: string; query: string; }",
                "comments": "",
                "properties": {
                  "command": {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string",
                    "optional": false
                  },
                  "query": {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string",
                    "optional": false
                  }
                }
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            }
          },
          {
            "type": "primitive",
            "alias": "false",
            "subType": "boolean"
          }
        ],
        "optional": true,
        "comments": "If truthy then DBGeneratedSchema.d.ts will be updated\nand \"onReady\" will be called with new schema on both client and server"
      },
      "keywords": {
        "type": "object",
        "alias": "Keywords",
        "aliasSymbolescapedName": "Keywords",
        "properties": {
          "$and": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": false
          },
          "$or": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": false
          },
          "$not": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": false
          }
        },
        "optional": true
      },
      "onNotice": {
        "type": "function",
        "alias": "(notice: AnyObject, message?: string | undefined) => void",
        "arguments": [
          {
            "name": "notice",
            "optional": false,
            "type": "reference",
            "alias": "AnyObject",
            "aliasSymbolescapedName": "AnyObject",
            "comments": ""
          },
          {
            "name": "message",
            "optional": true,
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "comments": ""
          }
        ],
        "returnType": {
          "type": "primitive",
          "alias": "void",
          "subType": "any"
        },
        "optional": true
      },
      "fileTable": {
        "type": "reference",
        "alias": "FileTableConfig | undefined",
        "comments": "Enables file storage and serving.\nCurrently supports saving files locally or to AWS S3",
        "optional": true
      },
      "restApi": {
        "type": "object",
        "alias": "RestApiConfig",
        "aliasSymbolescapedName": "RestApiConfig",
        "comments": "Rest API configuration.\nThe REST API allows interacting with the database similarly to the socket connection\nwith the exception of subscriptions and realtime features",
        "properties": {
          "expressApp": {
            "type": "function",
            "alias": "Express",
            "arguments": [
              {
                "name": "req",
                "optional": false,
                "type": "reference",
                "alias": "IncomingMessage | Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>",
                "comments": ""
              },
              {
                "name": "res",
                "optional": false,
                "type": "reference",
                "alias": "ServerResponse<IncomingMessage> | Response<any, Record<string, any>, number>",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "any",
              "subType": "any"
            },
            "optional": false
          },
          "routePrefix": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": false
          }
        },
        "optional": true
      },
      "tableConfig": {
        "type": "object",
        "alias": "TableConfig",
        "aliasSymbolescapedName": "TableConfig",
        "comments": "A simple way of defining tables through a JSON-schema like object.\nAllowes adding runtime JSONB validation and type safety.\nShould be used with caution because it tends to revert any changes\nmade to the database schema through SQL queries",
        "properties": {},
        "optional": true
      },
      "tableConfigMigrations": {
        "type": "object",
        "alias": "{ silentFail?: boolean | undefined; version: number; versionTableName?: string | undefined; onMigrate: (args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: (\"c\" | ... 2 more ... | \"f\")[] | undefined) => Promise<...>; }) => void; }",
        "properties": {
          "silentFail": {
            "type": "reference",
            "alias": "boolean | undefined",
            "comments": "If false then prostgles won't start on any tableConfig error\ntrue by default",
            "optional": true
          },
          "version": {
            "type": "primitive",
            "alias": "number",
            "subType": "number",
            "optional": false
          },
          "versionTableName": {
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "optional": true,
            "comments": "Table that will contain the schema version number and the tableConfig\nDefaults to schema_version"
          },
          "onMigrate": {
            "type": "function",
            "alias": "(args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: (\"c\" | \"p\" | \"u\" | \"f\")[] | undefined) => Promise<ColConstraint[]>; }) => void",
            "arguments": [
              {
                "name": "args",
                "optional": false,
                "type": "reference",
                "alias": "{ db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: (\"c\" | \"p\" | \"u\" | \"f\")[] | undefined) => Promise<ColConstraint[]>; }",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "optional": false,
            "comments": "Script run before tableConfig is loaded IF an older schema_version is present"
          }
        },
        "optional": true
      },
      "onLog": {
        "type": "function",
        "alias": "(evt: EventInfo) => Promise<void>",
        "arguments": [
          {
            "name": "evt",
            "optional": false,
            "type": "union",
            "alias": "EventInfo",
            "aliasSymbolescapedName": "EventInfo",
            "types": [
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"auth\"; } & { command: \"getClientInfo\"; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"auth\"; } & { command: \"login\"; }"
              },
              {
                "type": "reference",
                "alias": "Table",
                "aliasSymbolescapedName": "Table"
              },
              {
                "type": "reference",
                "alias": "Method",
                "aliasSymbolescapedName": "Method"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"sync\"; tableName: string; localParams?: LocalParams | undefined; connectedSocketIds: string[]; } & { command: \"syncData\"; source: \"client\" | \"trigger\"; connectedSocketIds: string[]; lr: string; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"sync\"; tableName: string; localParams?: LocalParams | undefined; connectedSocketIds: string[]; } & { command: \"upsertData\" | \"pushData\"; rows: number; socketId: string; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"sync\"; tableName: string; localParams?: LocalParams | undefined; connectedSocketIds: string[]; } & { command: \"addTrigger\"; state: \"ok\" | \"fail\"; socketId: string | undefined; condition: string; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"sync\"; tableName: string; localParams?: LocalParams | undefined; connectedSocketIds: string[]; } & { command: \"unsync\" | \"addSync\"; socketId: string; condition: string; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"sync\"; tableName: string; localParams?: LocalParams | undefined; connectedSocketIds: string[]; } & { command: \"upsertSocket.disconnect\"; socketId: string; remainingSyncs: string; remainingSubs: string; connectedSocketIds: string[]; }"
              },
              {
                "type": "reference",
                "alias": "SyncMultiClient",
                "aliasSymbolescapedName": "SyncMultiClient"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & { type: \"connect\" | \"disconnect\"; socketId: string; connectedSocketIds: string[]; }"
              },
              {
                "type": "reference",
                "alias": "ClientInfo & DebugInfo & { type: \"connect.getClientSchema\"; }"
              },
              {
                "type": "reference",
                "alias": "DebugInfo & { type: \"debug\"; command: \"initFileTable\" | \"initTableConfig\" | \"runSQLFile\" | \"schemaChangeNotif\" | \"TableConfig.runQueries.start\" | \"TableConfig.runQueries.end\" | ... 8 more ... | \"PubSubManager.create\"; data?: AnyObject | undefined; }"
              },
              {
                "type": "reference",
                "alias": "DebugInfo & { type: \"debug\"; command: \"pushSocketSchema\"; data: { socketId: string; clientSchema: ClientSchema; }; }"
              }
            ],
            "comments": ""
          }
        ],
        "returnType": {
          "type": "reference",
          "alias": "Promise<void>",
          "comments": "Represents the completion of an asynchronous operation"
        },
        "optional": true,
        "comments": "Usefull for logging or debugging"
      }
    }
  }
] as const satisfies TS_Type[];