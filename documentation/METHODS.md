# Isomorphic Methods

The following methods are available on the client and server.

## getInfo<span style="opacity: 0.6;">(lang?: string): Promise&lt;TableInfo&gt;</span>
Retrieves the table/view info
```typescript
getInfo: (): 
```
#### Parameters

  - **lang**: `string`

    Language code for i18n data. "en" by default
#### `TableInfo`


  - **oid**: `number`

    OID from the postgres database
    Useful in handling renamed tables
  - **comment**: `string`

    Comment from the postgres database
  - **isFileTable**: `FileTableConfig`

    Defined if this is the fileTable
    - **allowedNestedInserts**: `{ table: string; column: string; }`


      - **table**: `string`


      - **column**: `string`


  - **hasFiles**: `false`

    True if fileTable is enabled and this table references the fileTable
    Used in UI
  - **isView**: `false`

    True if this is a view.
    Table methods (insert, update, delete) are undefined for views
  - **fileTableName**: `string`

    Name of the fileTable (if enabled)
    Used in UI
  - **dynamicRules**: `{ update?: boolean | undefined; }`

    Used for getColumns in cases where the columns are dynamic based on the request.
    See dynamicFields from Update rules
    - **update**: `false`


  - **info**: `{ label?: string | undefined; }`

    Additional table info provided through TableConfig
    - **label**: `string`


  - **uniqueColumnGroups**: `string[][] | undefined`

    List of unique column indexes/constraints.
    Column groups where at least a column is not allowed to be viewed (selected) are omitted.

## getColumns<span style="opacity: 0.6;">(lang?: string, params?: GetColumnsParams): Promise&lt;ValidatedColumnInfo[]&gt;</span>
Retrieves columns metadata of the table/view
```typescript
getColumns: (): 
```
#### Parameters

  - **lang**: `string`


  - **params**: `GetColumnsParams`

    Dynamic/filter based rules allow limit what columns can be updated based on the request data/filter
    This allows parameter allows identifying the columns that can be updated based on the request data
    - **rule**: `"update"`


    - **data**: `AnyObject`



    - **filter**: `FullFilter`

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
#### `ValidatedColumnInfo`


  - **name**: `string`


  - **label**: `string`

    Column display name. Will be first non empty value from i18n data, comment, name
  - **comment**: `string | undefined`

    Column description (if provided)
  - **ordinal_position**: `number`

    Ordinal position of the column within the table (count starts at 1)
  - **is_nullable**: `boolean`

    True if column is nullable
  - **is_updatable**: `boolean`


  - **is_generated**: `boolean`

    If the column is a generated column (converted to boolean from ALWAYS and NEVER)
  - **data_type**: `string`

    Simplified data type
  - **udt_name**: `PG_COLUMN_UDT_DATA_TYPE`

    Postgres data type name.
    Array types start with an underscore
  - **element_type**: `string | undefined`

    Element data type
  - **element_udt_name**: `string | undefined`

    Element data type name
  - **is_pkey**: `boolean`

    PRIMARY KEY constraint on column.
    A table can have a multi column primary key
  - **references**: `ReferenceTable`


    - **ftable**: `string`


    - **fcols**: `string`


    - **cols**: `string`


  - **has_default**: `boolean`

    true if column has a default value
    Used for excluding pkey from insert
  - **column_default**: `any`

    Column default value
  - **min**: `string | number | undefined`

    Extracted from tableConfig
    Used in SmartForm
  - **max**: `string | number | undefined`


  - **hint**: `string`


  - **jsonbSchema**: `JSONBSchema`

    JSONB schema (a simplified version of json schema) for the column (if defined in the tableConfig)
    A check constraint will use this schema for runtime data validation and apropriate TS types will be generated
    - **nullable**: `any`

      False by default
    - **description**: `any`


    - **title**: `any`


    - **type**: `any`


    - **allowedValues**: `any`


    - **oneOf**: `any`


    - **oneOfType**: `any`


    - **arrayOf**: `any`


    - **arrayOfType**: `any`


    - **enum**: `any`


    - **record**: `any`


    - **lookup**: `any`


    - **defaultValue**: `any`


  - **file**: `FileColumnConfig | undefined`

    If degined then this column is referencing the file table
    Extracted from FileTable config
    Used in SmartForm
  - **tsDataType**: `"string" | "number" | "boolean" | "any" | "number[]" | "boolean[]" | "string[]" | "any[]"`

    TypeScript data type
  - **select**: `boolean`

    Can be viewed/selected
    Based on access rules and postgres policies
  - **orderBy**: `boolean`

    Can be ordered by
    Based on access rules
  - **filter**: `boolean`

    Can be filtered by
    Based on access rules
  - **insert**: `boolean`

    Can be inserted
    Based on access rules and postgres policies
  - **update**: `boolean`

    Can be updated
    Based on access rules and postgres policies
  - **delete**: `boolean`

    Can be used in the delete filter
    Based on access rules

