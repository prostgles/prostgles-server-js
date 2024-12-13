# Isomorphic Methods

The following table/view methods are available on the client and server.

## getInfo<span style="opacity: 0.6;">(lang?: string): Promise&lt;TableInfo&gt;</span>
Retrieves the table/view info
```typescript
getInfo: (): 
```
#### Parameters

  - **lang** <span style="color: grey">optional</span> : <span style="color: green;">string</span>

    Language code for i18n data. "en" by default
#### <span style="color: green;">Promise&lt;TableInfo&gt;</span>

  Represents the completion of an asynchronous operation

## getColumns<span style="opacity: 0.6;">(lang?: string, params?: GetColumnsParams): Promise&lt;ValidatedColumnInfo[]&gt;</span>
Retrieves columns metadata of the table/view
```typescript
getColumns: (): 
```
#### Parameters

  - **lang** <span style="color: grey">optional</span> : <span style="color: green;">string</span>
  - **params** <span style="color: grey">optional</span> : <span style="color: green;">GetColumnsParams</span>

    Dynamic/filter based rules allow limit what columns can be updated based on the request data/filter
    This allows parameter allows identifying the columns that can be updated based on the request data
    - **rule** <span style="color: red">required</span> : <span style="color: brown;">"update"</span>
    - **data** <span style="color: red">required</span> : <span style="color: green;">AnyObject</span>

    - **filter** <span style="color: red">required</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;void, void&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;void, void&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">Partial</span> | <span style="color: green;">Partial</span> | <span style="color: green;">Partial</span> | <span style="color: green;">Partial</span> | <span style="color: green;">Partial&lt;{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }&gt; & Partial&lt;{ [x: `${string}.$ilike`]: any; [x: `${string}.$like`]: any; [x: `${string}.$nilike`]: any; [x: `${string}.$nlike`]: any; }&gt;</span> | <span style="color: green;">Partial&lt;{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }&gt; & Partial&lt;{ [x: `${string}.@@`]: any; [x: `${string}.@&gt;`]: any; [x: `${string}.&lt;@`]: any; [x: `${string}.$contains`]: any; [x: `${string}.$containedBy`]: any; }&gt;</span> | <span style="color: green;">Partial</span>

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
#### <span style="color: green;">Promise&lt;ValidatedColumnInfo[]&gt;</span>

  Represents the completion of an asynchronous operation

## find<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;GetSelectReturnType&lt;S, P, T, true&gt;&gt;</span>
Retrieves a list of matching records from the view/table
```typescript
find: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

    Filter to apply. Undefined will return all records
    - { "field": "value" }
    - { "field": { $in: ["value", "value2"] } }
    - { $or: [
    { "field1": "value" },
    { "field2": "value" }
    ]
    }
    - { $existsJoined: { linkedTable: { "linkedTableField": "value" } } }
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetSelectReturnType&lt;S, P, T, true&gt;&gt;</span>

  Represents the completion of an asynchronous operation

## findOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;GetSelectReturnType&lt;S, P, T, false&gt; | undefined&gt;</span>
Retrieves a record from the view/table
```typescript
findOne: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetSelectReturnType&lt;S, P, T, false&gt; | undefined&gt;</span>

  Represents the completion of an asynchronous operation

## subscribe<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params: SelectParams, onData: SubscribeCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
subscribe: (): 
```
#### Parameters

  - **filter** <span style="color: red">required</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

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
  - **params** <span style="color: red">required</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
  - **onData** <span style="color: red">required</span> : <span style="color: green;">SubscribeCallback</span>

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError** <span style="color: grey">optional</span> : <span style="color: green;">SubscribeOnError</span>

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### <span style="color: green;">Promise&lt;SubscriptionHandler&gt;</span>

  Represents the completion of an asynchronous operation

## subscribeOne<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params: SelectParams, onData: SubscribeOneCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves first matching record from the view/table and subscribes to changes
```typescript
subscribeOne: (): 
```
#### Parameters

  - **filter** <span style="color: red">required</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

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
  - **params** <span style="color: red">required</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
  - **onData** <span style="color: red">required</span> : <span style="color: green;">SubscribeOneCallback</span>

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError** <span style="color: grey">optional</span> : <span style="color: green;">SubscribeOnError</span>

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### <span style="color: green;">Promise&lt;SubscriptionHandler&gt;</span>

  Represents the completion of an asynchronous operation

## count<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;number&gt;</span>
Returns the number of rows that match the filter
```typescript
count: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;number&gt;</span>

  Represents the completion of an asynchronous operation

