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
  - <strong>dbConnection</strong> `DbConnection`
  Database connection details  
  - <strong>onReady</strong> `OnReadyCallback`
  Called when the prostgles server is ready to accept connections.
It waits for auth, tableConfig and other async configurations to complete before executing  
  - <strong>tsGeneratedTypesDir</strong> `string | undefined`
  If defined then a `DBGeneratedSchema.d.ts` file will be created in the provided directory.
This file exports a `DBGeneratedSchema` type which contains types for the database tables and
can be used as a generic type input for the prostgles instances to ensure type safety  
  - <strong>disableRealtime</strong> `boolean | undefined`
  If true then schema watch, subscriptions and syncs will be disabled.
No `prostgles` schema will be created which is needed for the realtime features.
This is useful when you want to connect to a database and prevent any changes to the schema  
  - <strong>io</strong> `Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>`
  Socket.IO server instance object  
  - <strong>publish</strong> `Publish<S, SUser> | undefined`
  Data access rules applied to clients.
By default, nothing is allowed.  
  - <strong>testRulesOnConnect</strong> `boolean | undefined`
  If true then will test all table methods on each socket connect.
Not recommended for production  
  - <strong>publishMethods</strong> `PublishMethods`
  Custom methods that can be called from the client  
  - <strong>publishRawSQL</strong> `(params: PublishParams<S, SUser>) => boolean | "*" | Promise<boolean | "*">`
  If defined and resolves to true then the connected client can run SQL queries  
  - <strong>joins</strong> `Joins | undefined`
  Allows defining joins between tables:
 - `infered` - uses the foreign keys to infer the joins
 - `Join[]` - specifies the joins manually  
  - <strong>schema</strong> `Record<string, 1> | Record<string, 0> | undefined`
  If defined then the specified schemas are included/excluded from the prostgles schema.
By default the `public` schema is included.  
  - <strong>sqlFilePath</strong> `string | undefined`
  Path to a SQL file that will be executed on startup (but before onReady)  
  - <strong>transactions</strong> `string | boolean | undefined`
  - <strong>wsChannelNamePrefix</strong> `string | undefined`
  - <strong>onSocketConnect</strong> `(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>`
  Called when a socket connects
Use for connection verification. Will disconnect socket on any errors  
  - <strong>onSocketDisconnect</strong> `(args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket; }) => void | Promise<void>`
  Called when a socket disconnects  
  - <strong>auth</strong> `Auth`
  Auth configuration.
Supports email and OAuth strategies  
  - <strong>DEBUG_MODE</strong> `boolean | undefined`
  - <strong>onQuery</strong> `(error: any, ctx: IEventContext<IClient>) => void`
  Callback called when a query is executed.
Useful for logging or debugging  
  - <strong>watchSchemaType</strong> `"DDL_trigger" | "prostgles_queries" | undefined`
  - <strong>watchSchema</strong> `boolean | EventTriggerTagFilter | "hotReloadMode" | OnSchemaChangeCallback | undefined`
  If truthy then DBGeneratedSchema.d.ts will be updated
and "onReady" will be called with new schema on both client and server  
  - <strong>keywords</strong> `Keywords`
  - <strong>onNotice</strong> `(notice: AnyObject, message?: string | undefined) => void`
  - <strong>fileTable</strong> `FileTableConfig | undefined`
  Enables file storage and serving.
Currently supports saving files locally or to AWS S3  
  - <strong>restApi</strong> `RestApiConfig`
  Rest API configuration.
The REST API allows interacting with the database similarly to the socket connection
with the exception of subscriptions and realtime features  
  - <strong>tableConfig</strong> `TableConfig`
  A simple way of defining tables through a JSON-schema like object.
Allowes adding runtime JSONB validation and type safety.
Should be used with caution because it tends to revert any changes
made to the database schema through SQL queries  
  - <strong>tableConfigMigrations</strong> `{ silentFail?: boolean | undefined; version: number; versionTableName?: string | undefined; onMigrate: (args: { db: DB; oldVersion: number | undefined; getConstraints: (table: string, column?: string | undefined, types?: ("c" | ... 2 more ... | "f")[] | undefined) => Promise<...>; }) => void; }`
  - <strong>onLog</strong> `(evt: EventInfo) => Promise<void>`
  Usefull for logging or debugging  