## find<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;GetSelectReturnType&lt;S, P, T, true&gt;&gt;</span>
Retrieves a list of matching records from the view/table
```typescript
find: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`

    Filter to apply. Undefined will return all records
    - { "field": "value" }
    - { "field": { $in: ["value", "value2"] } }
    - { $or: [
    { "field1": "value" },
    { "field2": "value" }
    ]
    }
    - { $existsJoined: { linkedTable: { "linkedTableField": "value" } } }
  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetSelectReturnType`



## findOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;GetSelectReturnType&lt;S, P, T, false&gt; | undefined&gt;</span>
Retrieves a record from the view/table
```typescript
findOne: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetSelectReturnType<S, P, T, false> | undefined`



## subscribe<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params: SelectParams, onData: SubscribeCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
subscribe: (): 
```
#### Parameters

  - **filter**: `FullFilter`

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
  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
  - **onData**: `SubscribeCallback`

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError**: `SubscribeOnError`

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### `SubscriptionHandler`


  - **unsubscribe**: `() => Promise<any>`


  - **filter**: `{} | FullFilter<void, void>`



## subscribeOne<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params: SelectParams, onData: SubscribeOneCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves first matching record from the view/table and subscribes to changes
```typescript
subscribeOne: (): 
```
#### Parameters

  - **filter**: `FullFilter`

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
  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
  - **onData**: `SubscribeOneCallback`

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError**: `SubscribeOnError`

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### `SubscriptionHandler`


  - **unsubscribe**: `() => Promise<any>`


  - **filter**: `{} | FullFilter<void, void>`



## count<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;number&gt;</span>
Returns the number of rows that match the filter
```typescript
count: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `number`



## size<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): Promise&lt;string&gt;</span>
Returns result size in bits
```typescript
size: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `string`



## update<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, newData: Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Updates a record in the table based on the specified filter criteria
- Use { multi: false } to ensure no more than one row is updated
```typescript
update: (): 
```
#### Parameters

  - **filter**: `FullFilter`

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
  - **newData**: `Partial`

    Make all properties in T optional

  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetUpdateReturnType<P, T, S> | undefined`



## updateBatch<span style="opacity: 0.6;">(data: [FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][], params?: SelectParams): Promise&lt;void | GetUpdateReturnType&lt;P, T, S&gt;&gt;</span>
Updates multiple records in the table in a batch operation.
- Each item in the `data` array contains a filter and the corresponding data to update.
```typescript
updateBatch: (): 
```
#### Parameters

  - **data**: `[FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][]`


  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `void | GetUpdateReturnType<P, T, S>`



## insert<span style="opacity: 0.6;">(data: UpsertDataToPGCast | UpsertDataToPGCast<T>[], params?: SelectParams): Promise&lt;GetInsertReturnType&lt;D, P, T, S&gt;&gt;</span>
Inserts a new record into the table.
```typescript
insert: (): 
```
#### Parameters

  - **data**: `InsertData`


  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetInsertReturnType`



