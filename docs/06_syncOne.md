> Available on client only

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
    - **storageType** <span style="color: grey">optional</span> <span style="color: green;">"map" | "localStorage" | undefined</span>

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