## size<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;string&gt;</span>
Returns result size in bits
```typescript
size: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;string&gt;</span>

  Represents the completion of an asynchronous operation

## update<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, newData: Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Updates a record in the table based on the specified filter criteria
- Use { multi: false } to ensure no more than one row is updated
```typescript
update: (): 
```
#### Parameters

  - **filter** <span style="color: red">required</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

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
  - **newData** <span style="color: red">required</span> : <span style="color: green;">Partial</span>

    Make all properties in T optional

  - **params** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>

  Represents the completion of an asynchronous operation

## updateBatch<span style="opacity: 0.6;">(data: [FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][], params?: SelectParams): Promise&lt;void | GetUpdateReturnType&lt;P, T, S&gt;&gt;</span>
Updates multiple records in the table in a batch operation.
- Each item in the `data` array contains a filter and the corresponding data to update.
```typescript
updateBatch: (): 
```
#### Parameters

  - **data** <span style="color: red">required</span> : <span style="color: green;">[FullFilter&lt;T, S&gt;, Partial&lt;UpsertDataToPGCast&lt;T&gt;&gt;][]</span>
  - **params** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;void | GetUpdateReturnType&lt;P, T, S&gt;&gt;</span>

  Represents the completion of an asynchronous operation

## insert<span style="opacity: 0.6;">(data: UpsertDataToPGCast | UpsertDataToPGCast<T>[], params?: SelectParams): Promise&lt;GetInsertReturnType&lt;D, P, T, S&gt;&gt;</span>
Inserts a new record into the table.
```typescript
insert: (): 
```
#### Parameters

  - **data** <span style="color: red">required</span> : <span style="color: green;">UpsertDataToPGCast</span> | <span style="color: green;">UpsertDataToPGCast&lt;T&gt;[]</span>
  - **params** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetInsertReturnType&lt;D, P, T, S&gt;&gt;</span>

  Represents the completion of an asynchronous operation

## upsert<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, newData: Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Inserts or updates a record in the table.
- If a record matching the `filter` exists, it updates the record.
- If no matching record exists, it inserts a new record.
```typescript
upsert: (): 
```
#### Parameters

  - **filter** <span style="color: red">required</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

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
  - **newData** <span style="color: red">required</span> : <span style="color: green;">Partial</span>

    Make all properties in T optional

  - **params** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>

  Represents the completion of an asynchronous operation

## delete<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Deletes records from the table based on the specified filter criteria.
- If no filter is provided, all records may be deleted (use with caution).
```typescript
delete: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **params** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>

  Represents the completion of an asynchronous operation
# Client-only Methods

The following table/view methods are available on the client.

## getJoinedTables<span style="opacity: 0.6;">(): string[]</span>

```typescript
getJoinedTables: (): 
```
#### Parameters

#### <span style="color: green;">string</span>





## sync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, options: SyncOptions, onChange: (data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any, onError?: (error: any) => void): Promise&lt;{ $unsync: () =&gt; void; $upsert: (newData: T[]) =&gt; any; getItems: () =&gt; T[]; }&gt;</span>

```typescript
sync: (): 
```
#### Parameters

  - **basicFilter** <span style="color: red">required</span> : <span style="color: green;">EqualityFilter</span>

    Equality filter used for sync
    Multiple columns are combined with AND

  - **options** <span style="color: red">required</span> : <span style="color: green;">SyncOptions</span>
  - **onChange** <span style="color: red">required</span> : <span style="color: green;">(data: SyncDataItem&lt;Required&lt;T&gt;, false&gt;[], delta?: Partial&lt;T&gt;[] | undefined) =&gt; any</span>
  - **onError** <span style="color: grey">optional</span> : <span style="color: green;">(error: any) =&gt; void</span>
#### <span style="color: green;">Promise&lt;{ $unsync: () =&gt; void; $upsert: (newData: T[]) =&gt; any; getItems: () =&gt; T[]; }&gt;</span>

  Represents the completion of an asynchronous operation

## useSync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOptions): { data: SyncDataItem&lt;Required&lt;T&gt;&gt;[] | undefined; isLoading: boolean; error?: any; }</span>
Retrieves rows matching the filter and keeps them in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
useSync: (): 
```
#### Parameters

  - **basicFilter** <span style="color: red">required</span> : <span style="color: green;">EqualityFilter</span>

    Equality filter used for sync
    Multiple columns are combined with AND

  - **syncOptions** <span style="color: red">required</span> : <span style="color: green;">SyncOptions</span>
#### <span style="color: green;">{ data: SyncDataItem&lt;Required&lt;T&gt;&gt;[] | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">SyncDataItem&lt;Required&lt;T&gt;&gt;[]</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

## syncOne<span style="opacity: 0.6;">(basicFilter: Partial, options: SyncOneOptions, onChange: (data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any, onError?: (error: any) => void): Promise&lt;SingleSyncHandles&lt;T, false&gt;&gt;</span>

```typescript
syncOne: (): 
```
#### Parameters

  - **basicFilter** <span style="color: red">required</span> : <span style="color: green;">Partial</span>

    Make all properties in T optional

  - **options** <span style="color: red">required</span> : <span style="color: green;">SyncOneOptions</span>
  - **onChange** <span style="color: red">required</span> : <span style="color: green;">(data: SyncDataItem&lt;Required&lt;T&gt;, false&gt;, delta?: Partial&lt;T&gt; | undefined) =&gt; any</span>
  - **onError** <span style="color: grey">optional</span> : <span style="color: green;">(error: any) =&gt; void</span>
#### <span style="color: green;">Promise&lt;SingleSyncHandles&lt;T, false&gt;&gt;</span>

  Represents the completion of an asynchronous operation

## useSyncOne<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOneOptions): { data: SyncDataItem&lt;Required&lt;T&gt;&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves the first row matching the filter and keeps it in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
useSyncOne: (): 
```
#### Parameters

  - **basicFilter** <span style="color: red">required</span> : <span style="color: green;">EqualityFilter</span>

    Equality filter used for sync
    Multiple columns are combined with AND

  - **syncOptions** <span style="color: red">required</span> : <span style="color: green;">SyncOneOptions</span>