## upsert<span style="opacity: 0.6;">(filter: ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, newData: Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Inserts or updates a record in the table.
- If a record matching the `filter` exists, it updates the record.
- If no matching record exists, it inserts a new record.
```typescript
upsert: (): 
```
#### Parameters

  - **filter**: `FullFilter`

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
  - **newData**: `Partial`

    Make all properties in T optional

  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetUpdateReturnType<P, T, S> | undefined`



## delete<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, params?: SelectParams): Promise&lt;GetUpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Deletes records from the table based on the specified filter criteria.
- If no filter is provided, all records may be deleted (use with caution).
```typescript
delete: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **params**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `GetUpdateReturnType<P, T, S> | undefined`


# Client Methods

The following methods are available on the client.

## getJoinedTables<span style="opacity: 0.6;">(): string[]</span>

```typescript
getJoinedTables: (): 
```
#### Parameters

#### `string`







## sync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, options: SyncOptions, onChange: (data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any, onError?: (error: any) => void): Promise&lt;{ $unsync: () =&gt; void; $upsert: (newData: T[]) =&gt; any; getItems: () =&gt; T[]; }&gt;</span>

```typescript
sync: (): 
```
#### Parameters

  - **basicFilter**: `EqualityFilter`

    Equality filter used for sync
    Multiple columns are combined with AND

  - **options**: `SyncOptions`


  - **onChange**: `(data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any`


  - **onError**: `(error: any) => void`


#### `{ $unsync: () => void; $upsert: (newData: T[]) => any; getItems: () => T[]; }`


  - **$unsync**: `() => void`


  - **$upsert**: `(newData: T[]) => any`


  - **getItems**: `() => T[]`



