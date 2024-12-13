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
            "type": "reference",
            "alias": "IConnectionParameters<IClient>"
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
            "type": "reference",
            "alias": "OnReadyParams<S>",
            "aliasSymbolescapedName": "OnReadyParams",
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
        "type": "reference",
        "alias": "string | undefined",
        "comments": "If defined then a `DBGeneratedSchema.d.ts` file will be created in the provided directory.\nThis file exports a `DBGeneratedSchema` type which contains types for the database tables and\ncan be used as a generic type input for the prostgles instances to ensure type safety",
        "optional": true
      },
      "disableRealtime": {
        "type": "reference",
        "alias": "boolean | undefined",
        "comments": "If true then schema watch, subscriptions and syncs will be disabled.\nNo `prostgles` schema will be created which is needed for the realtime features.\nThis is useful when you want to connect to a database and prevent any changes to the schema",
        "optional": true
      },
      "io": {
        "type": "reference",
        "alias": "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
        "comments": "Socket.IO server instance object",
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
            "type": "reference",
            "alias": "(params: PublishParams<S, SUser>) => Awaitable<PublishedResult<S>>"
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
        "type": "reference",
        "alias": "PublishMethods<S, SUser>",
        "aliasSymbolescapedName": "PublishMethods",
        "comments": "Custom methods that can be called from the client",
        "optional": true
      },
      "publishRawSQL": {
        "type": "reference",
        "alias": "(params: PublishParams<S, SUser>) => boolean | \"*\" | Promise<boolean | \"*\">",
        "comments": "If defined and resolves to true then the connected client can run SQL queries",
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
            "type": "reference",
            "alias": "Join[]"
          },
          {
            "type": "reference",
            "alias": "\"inferred\""
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
            "type": "reference",
            "alias": "Record<string, 1>",
            "aliasSymbolescapedName": "Record",
            "comments": "Construct a type with a set of properties K of type T"
          },
          {
            "type": "reference",
            "alias": "Record<string, 0>",
            "aliasSymbolescapedName": "Record",
            "comments": "Construct a type with a set of properties K of type T"
          }
        ],
        "optional": true,
        "comments": "If defined then the specified schemas are included/excluded from the prostgles schema.\nBy default the `public` schema is included."
      },
      "sqlFilePath": {
        "type": "reference",
        "alias": "string | undefined",
        "comments": "Path to a SQL file that will be executed on startup (but before onReady)",
        "optional": true
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
        "type": "reference",
        "alias": "string | undefined",
        "optional": true
      },
      "onSocketConnect": {
        "type": "reference",
        "alias": "(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>",
        "comments": "Called when a socket connects\nUse for connection verification. Will disconnect socket on any errors",
        "optional": true
      },
      "onSocketDisconnect": {
        "type": "reference",
        "alias": "(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>",
        "comments": "Called when a socket disconnects",
        "optional": true
      },
      "auth": {
        "type": "reference",
        "alias": "Auth<S, SUser>",
        "aliasSymbolescapedName": "Auth",
        "comments": "Auth configuration.\nSupports email and OAuth strategies",
        "optional": true
      },
      "DEBUG_MODE": {
        "type": "reference",
        "alias": "boolean | undefined",
        "optional": true
      },
      "onQuery": {
        "type": "reference",
        "alias": "(error: any, ctx: IEventContext<IClient>) => void",
        "comments": "Callback called when a query is executed.\nUseful for logging or debugging",
        "optional": true
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
            "type": "reference",
            "alias": "\"DDL_trigger\""
          },
          {
            "type": "reference",
            "alias": "\"prostgles_queries\""
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
            "type": "reference",
            "alias": "Partial<Record<\"ALTER AGGREGATE\" | \"ALTER COLLATION\" | \"ALTER CONVERSION\" | \"ALTER DOMAIN\" | \"ALTER DEFAULT PRIVILEGES\" | \"ALTER EXTENSION\" | \"ALTER FOREIGN DATA WRAPPER\" | \"ALTER FOREIGN TABLE\" | ... 102 more ... | \"SELECT INTO\", 1>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional"
          },
          {
            "type": "reference",
            "alias": "Partial<Record<\"ALTER AGGREGATE\" | \"ALTER COLLATION\" | \"ALTER CONVERSION\" | \"ALTER DOMAIN\" | \"ALTER DEFAULT PRIVILEGES\" | \"ALTER EXTENSION\" | \"ALTER FOREIGN DATA WRAPPER\" | \"ALTER FOREIGN TABLE\" | ... 102 more ... | \"SELECT INTO\", 0>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional"
          },
          {
            "type": "reference",
            "alias": "\"hotReloadMode\""
          },
          {
            "type": "reference",
            "alias": "OnSchemaChangeCallback",
            "aliasSymbolescapedName": "OnSchemaChangeCallback"
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
        "type": "reference",
        "alias": "Keywords",
        "aliasSymbolescapedName": "Keywords",
        "optional": true
      },
      "onNotice": {
        "type": "reference",
        "alias": "(notice: AnyObject, message?: string | undefined) => void",
        "optional": true
      },
      "fileTable": {
        "type": "reference",
        "alias": "FileTableConfig | undefined",
        "comments": "Enables file storage and serving.\nCurrently supports saving files locally or to AWS S3",
        "optional": true
      },
      "restApi": {
        "type": "reference",
        "alias": "RestApiConfig",
        "aliasSymbolescapedName": "RestApiConfig",
        "comments": "Rest API configuration.\nThe REST API allows interacting with the database similarly to the socket connection\nwith the exception of subscriptions and realtime features",
        "optional": true
      },
      "tableConfig": {
        "type": "reference",
        "alias": "TableConfig",
        "aliasSymbolescapedName": "TableConfig",
        "comments": "A simple way of defining tables through a JSON-schema like object.\nAllowes adding runtime JSONB validation and type safety.\nShould be used with caution because it tends to revert any changes\nmade to the database schema through SQL queries",
        "optional": true
      },
      "tableConfigMigrations": {
        "type": "reference",
        "alias": "{ silentFail?: boolean | undefined; version: number; versionTableName?: string | undefined; onMigrate: (args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: (\"c\" | ... 2 more ... | \"f\")[] | undefined) => Promise<...>; }) => void; }",
        "optional": true
      },
      "onLog": {
        "type": "reference",
        "alias": "(evt: EventInfo) => Promise<void>",
        "comments": "Usefull for logging or debugging",
        "optional": true
      }
    }
  }
] as const satisfies TS_Type[];