#### <span style="color: green;">{ data: SyncDataItem&lt;Required&lt;T&gt;&gt; | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">SyncDataItem</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>



## useSubscribe<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, options?: SubscribeParams): { data: GetSelectReturnType&lt;S, SubParams, T, true&gt; | undefined; error?: any; isLoading: boolean; }</span>
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
useSubscribe: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **options** <span style="color: grey">optional</span> : <span style="color: green;">SubscribeParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
    - **throttle** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts** <span style="color: grey">optional</span> : <span style="color: green;">{ skipFirst?: boolean | undefined; }</span>
      - **skipFirst** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### <span style="color: green;">{ data: GetSelectReturnType&lt;S, SubParams, T, true&gt; | undefined; error?: any; isLoading: boolean; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">any</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>

## useSubscribeOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, options?: SubscribeParams): { data: GetSelectReturnType&lt;S, SubParams, T, false&gt; | undefined; error?: any; isLoading: boolean; }</span>
Retrieves a matching record from the view/table and subscribes to changes
```typescript
useSubscribeOne: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **options** <span style="color: grey">optional</span> : <span style="color: green;">SubscribeParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
    - **throttle** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts** <span style="color: grey">optional</span> : <span style="color: green;">{ skipFirst?: boolean | undefined; }</span>
      - **skipFirst** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### <span style="color: green;">{ data: GetSelectReturnType&lt;S, SubParams, T, false&gt; | undefined; error?: any; isLoading: boolean; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">any</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>

## useFind<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: GetSelectReturnType&lt;S, P, T, true&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves a list of matching records from the view/table
```typescript
useFind: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">{ data: GetSelectReturnType&lt;S, P, T, true&gt; | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">any</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

## useFindOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: GetSelectReturnType&lt;S, P, T, false&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves first matching record from the view/table
```typescript
useFindOne: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">{ data: GetSelectReturnType&lt;S, P, T, false&gt; | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">any</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

## useCount<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: number | undefined; isLoading: boolean; error?: any; }</span>
Returns the total number of rows matching the filter
```typescript
useCount: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">{ data: number | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">number</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

## useSize<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: string | undefined; isLoading: boolean; error?: any; }</span>
Returns result size in bits matching the filter and selectParams
```typescript
useSize: (): 
```
#### Parameters

  - **filter** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>
  - **selectParams** <span style="color: grey">optional</span> : <span style="color: green;">SelectParams</span>
    - **limit** <span style="color: grey">optional</span> : <span style="color: green;">null</span> | <span style="color: green;">number</span>

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset** <span style="color: grey">optional</span> : <span style="color: green;">number</span>

      Number of rows to skip
    - **groupBy** <span style="color: grey">optional</span> : <span style="color: green;">boolean</span>

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType** <span style="color: grey">optional</span> : <span style="color: brown;">"row"</span> | <span style="color: brown;">"value"</span> | <span style="color: brown;">"values"</span> | <span style="color: brown;">"statement"</span> | <span style="color: brown;">"statement-no-rls"</span> | <span style="color: brown;">"statement-where"</span>

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy** <span style="color: grey">optional</span> : <span style="color: green;">any</span>

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having** <span style="color: grey">optional</span> : <span style="color: green;">ComplexFilter</span> | <span style="color: green;">{ $and: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">{ $or: FullFilter&lt;T, S&gt;[]; }</span> | <span style="color: green;">NormalFilter</span> | <span style="color: green;">any</span> | <span style="color: green;">Partial</span>

      Filter applied after any aggregations (group by)
#### <span style="color: green;">{ data: string | undefined; isLoading: boolean; error?: any; }</span>
  - **data** <span style="color: red">required</span> : <span style="color: green;">undefined</span> | <span style="color: green;">string</span>
  - **isLoading** <span style="color: red">required</span> : <span style="color: green;">boolean</span>
  - **error** <span style="color: grey">optional</span> : <span style="color: green;">any</span>