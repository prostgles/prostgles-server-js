> Available on client only

## useSync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOptions, hookOptions?: HookOptions): AsyncResult</span>
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
  - **hookOptions** <span style="color: grey">optional</span> <span style="color: green;">HookOptions</span>
    - **skip** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      Used to prevent the hook from fetching data
    - **deps** <span style="color: grey">optional</span> <span style="color: green;">any[] | undefined</span>

      Used to trigger re-fetching
#### Return type
#### <span style="color: green;">AsyncResult</span>

  Async result type:
  - data: the expected data
  - isLoading: true when data is being fetched (initially or on subsequent filter/option changes)
  - error: any error that occurred