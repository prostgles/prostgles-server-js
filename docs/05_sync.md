> Available on client only

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