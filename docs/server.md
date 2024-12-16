# Overview
Prostgles allows connecting to a PostgreSQL database to get a realtime view of the data and schema changes. 
By configuring "tsGeneratedTypesDir" the database schema types are generated automatically allowing full end-to-end type safety
### Installation
To install the package, run:
```bash
npm install prostgles-server
```
### Configuration
To get started, you need to provide a configuration object to the server.

Minimal configuration:
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

To allow clients to connect an express server with socket.io needs to be configured:
```typescript
import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
import express from "express";
import path from "path";
import http from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = http.createServer(app);
httpServer.listen(30009);
const io = new Server(httpServer, {
  path: "/prgl-api",
});

prostgles<DBGeneratedSchema>({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "postgres"
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  io,
  publish: () => {
    return {
      items: "*",
    }
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
- **dbConnection** <span style="color: red">required</span> <span style="color: green;">DbConnection</span>

  Database connection details and options

- **onReady** <span style="color: red">required</span> <span style="color: green;">OnReadyCallback</span>

  Called when the prostgles server is ready to accept connections.
  It waits for auth, tableConfig and other async configurations to complete before executing

- **tsGeneratedTypesDir** <span style="color: grey">optional</span> <span style="color: green;">string</span>

  Path to the directory where the generated types (`DBGeneratedSchema.d.ts`) will be saved.
  This file exports a `DBGeneratedSchema` type which contains types for the database tables and
  can be used as a generic type input for the prostgles instances to ensure type safety

- **io** <span style="color: grey">optional</span> <span style="color: green;">Server&lt;DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any&gt; | undefined</span>

  Socket.IO server instance object required to allow clients to connect through websockets

- **restApi** <span style="color: grey">optional</span> <span style="color: green;">RestApiConfig</span>

  Rest API configuration.
  The REST API allows interacting with the database similarly to the websocket connection.
  with the exception of subscriptions and realtime features.
  
  POST Routes:
  - /api/db/:tableName/:command
  - /api/db/sql
  - /api/methods/:method
  - /api/schema
  
  Example request:
  ```typescript
  const res = await fetch(
   `http://127.0.0.1:3001/api/db/items/findOne`,
   {
     method: "POST",
     headers: new Headers({
       'Authorization': `Bearer ${Buffer.from(token, "utf-8").toString("base64")}`,
       'Accept': 'application/json',
       'Content-Type': 'application/json'
     }),
     body: JSON.stringify([{ id: 1 }]),
   }
  );
  ```
  - **expressApp** <span style="color: red">required</span> <span style="color: green;">Express</span>

    Express server instance
  - **routePrefix** <span style="color: red">required</span> <span style="color: green;">string</span>

    Defaults to "/api"

- **disableRealtime** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  If true then schema watch, subscriptions and syncs will be disabled.
  No `prostgles` schema will be created which is needed for the realtime features.
  This is useful when you want to connect to a database and prevent any changes to the schema

- **publish** <span style="color: grey">optional</span> <span style="color: green;">Publish</span>

  Data access rules applied to clients.
  By default, nothing is allowed.

- **publishRawSQL** <span style="color: grey">optional</span> <span style="color: green;">(params: PublishParams&lt;S, SUser&gt;) =&gt; boolean | "*" | Promise&lt;boolean | "*"&gt;</span>

  If defined and resolves to true then the connected client can run SQL queries

- **publishMethods** <span style="color: grey">optional</span> <span style="color: green;">PublishMethods</span>

  Server-side functions that can be invoked by the client

- **testRulesOnConnect** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  If true then will test all table methods on each socket connect.
  Not recommended for production

- **joins** <span style="color: grey">optional</span> <span style="color: green;">Joins</span>

  Allows defining table relationships that can then be used in filters and data inserts:
   - `infered` - uses the foreign keys to infer the joins
   - `Join[]` - specifies the joins manually

- **schemaFilter** <span style="color: grey">optional</span> <span style="color: green;">Record&lt;string, 1&gt; | Record&lt;string, 0&gt; | undefined</span>

  If defined then the specified schemas are included/excluded from the prostgles schema.
  By default only current_schema() is included.

- **sqlFilePath** <span style="color: grey">optional</span> <span style="color: green;">string</span>

  Path to a SQL file that will be executed on startup (but before onReady)

- **transactions** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  If true then will allow transactions on the server through the db.tx method:
  ```typescript
   db.tx(async t => {
     await t.items.insert({ name: "a" });
     throw new Error("rollback");
   })
  ```

- **onSocketConnect** <span style="color: grey">optional</span> <span style="color: green;">(args: AuthRequestParams&lt;S, SUser&gt; & { socket: PRGLIOSocket; }) =&gt; void | Promise&lt;void&gt;</span>

  Called when a socket connects
  Use for connection verification. Will disconnect socket on any errors

- **onSocketDisconnect** <span style="color: grey">optional</span> <span style="color: green;">(args: AuthRequestParams&lt;S, SUser&gt; & { socket: PRGLIOSocket; }) =&gt; void | Promise&lt;void&gt;</span>

  Called when a socket disconnects

- **auth** <span style="color: grey">optional</span> <span style="color: green;">Auth</span>

  Auth configuration.
  Supports email and OAuth strategies
  - **sidKeyName** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Name of the cookie or socket hadnshake query param that represents the session id.
    Defaults to "session_id"
  - **responseThrottle** <span style="color: grey">optional</span> <span style="color: green;">number</span>

    Response time rounding in milliseconds to prevent timing attacks on login. Login response time should always be a multiple of this value. Defaults to 500 milliseconds
  - **expressConfig** <span style="color: grey">optional</span> <span style="color: green;">ExpressConfig</span>

    Will setup auth routes
     /login
     /logout
     /magic-link/:id
    - **app** <span style="color: red">required</span> <span style="color: green;">Express</span>

      Express app instance. If provided Prostgles will attempt to set sidKeyName to user cookie
    - **cookieOptions** <span style="color: grey">optional</span> <span style="color: green;">AnyObject | undefined</span>

      Options used in setting the cookie after a successful login
    - **disableSocketAuthGuard** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

      False by default. If false and userRoutes are provided then the socket will request window.location.reload if the current url is on a user route.
    - **publicRoutes** <span style="color: grey">optional</span> <span style="color: green;">string[] | undefined</span>

      If provided, any client requests to NOT these routes (or their subroutes) will be redirected to loginRoute (if logged in) and then redirected back to the initial route after logging in
      If logged in the user is allowed to access these routes
    - **use** <span style="color: grey">optional</span> <span style="color: green;">ExpressMiddleware&lt;S, SUser&gt; | undefined</span>

      Will attach a app.use listener and will expose getUser
      Used in UI for blocking access
    - **onGetRequestOK** <span style="color: grey">optional</span> <span style="color: green;">((req: ExpressReq, res: ExpressRes, params: AuthRequestParams&lt;S, SUser&gt;) =&gt; any) | undefined</span>

      Will be called after a GET request is authorised
      This means that
    - **magicLinks** <span style="color: grey">optional</span> <span style="color: green;">{ check: (magicId: string, dbo: DBOFullyTyped&lt;S&gt;, db: DB, client: LoginClientInfo) =&gt; Awaitable&lt;BasicSession | undefined&gt;; } | undefined</span>

      If defined, will check the magic link id and log in the user and redirect to the returnUrl if set
    - **registrations** <span style="color: grey">optional</span> <span style="color: green;">AuthRegistrationConfig&lt;S&gt; | undefined</span>
  - **getUser** <span style="color: red">required</span> <span style="color: green;">(sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB, client: AuthClientRequest & LoginClientInfo) =&gt; Awaitable&lt;AuthResult&lt;...&gt;&gt;</span>

    undefined sid is allowed to enable public users
  - **login** <span style="color: grey">optional</span> <span style="color: green;">(params: LoginParams, dbo: DBOFullyTyped&lt;S&gt;, db: DB, client: LoginClientInfo) =&gt; Awaitable&lt;BasicSession&gt;</span>
  - **logout** <span style="color: grey">optional</span> <span style="color: green;">(sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB) =&gt; any</span>
  - **cacheSession** <span style="color: grey">optional</span> <span style="color: green;">{ getSession: (sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB) =&gt; Awaitable&lt;BasicSession&gt;; }</span>

    If provided then session info will be saved on socket.__prglCache and reused from there
    - **getSession** <span style="color: red">required</span> <span style="color: green;">(sid: string | undefined, dbo: DBOFullyTyped&lt;S&gt;, db: DB) =&gt; Awaitable&lt;BasicSession&gt;</span>

- **DEBUG_MODE** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  Used internally for debugging

- **onQuery** <span style="color: grey">optional</span> <span style="color: green;">(error: any, ctx: IEventContext&lt;IClient&gt;) =&gt; void</span>

  Callback called when a query is executed.
  Useful for logging or debugging

- **watchSchemaType** <span style="color: grey">optional</span> <span style="color: green;">"DDL_trigger" | "prostgles_queries" | undefined</span>

  What schema change watcher to use when watchSchema is enabled:
  - `"DDL_trigger"` - (default) - Use a database event trigger for schema changes. Requires superuser.
  - `"prostgles_queries"` - Check db.sql() initiated queries for schema changes. Any other queries are ignored.

- **watchSchema** <span style="color: grey">optional</span> <span style="color: green;">boolean | EventTriggerTagFilter | "hotReloadMode" | OnSchemaChangeCallback | undefined</span>

  Reloads schema on schema change.
  Either calls the provided callback or triggers "onReady" on both the server
  and any connected clients when schema changes and also updates `DBGeneratedSchema.d.ts` if enabled.
  Options:
  - `true` - "onReady" call and "DBGeneratedSchema" rewrite
  - `EventTriggerTagFilter` - same as `true` but only on specified events
  - `"hotReloadMode"` - only rewrites `DBGeneratedSchema.d.ts`. Used in development when server restarts on file change.
  - `OnSchemaChangeCallback` - custom callback to be fired. Nothing else triggered
  Useful for development

- **onNotice** <span style="color: grey">optional</span> <span style="color: green;">(notice: AnyObject, message?: string | undefined) =&gt; void</span>

  Called when a notice is received from the database

- **fileTable** <span style="color: grey">optional</span> <span style="color: green;">FileTableConfig</span>

  Enables file storage and serving.
  Currently supports saving files locally or to AWS S3.
  By designating a file table files can be inserted through the table handler:
  ```typescript
  const file = await db.files.insert(
     { file: new Buffer("file content"), name: "file.txt" },
     { returnType: "*" }
  );
  
  const fileUrl = file.url;
  ```
  - **tableName** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Name of the table that will contain the file metadata.
    Defaults to "files"
  - **fileServeRoute** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    GET path used in serving media. defaults to /${tableName}
  - **delayedDelete** <span style="color: grey">optional</span> <span style="color: green;">{ deleteAfterNDays: number; checkIntervalHours?: number | undefined; }</span>

    If defined the the files will not be deleted immediately
    Instead, the "deleted" field will be updated to the current timestamp and after the day interval provided in "deleteAfterNDays" the files will be deleted
    "checkIntervalMinutes" is the frequency in hours at which the files ready for deletion are deleted
    - **deleteAfterNDays** <span style="color: red">required</span> <span style="color: green;">number</span>

      Minimum amount of time measured in days for which the files will not be deleted after requesting delete
    - **checkIntervalHours** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      How freuquently the files will be checked for deletion delay
  - **expressApp** <span style="color: red">required</span> <span style="color: green;">ExpressApp</span>

    Express server instance
  - **referencedTables** <span style="color: grey">optional</span> <span style="color: green;">{ [tableName: string]: { type: "column"; referenceColumns: Record&lt;string, FileColumnConfig&gt;; }; }</span>

    Used to specify which tables will have a file column and allowed file types.
    
    Specifying referencedTables will:
     1. create a column in that table called media
     2. create a lookup table lookup_media_{referencedTable} that joins referencedTable to the media table
  - **imageOptions** <span style="color: grey">optional</span> <span style="color: green;">ImageOptions</span>
    - **keepMetadata** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>
    - **compression** <span style="color: grey">optional</span> <span style="color: green;">ImageCompressionOptions | undefined</span>
  - **cloudClient** <span style="color: grey">optional</span> <span style="color: green;">CloudClient</span>

    Callbacks for file upload and download.
    Used for custom file handling.
    - **upload** <span style="color: red">required</span> <span style="color: green;">(file: FileUploadArgs) =&gt; Promise&lt;void&gt;</span>
    - **downloadAsStream** <span style="color: red">required</span> <span style="color: green;">(name: string) =&gt; Promise&lt;Readable&gt;</span>
    - **delete** <span style="color: red">required</span> <span style="color: green;">(fileName: string) =&gt; Promise&lt;void&gt;</span>
    - **getSignedUrlForDownload** <span style="color: red">required</span> <span style="color: green;">(fileName: string, expiresInSeconds: number) =&gt; Promise&lt;string&gt;</span>
  - **localConfig** <span style="color: grey">optional</span> <span style="color: green;">LocalConfig</span>

    Local file storage configuration.
    - **localFolderPath** <span style="color: red">required</span> <span style="color: green;">string</span>

      example: path.join(__dirname+'/media')
      note that this location will be relative to the compiled file location
    - **minFreeBytes** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Minimum amount of free bytes available to allow saving files
      Defaults to 100MB

- **tableConfig** <span style="color: grey">optional</span> <span style="color: green;">TableConfig</span>

  Define tables through a JSON-schema like object.
  Allows adding runtime JSONB validation and type safety.
  Should be used with caution because it tends to revert any changes
  made to the database schema through SQL queries

- **tableConfigMigrations** <span style="color: grey">optional</span> <span style="color: green;">TableConfigMigrations</span>

  Migration logic used when the new tableConfig version is higher than the one in the database.
  By default server will fail to start if the tableConfig schema changes cannot be applied without errors
  - **silentFail** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

    If false then prostgles won't start on any tableConfig error
    true by default
  - **version** <span style="color: red">required</span> <span style="color: green;">number</span>

    Version number that must be increased on each schema change.
  - **versionTableName** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Table that will contain the schema version number and the tableConfig
    Defaults to schema_version
  - **onMigrate** <span style="color: red">required</span> <span style="color: green;">OnMigrate</span>

    Script executed before tableConfig is loaded and IF an older schema_version is present.
    Any data conflicting with the new schema changes should be resolved here.

- **onLog** <span style="color: grey">optional</span> <span style="color: green;">(evt: EventInfo) =&gt; Promise&lt;void&gt;</span>

  Usefull for logging or debugging