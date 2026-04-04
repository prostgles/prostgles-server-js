> Available on client only

## _sync<span style="opacity: 0.6;">(filter: undefined | EqualityFilter, selectParams: { select: AnyObject | "*"; }, triggers: ClientSyncHandles): Promise&lt;DbTableSync&gt;</span>
Used internally to setup sync
#### Parameters

  - **filter** <span style="color: red">required</span> <span style="color: green;">EqualityFilter&lt;AnyObject&gt; | undefined</span>
  - **selectParams** <span style="color: red">required</span> <span style="color: green;">{ select: AnyObject | "*"; }</span>
    - **select** <span style="color: red">required</span> <span style="color: green;">AnyObject | "*"</span>
  - **triggers** <span style="color: red">required</span> <span style="color: green;">ClientSyncHandles</span>
    - **onSyncRequest** <span style="color: red">required</span> <span style="color: green;">(params: SyncBatchParams) =&gt; ClientSyncInfo | ClientExpressData | Promise&lt;ClientSyncInfo | ClientExpressData&gt;</span>

      Used by client to notify server that data has changed (and send express data if necessary)
      Also used by server to request client ClientSyncInfo
    - **onPullRequest** <span style="color: red">required</span> <span style="color: green;">(params: SyncBatchParams) =&gt; ClientSyncPullResponse | Promise&lt;ClientSyncPullResponse&gt;</span>

      Used to respond to server with the requested data
    - **onUpdates** <span style="color: red">required</span> <span style="color: green;">(params: onUpdatesParams) =&gt; Promise&lt;true&gt;</span>

      Used to set the data sent by server.
      Must acknowledge so server can send next batch if necessary
#### Return type
#### <span style="color: green;">DbTableSync</span>
  - **unsync** <span style="color: red">required</span> <span style="color: green;">() =&gt; void</span>
  - **syncData** <span style="color: red">required</span> <span style="color: green;">(data?: AnyObject[] | undefined, deleted?: AnyObject[] | undefined, cb?: ((err?: any) =&gt; void) | undefined) =&gt; void</span>