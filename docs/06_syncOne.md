> Available on client only

## syncOne<span style="opacity: 0.6;">(basicFilter: EqualityFilter, options: SyncOptions, onChange: OnChangeOne, onError?: OnErrorHandler): Promise&lt;SingleSyncHandles&gt;</span>

#### Parameters

  - **basicFilter** <span style="color: red">required</span> <span style="color: green;">EqualityFilter</span>

    Filter used for data synchronization, where all specified columns must match the given values.
    
    Columns are combined using an AND condition.
    
    Example: `{ department: 'd1', name: 'abc' }` would match records where department is 'd1' AND name is 'abc'.
  - **options** <span style="color: red">required</span> <span style="color: green;">SyncOptions</span>
  - **onChange** <span style="color: red">required</span> <span style="color: green;">OnChangeOne</span>
  - **onError** <span style="color: grey">optional</span> <span style="color: green;">OnErrorHandler</span>
#### Return type
#### <span style="color: green;">SingleSyncHandles</span>

  CRUD handles added if initialised with handlesOnData = true
  - **$get** <span style="color: red">required</span> <span style="color: green;">() =&gt; Required&lt;{ [K in keyof TD]: CollapseNumberIfStringPresent&lt;TD[K]&gt;; }&gt; | undefined</span>
  - **$find** <span style="color: red">required</span> <span style="color: green;">(idObj: Partial&lt;Required&lt;{ [K in keyof TD]: CollapseNumberIfStringPresent&lt;TD[K]&gt;; }&gt;&gt;) =&gt; Required&lt;{ [K in keyof TD]: CollapseNumberIfStringPresent&lt;TD[K]&gt;; }&gt; | undefined</span>
  - **$unsync** <span style="color: red">required</span> <span style="color: green;">() =&gt; void</span>
  - **$delete** <span style="color: red">required</span> <span style="color: green;">() =&gt; void</span>
  - **$update** <span style="color: red">required</span> <span style="color: green;">&lt;OPTS extends $UpdateOpts&gt;(newData: OPTS extends { deepMerge: true; } ? DeepPartial&lt;TD&gt; : Partial&lt;TD&gt;, opts?: OPTS | undefined) =&gt; Promise&lt;void&gt;</span>
  - **$cloneSync** <span style="color: red">required</span> <span style="color: green;">CloneSync</span>
  - **$cloneMultiSync** <span style="color: red">required</span> <span style="color: green;">CloneMultiSync</span>