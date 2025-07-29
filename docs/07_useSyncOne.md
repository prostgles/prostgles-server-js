> Available on client only

## useSyncOne<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOneOptions, hookOptions?: HookOptions): AsyncResult</span>
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