## subscribeOne<span style="opacity: 0.6;">(filter: FullFilter, params: SelectParams, onData: SubscribeOneCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves first matching record from the view/table and subscribes to changes
#### Parameters

  - **filter** <span style="color: red">required</span> <span style="color: green;">FullFilter</span>

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
  - **params** <span style="color: red">required</span> <span style="color: green;">SelectParams</span>
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
  - **onData** <span style="color: red">required</span> <span style="color: green;">SubscribeOneCallback</span>

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError** <span style="color: grey">optional</span> <span style="color: green;">SubscribeOnError</span>

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### Return type
#### <span style="color: green;">SubscriptionHandler</span>
  - **unsubscribe** <span style="color: red">required</span> <span style="color: green;">() =&gt; Promise&lt;void&gt;</span>
  - **filter** <span style="color: red">required</span> <span style="color: green;">{} | FullFilter&lt;void, void&gt;</span>