## useSync<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOptions): { data: SyncDataItem&lt;Required&lt;T&gt;&gt;[] | undefined; isLoading: boolean; error?: any; }</span>
Retrieves rows matching the filter and keeps them in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
useSync: (): 
```
#### Parameters

  - **basicFilter**: `EqualityFilter`

    Equality filter used for sync
    Multiple columns are combined with AND

  - **syncOptions**: `SyncOptions`


#### `{ data: SyncDataItem<Required<T>>[] | undefined; isLoading: boolean; error?: any; }`


  - **data**: `SyncDataItem<Required<T>>[] | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`



## syncOne<span style="opacity: 0.6;">(basicFilter: Partial, options: SyncOneOptions, onChange: (data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any, onError?: (error: any) => void): Promise&lt;SingleSyncHandles&lt;T, false&gt;&gt;</span>

```typescript
syncOne: (): 
```
#### Parameters

  - **basicFilter**: `Partial`

    Make all properties in T optional

  - **options**: `SyncOneOptions`


  - **onChange**: `(data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any`


  - **onError**: `(error: any) => void`


#### `SingleSyncHandles`

  CRUD handles added if initialised with handlesOnData = true
  - **$get**: `() => T | undefined`


  - **$find**: `(idObj: Partial<T>) => T | undefined`


  - **$unsync**: `() => any`


  - **$delete**: `() => void`


  - **$update**: `<OPTS extends $UpdateOpts>(newData: OPTS extends { deepMerge: true; } ? DeepPartial<T> : Partial<T>, opts?: OPTS | undefined) => any`


  - **$cloneSync**: `CloneSync`


  - **$cloneMultiSync**: `CloneMultiSync`



## useSyncOne<span style="opacity: 0.6;">(basicFilter: EqualityFilter, syncOptions: SyncOneOptions): { data: SyncDataItem&lt;Required&lt;T&gt;&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves the first row matching the filter and keeps it in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
useSyncOne: (): 
```
#### Parameters

  - **basicFilter**: `EqualityFilter`

    Equality filter used for sync
    Multiple columns are combined with AND

  - **syncOptions**: `SyncOneOptions`


#### `{ data: SyncDataItem<Required<T>> | undefined; isLoading: boolean; error?: any; }`


  - **data**: `SyncDataItem<Required<T>> | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`





## useSubscribe<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, options?: SubscribeParams): { data: GetSelectReturnType&lt;S, SubParams, T, true&gt; | undefined; error?: any; isLoading: boolean; }</span>
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
useSubscribe: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **options**: `SubscribeParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
    - **throttle**: `number`

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts**: `{ skipFirst?: boolean | undefined; }`


      - **skipFirst**: `false`

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### `{ data: GetSelectReturnType<S, SubParams, T, true> | undefined; error?: any; isLoading: boolean; }`


  - **data**: `GetSelectReturnType<S, SubParams, T, true> | undefined`


  - **error**: `any`


  - **isLoading**: `boolean`



## useSubscribeOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, options?: SubscribeParams): { data: GetSelectReturnType&lt;S, SubParams, T, false&gt; | undefined; error?: any; isLoading: boolean; }</span>
Retrieves a matching record from the view/table and subscribes to changes
```typescript
useSubscribeOne: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **options**: `SubscribeParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
    - **throttle**: `number`

      If true then the subscription will be throttled to the provided number of milliseconds
    - **throttleOpts**: `{ skipFirst?: boolean | undefined; }`


      - **skipFirst**: `false`

        False by default.
        If true then the first value will be emitted at the end of the interval. Instant otherwise
#### `{ data: GetSelectReturnType<S, SubParams, T, false> | undefined; error?: any; isLoading: boolean; }`


  - **data**: `GetSelectReturnType<S, SubParams, T, false> | undefined`


  - **error**: `any`


  - **isLoading**: `boolean`



## useFind<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: GetSelectReturnType&lt;S, P, T, true&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves a list of matching records from the view/table
```typescript
useFind: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `{ data: GetSelectReturnType<S, P, T, true> | undefined; isLoading: boolean; error?: any; }`


  - **data**: `GetSelectReturnType<S, P, T, true> | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`



## useFindOne<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: GetSelectReturnType&lt;S, P, T, false&gt; | undefined; isLoading: boolean; error?: any; }</span>
Retrieves first matching record from the view/table
```typescript
useFindOne: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `{ data: GetSelectReturnType<S, P, T, false> | undefined; isLoading: boolean; error?: any; }`


  - **data**: `GetSelectReturnType<S, P, T, false> | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`



## useCount<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: number | undefined; isLoading: boolean; error?: any; }</span>
Returns the total number of rows matching the filter
```typescript
useCount: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `{ data: number | undefined; isLoading: boolean; error?: any; }`


  - **data**: `number | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`



## useSize<span style="opacity: 0.6;">(filter?: undefined | ComplexFilter | { $and: FullFilter<T, S>[]; } | { $or: FullFilter<T, S>[]; } | NormalFilter | ShorthandFilter | Partial, selectParams?: SelectParams): { data: string | undefined; isLoading: boolean; error?: any; }</span>
Returns result size in bits matching the filter and selectParams
```typescript
useSize: (): 
```
#### Parameters

  - **filter**: `FullFilter<T, S> | undefined`


  - **selectParams**: `SelectParams`


    - **limit**: `number | null | undefined`

      Max number of rows to return. Defaults to 1000
      - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)
    - **offset**: `number`

      Number of rows to skip
    - **groupBy**: `false`

      Will group by all non aggregated fields specified in select (or all fields by default)
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`

      Result data structure/type:
      - **row**: the first row as an object
      - **value**: the first value from of first field
      - **values**: array of values from the selected field
      - **statement**: sql statement
      - **statement-no-rls**: sql statement without row level security
      - **statement-where**: sql statement where condition
    - **select**: `Select`

      Fields/expressions/linked data to select
      - `"*"` or empty will return all fields
      - `{ field: 0 }` - all fields except the specified field will be selected
      - `{ field: 1 }` - only the specified field will be selected
      - `{ field: { $funcName: [args] } }` - the field will be selected with the specified function applied
      - `{ field: 1, referencedTable: "*" }` - field together with all fields from referencedTable will be selected
      - `{ linkedData: { referencedTable: { field: 1 } } }` - linkedData will contain the linked/joined records from referencedTable
    - **orderBy**: `OrderBy`

      Order by options
      - Order is maintained in arrays
      - `[{ key: "field", asc: true, nulls: "last" }]`
    - **having**: `FullFilter<T, S> | undefined`

      Filter applied after any aggregations (group by)
#### `{ data: string | undefined; isLoading: boolean; error?: any; }`


  - **data**: `string | undefined`


  - **isLoading**: `boolean`


  - **error**: `any`

