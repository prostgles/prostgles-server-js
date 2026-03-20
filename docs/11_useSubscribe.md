> Available on client only

## useSubscribe<span style="opacity: 0.6;">(filter?: FullFilter, options?: SubscribeParams, hookOptions?: HookOptions): AsyncResult</span>
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
    - **skipFirst** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then the first value will not be emitted
    - **actions** <span style="color: grey">optional</span> <span style="color: green;">Partial</span>

      Controls which actions will trigger the subscription.
      If not provided then all actions will be triggered
    - **skipChangedColumnsCheck** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

      If true then the subscription will be triggered without first checking if selected column values have changed
    - **throttle** <span style="color: grey">optional</span> <span style="color: green;">number</span>

      If provided then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts** <span style="color: grey">optional</span> <span style="color: green;">{ skipFirst?: boolean | undefined; }</span>
      - **skipFirst** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
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