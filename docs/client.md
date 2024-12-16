# Overview
Client-side API for interacting with a PostgreSQL database.

### Installation
To install the package, run:
```bash
npm install prostgles-client
```

### Configuration
Example react configuration and usage:
```typescript
import prostgles from "prostgles-client";
import { DBGeneratedSchema } from "./DBGeneratedSchema";

export const App = () => {

  const prgl = useProstglesClient("/ws-api");

  if(prgl.isLoading) return <div>Loading...</div>;
  return <MyComponent prgl={prgl} />;
}
```

Example configuration:
```typescript
import prostgles from "prostgles-client";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
import io from "socket.io-client";
const socket = io({ path: "/ws-api" });

const prostglesClient = prostgles<DBGeneratedSchema>
  socket,
  onReady: async (dbs, methods, schema, auth) => {
    console.log(dbs.items.find());
  }
})
```

### Configuration options
<span style="color: green;">InitOptions</span>
  - **socket** <span style="color: red">required</span> <span style="color: green;">Socket&lt;DefaultEventsMap, DefaultEventsMap&gt;</span>

    Socket.io client instance
  - **onReload** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    Execute this when requesting user reload (due to session expiring authGuard)
    Otherwise window will reload
  - **onSchemaChange** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    Callback called when schema changes.
    "onReady" will be called after this callback
  - **onReady** <span style="color: red">required</span> <span style="color: green;">OnReadyCallback</span>

    Callback called when:
    - the client connects for the first time
    - the schema changes
    - the client reconnects
    - server requests a reload
  - **onReconnect** <span style="color: grey">optional</span> <span style="color: green;">(socket: any, error?: any) =&gt; void</span>

    Custom handler in case of websocket re-connection.
    If not provided will fire onReady
  - **onDisconnect** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    On disconnect handler.
    It is recommended to use this callback instead of socket.on("disconnect")
  - **onDebug** <span style="color: grey">optional</span> <span style="color: green;">(event: DebugEvent) =&gt; void | Promise&lt;void&gt;</span>

    Awaited debug callback.
    Allows greater granularity during debugging.

# Client-only Methods

The following table/view methods are available on the client.

## useSync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOptions): AsyncResult</span>
Retrieves rows matching the filter and keeps them in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
#### Parameters

  - **basicFilter** <span style="color: red">required</span> <span style="color: green;">EqualityFilter</span>

    Filter used for data synchronization, where all specified columns must match the given values.
    
    Columns are combined using an AND condition.
    
    Example: `{ department: 'd1', name: 'abc' }` would match records where department is 'd1' AND name is 'abc'.
  - **syncOptions** <span style="color: red">required</span> <span style="color: green;">SyncOptions</span>
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## sync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, options: SyncOptions, onChange: OnChange, onError?: OnErrorHandler): Promise&lt;SyncHandler&gt;</span>

#### Parameters

  - **basicFilter** <span style="color: red">required</span> <span style="color: green;">EqualityFilter</span>

    Filter used for data synchronization, where all specified columns must match the given values.
    
    Columns are combined using an AND condition.
    
    Example: `{ department: 'd1', name: 'abc' }` would match records where department is 'd1' AND name is 'abc'.
  - **options** <span style="color: red">required</span> <span style="color: green;">SyncOptions</span>
  - **onChange** <span style="color: red">required</span> <span style="color: green;">OnChange</span>

    Creates a local synchronized table
  - **onError** <span style="color: grey">optional</span> <span style="color: green;">OnErrorHandler</span>
#### Return type
#### <span style="color: green;">SyncHandler</span>
  - **$unsync** <span style="color: red">required</span> <span style="color: green;">() =&gt; void</span>
  - **$upsert** <span style="color: red">required</span> <span style="color: green;">(newData: T[]) =&gt; void | Promise&lt;void&gt;</span>
  - **getItems** <span style="color: red">required</span> <span style="color: green;">() =&gt; T[]</span>

## syncOne<span style="opacity: 0.6;">(basicFilter: Partial, options: SyncOneOptions, onChange: OnchangeOne, onError?: OnErrorHandler): Promise&lt;SingleSyncHandles&gt;</span>

