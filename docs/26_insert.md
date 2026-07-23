## insert<span style="opacity: 0.6;">(data: InsertDataWithNested, params?: SelectParams): Promise&lt;GetReturningReturnType&gt;</span>
Inserts a new record into the table.
#### Parameters

  - **data** <span style="color: red">required</span> <span style="color: green;">InsertDataWithNested</span>

    TODO: pick only joined tables from schema AND exclude parent fkey columns from the nested data
  - **params** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
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
      - `"*"` or undefined will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected. Cannot be combined with inclusive selects (1, true, function or join selects)
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [...args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be returned (as an array). The referencedTable must have a reference to the current table through foreign keys for this to work
      - `{ linkedData: { $leftJoin: ["lookupTable", "targetTable"], select: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable as an array of objects.
    - **orderBy** <span style="color: grey">optional</span> <span style="color: green;">OrderBy</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> <span style="color: green;">FullFilter</span>

      Filter applied after any aggregations (group by)
    - **abortSignal** <span style="color: grey">optional</span> <span style="color: green;">AbortSignal</span>
      - **aborted** <span style="color: red">required</span> <span style="color: green;">boolean</span>

        The **`aborted`** read-only property returns a value that indicates whether the asynchronous operations the signal is communicating with are aborted (`true`) or not (`false`).
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/aborted) 
         Returns true if this AbortSignal's AbortController has signaled to abort, and false otherwise.
      - **onabort** <span style="color: red">required</span> <span style="color: green;">((this: AbortSignal, ev: Event) =&gt; any) | null</span>

        [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/abort_event)
      - **reason** <span style="color: red">required</span> <span style="color: green;">any</span>

        The **`reason`** read-only property returns a JavaScript value that indicates the abort reason.
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/reason)
      - **throwIfAborted** <span style="color: red">required</span> <span style="color: green;">{ (): void; (): void; }</span>

        The **`throwIfAborted()`** method throws the signal's abort AbortSignal.reason if the signal has been aborted; otherwise it does nothing.
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/AbortSignal/throwIfAborted)
      - **addEventListener** <span style="color: red">required</span> <span style="color: green;">{ &lt;K extends keyof AbortSignalEventMap&gt;(type: K, listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) =&gt; any, options?: boolean | AddEventListenerOptions | undefined): void; (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | ... 1 more ... | undefined): void; }</span>

        The **`addEventListener()`** method of the EventTarget interface sets up a function that will be called whenever the specified event is delivered to the target.
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/addEventListener)
      - **removeEventListener** <span style="color: red">required</span> <span style="color: green;">{ &lt;K extends keyof AbortSignalEventMap&gt;(type: K, listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) =&gt; any, options?: boolean | EventListenerOptions | undefined): void; (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | ... 1 more ... | undefined): void; }</span>

        The **`removeEventListener()`** method of the EventTarget interface removes an event listener previously registered with EventTarget.addEventListener() from the target.
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/removeEventListener)
      - **dispatchEvent** <span style="color: red">required</span> <span style="color: green;">(event: Event) =&gt; boolean</span>

        The **`dispatchEvent()`** method of the EventTarget sends an Event to the object, (synchronously) invoking the affected event listeners in the appropriate order.
        
        [MDN Reference](https://developer.mozilla.org/docs/Web/API/EventTarget/dispatchEvent)
#### Return type
#### <span style="color: green;">GetReturningReturnType</span>