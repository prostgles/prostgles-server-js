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
- **disableRealtime** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  If true then schema watch, subscriptions and syncs will be disabled.
  No `prostgles` schema will be created which is needed for the realtime features.
  This is useful when you want to connect to a database and prevent any changes to the schema
- **publish** <span style="color: grey">optional</span> <span style="color: green;">Publish</span>

  Data access rules applied to clients.
  By default, nothing is allowed.
- **publishRawSQL** <span style="color: grey">optional</span> <span style="color: green;">(params: PublishParams&lt;S, SUser&gt;) =&gt; Awaitable&lt;boolean | "*"&gt;</span>

  If defined and resolves to true then the connected client can run SQL queries
- **functions** <span style="color: grey">optional</span> <span style="color: green;">ServerActionHandlers</span>

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

  Path to a SQL file that will be executed on startup (but before onReady).
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
- **auth** <span style="color: grey">optional</span> <span style="color: green;">AuthConfig</span>

  Auth configuration.
  Supports email and OAuth strategies
- **DEBUG_MODE** <span style="color: grey">optional</span> <span style="color: green;">boolean | undefined</span>

  Used internally for debugging
- **onQuery** <span style="color: grey">optional</span> <span style="color: green;">(error: any, ctx: IEventContext&lt;IClient&gt;) =&gt; void</span>

  Callback called when a query is executed.
  Useful for logging or debugging
- **onConnectionError** <span style="color: grey">optional</span> <span style="color: green;">(error: Error, ctx: IEventContext&lt;IClient&gt;) =&gt; void</span>

  Called when a connection error is received from the database
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
  - **versionTableName** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Table that will contain the schema version number and the tableConfig
    Defaults to schema_version
  - **version** <span style="color: red">required</span> <span style="color: green;">number</span>

    Current schema version number.
    Must increase on each schema change.
  - **onMigrate** <span style="color: red">required</span> <span style="color: green;">OnMigrate</span>

    Script executed before tableConfig is loaded and IF an older schema_version is present.
    Any data conflicting with the new schema changes should be resolved here.
- **onLog** <span style="color: grey">optional</span> <span style="color: green;">(evt: EventInfo) =&gt; void | Promise&lt;void&gt;</span>

  Usefull for logging or debugging