#### Parameters

  - **basicFilter** <span style="color: red">required</span> <span style="color: green;">Partial</span>

    Make all properties in T optional
  - **options** <span style="color: red">required</span> <span style="color: green;">SyncOneOptions</span>
    - **onChange** <span style="color: grey">optional</span> <span style="color: green;">MultiChangeListener</span>

      Data change listener.
      Called on first sync and every time the data changes
    - **skipFirstTrigger** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then the first onChange trigger is skipped
    - **select** <span style="color: grey">optional</span> <span style="color: green;">AnyObject | "*" | undefined</span>
    - **storageType** <span style="color: grey">optional</span> <span style="color: green;">"object" | "array" | "localStorage" | undefined</span>

      Default is "object".
      "localStorage" will persist the data
    - **patchText** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then only the delta of the text field is sent to server.
      Full text is sent if an error occurs
    - **patchJSON** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
    - **onReady** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>
    - **handlesOnData** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
  - **onChange** <span style="color: red">required</span> <span style="color: green;">OnchangeOne</span>
  - **onError** <span style="color: grey">optional</span> <span style="color: green;">OnErrorHandler</span>
#### Return type
#### <span style="color: green;">SingleSyncHandles</span>

  CRUD handles added if initialised with handlesOnData = true
  - **$get** <span style="color: red">required</span> <span style="color: green;">() =&gt; T | undefined</span>
  - **$find** <span style="color: red">required</span> <span style="color: green;">(idObj: Partial&lt;T&gt;) =&gt; T | undefined</span>
  - **$unsync** <span style="color: red">required</span> <span style="color: green;">() =&gt; any</span>
  - **$delete** <span style="color: red">required</span> <span style="color: green;">() =&gt; void</span>
  - **$update** <span style="color: red">required</span> <span style="color: green;">&lt;OPTS extends $UpdateOpts&gt;(newData: OPTS extends { deepMerge: true; } ? DeepPartial&lt;T&gt; : Partial&lt;T&gt;, opts?: OPTS | undefined) =&gt; any</span>
  - **$cloneSync** <span style="color: red">required</span> <span style="color: green;">CloneSync</span>
  - **$cloneMultiSync** <span style="color: red">required</span> <span style="color: green;">CloneMultiSync</span>

## useSyncOne<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOneOptions): AsyncResult</span>
Retrieves the first row matching the filter and keeps it in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
#### Parameters

  - **basicFilter** <span style="color: red">required</span> <span style="color: green;">EqualityFilter</span>

    Filter used for data synchronization, where all specified columns must match the given values.
    
    Columns are combined using an AND condition.
    
    Example: `{ department: 'd1', name: 'abc' }` would match records where department is 'd1' AND name is 'abc'.
  - **syncOptions** <span style="color: red">required</span> <span style="color: green;">SyncOneOptions</span>
    - **onChange** <span style="color: grey">optional</span> <span style="color: green;">MultiChangeListener</span>

      Data change listener.
      Called on first sync and every time the data changes
    - **skipFirstTrigger** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then the first onChange trigger is skipped
    - **select** <span style="color: grey">optional</span> <span style="color: green;">AnyObject | "*" | undefined</span>
    - **storageType** <span style="color: grey">optional</span> <span style="color: green;">"object" | "array" | "localStorage" | undefined</span>

      Default is "object".
      "localStorage" will persist the data
    - **patchText** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then only the delta of the text field is sent to server.
      Full text is sent if an error occurs
    - **patchJSON** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
    - **onReady** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>
    - **handlesOnData** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred







## useSubscribe<span style="opacity: 0.6;">(filter?: FullFilter, options?: SubscribeParams): AsyncResult</span>
Retrieves a list of matching records from the view/table and subscribes to changes
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **options** <span style="color: grey">optional</span> <span style="color: green;">SubscribeParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
    - **throttle** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts** <span style="color: grey">optional</span> <span style="color: green;">{ skipFirst?: boolean | undefined; }</span>
      - **skipFirst** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## useSubscribeOne<span style="opacity: 0.6;">(filter?: FullFilter, options?: SubscribeParams): AsyncResult</span>
Retrieves a matching record from the view/table and subscribes to changes
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **options** <span style="color: grey">optional</span> <span style="color: green;">SubscribeParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
    - **throttle** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts** <span style="color: grey">optional</span> <span style="color: green;">{ skipFirst?: boolean | undefined; }</span>
      - **skipFirst** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## useFind<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): AsyncResult</span>
Retrieves a list of matching records from the view/table
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## useFindOne<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): AsyncResult</span>
Retrieves first matching record from the view/table
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## useCount<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): AsyncResult</span>
Returns the total number of rows matching the filter
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred

## useSize<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): AsyncResult</span>
Returns result size in bits matching the filter and selectParams
#### Parameters

  - **filter** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

    Data filter
    - `{ status: 'live' }`
    - `{ $or: [{ id: 1 }, { status: 'live' }] }`
    - `{ $existsJoined: { referencedTable: { id: 1 } } }`
    - `{
         $filter: [
           { $age: ["created_at"] },
           "<",
           '1 year'
         ]
      }`
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> <span style="color: green;">"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> <span style="color: green;">Select</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred