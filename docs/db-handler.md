# Isomorphic Methods

The following table/view methods are available on the client and server db object

## getInfo<span style="opacity: 0.6;">(lang?: string): Promise&lt;TableInfo&gt;</span>
Retrieves the table/view info
#### Parameters

  - **lang** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Language code for i18n data. "en" by default
#### Return type
#### <span style="color: green;">TableInfo</span>
  - **oid** <span style="color: red">required</span> <span style="color: green;">number</span>

    OID from the postgres database
    Useful in handling renamed tables
  - **comment** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Comment from the postgres database
  - **isFileTable** <span style="color: grey">optional</span> <span style="color: green;">FileTableConfig</span>

    Defined if this is the fileTable
    - **allowedNestedInserts** <span style="color: grey">optional</span> <span style="color: green;">{ table: string; column: string; }</span>
  - **hasFiles** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

    True if fileTable is enabled and this table references the fileTable
    Used in UI
  - **isView** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>

    True if this is a view.
    Table methods (insert, update, delete) are undefined for views
  - **fileTableName** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Name of the fileTable (if enabled)
    Used in UI
  - **dynamicRules** <span style="color: grey">optional</span> <span style="color: green;">{ update?: boolean | undefined; }</span>

    Used for getColumns in cases where the columns are dynamic based on the request.
    See dynamicFields from Update rules
    - **update** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
  - **info** <span style="color: grey">optional</span> <span style="color: green;">{ label?: string | undefined; }</span>

    Additional table info provided through TableConfig
    - **label** <span style="color: grey">optional</span> <span style="color: green;">string</span>
  - **uniqueColumnGroups** <span style="color: grey">optional</span> <span style="color: green;">string</span>
  - **requiredNestedInserts** <span style="color: grey">optional</span> <span style="color: green;">RequiredNestedInsert</span>
    - **ftable** <span style="color: red">required</span> <span style="color: green;">string</span>
    - **minRows** <span style="color: grey">optional</span> <span style="color: green;">number</span>
    - **maxRows** <span style="color: grey">optional</span> <span style="color: green;">number</span>

## getColumns<span style="opacity: 0.6;">(lang?: string, params?: GetColumnsParams): Promise&lt;ValidatedColumnInfo[]&gt;</span>
Retrieves columns metadata of the table/view
#### Parameters

  - **lang** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Language code for i18n data. "en" by default
  - **params** <span style="color: grey">optional</span> <span style="color: green;">GetColumnsParams</span>

    Dynamic/filter based rules (dynamicFields) allow specifying which columns can be updated based on the target record.
    Useful when the same user can update different fields based on the record state.
    - **rule** <span style="color: red">required</span> <span style="color: brown;">"update"</span>

      Only "update" is supported at the moment
    - **filter** <span style="color: red">required</span> <span style="color: green;">FullFilter</span>

      Filter specifying which records are to be updated
#### Return type
#### <span style="color: green;">ValidatedColumnInfo</span>
  - **name** <span style="color: red">required</span> <span style="color: green;">string</span>
  - **label** <span style="color: red">required</span> <span style="color: green;">string</span>

    Column display name. Will be first non empty value from i18n data, comment, name
  - **comment** <span style="color: red">required</span> <span style="color: green;">string | undefined</span>

    Column description (if provided)
  - **ordinal_position** <span style="color: red">required</span> <span style="color: green;">number</span>

    Ordinal position of the column within the table (count starts at 1)
  - **is_nullable** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    True if column is nullable
  - **is_updatable** <span style="color: red">required</span> <span style="color: green;">boolean</span>
  - **is_generated** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    If the column is a generated column (converted to boolean from ALWAYS and NEVER)
  - **data_type** <span style="color: red">required</span> <span style="color: green;">string</span>

    Simplified data type
  - **udt_name** <span style="color: red">required</span> <span style="color: green;">PG_COLUMN_UDT_DATA_TYPE</span>

    Postgres data type name.
    Array types start with an underscore
  - **element_type** <span style="color: red">required</span> <span style="color: green;">string | undefined</span>

    Element data type
  - **element_udt_name** <span style="color: red">required</span> <span style="color: green;">string | undefined</span>

    Element data type name
  - **is_pkey** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    PRIMARY KEY constraint on column.
    A table can have a multi column primary key
  - **references** <span style="color: grey">optional</span> <span style="color: green;">ReferenceTable</span>
  - **has_default** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    true if column has a default value
    Used for excluding pkey from insert
  - **column_default** <span style="color: grey">optional</span> <span style="color: green;">any</span>

    Column default value
  - **min** <span style="color: grey">optional</span> <span style="color: green;">string | number | undefined</span>

    Extracted from tableConfig
    Used in SmartForm
  - **max** <span style="color: grey">optional</span> <span style="color: green;">string | number | undefined</span>
  - **hint** <span style="color: grey">optional</span> <span style="color: green;">string</span>
  - **jsonbSchema** <span style="color: grey">optional</span> <span style="color: green;">JSONBSchema</span>

    JSONB schema (a simplified version of json schema) for the column (if defined in the tableConfig)
    A check constraint will use this schema for runtime data validation and apropriate TS types will be generated
  - **file** <span style="color: grey">optional</span> <span style="color: green;">FileColumnConfig</span>

    If defined then this column is referencing the file table
    Extracted from FileTable config
    Used in SmartForm
  - **tsDataType** <span style="color: red">required</span> <span style="color: green;">"string" | "number" | "boolean" | "any" | "number[]" | "boolean[]" | "string[]" | "any[]"</span>

    TypeScript data type
  - **select** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be viewed/selected
    Based on access rules and postgres policies
  - **orderBy** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be ordered by
    Based on access rules
  - **filter** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be filtered by
    Based on access rules
  - **insert** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be inserted
    Based on access rules and postgres policies
  - **update** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be updated
    Based on access rules and postgres policies
  - **delete** <span style="color: red">required</span> <span style="color: green;">boolean</span>

    Can be used in the delete filter
    Based on access rules

## find<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): Promise&lt;SelectReturnType&gt;</span>
Retrieves a list of matching records from the view/table
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
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
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
#### Return type
#### <span style="color: green;">SelectReturnType</span>

## findOne<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): Promise&lt;SelectReturnType&lt;S, P, T, false&gt; | undefined&gt;</span>
Retrieves a record from the view/table
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
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
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
#### Return type
#### <span style="color: green;">SelectReturnType&lt;S, P, T, false&gt; | undefined</span>

## subscribe<span style="opacity: 0.6;">(filter: FullFilter, params: SelectParams, onData: SubscribeCallback, onError?: SubscribeOnError): Promise&lt;SubscriptionHandler&gt;</span>
Retrieves a list of matching records from the view/table and subscribes to changes
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
  - **onData** <span style="color: red">required</span> <span style="color: green;">SubscribeCallback</span>

    Callback fired once after subscribing and then every time the data matching the filter changes
  - **onError** <span style="color: grey">optional</span> <span style="color: green;">SubscribeOnError</span>

    Error handler that may fire due to schema changes or other post subscribe issues
    Column or filter issues are thrown during the subscribe call
#### Return type
#### <span style="color: green;">SubscriptionHandler</span>
  - **unsubscribe** <span style="color: red">required</span> <span style="color: green;">() =&gt; Promise&lt;any&gt;</span>
  - **filter** <span style="color: red">required</span> <span style="color: green;">{} | FullFilter&lt;void, void&gt;</span>

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
  - **unsubscribe** <span style="color: red">required</span> <span style="color: green;">() =&gt; Promise&lt;any&gt;</span>
  - **filter** <span style="color: red">required</span> <span style="color: green;">{} | FullFilter&lt;void, void&gt;</span>

## count<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): Promise&lt;number&gt;</span>
Returns the number of rows that match the filter
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
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
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
#### Return type
#### <span style="color: green;">number</span>

## size<span style="opacity: 0.6;">(filter?: FullFilter, selectParams?: SelectParams): Promise&lt;string&gt;</span>
Returns result size in bits
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
  - **selectParams** <span style="color: grey">optional</span> <span style="color: green;">SelectParams</span>
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
#### Return type
#### <span style="color: green;">string</span>

## update<span style="opacity: 0.6;">(filter: FullFilter, newData: Partial, params?: SelectParams): Promise&lt;UpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Updates a record in the table based on the specified filter criteria
- Use { multi: false } to ensure no more than one row is updated
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
  - **newData** <span style="color: red">required</span> <span style="color: green;">Partial</span>

    Make all properties in T optional
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
#### Return type
#### <span style="color: green;">UpdateReturnType&lt;P, T, S&gt; | undefined</span>

## updateBatch<span style="opacity: 0.6;">(data: [FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][], params?: SelectParams): Promise&lt;void | UpdateReturnType&lt;P, T, S&gt;&gt;</span>
Updates multiple records in the table in a batch operation.
- Each item in the `data` array contains a filter and the corresponding data to update.
#### Parameters

  - **data** <span style="color: red">required</span> <span style="color: green;">[FullFilter&lt;T, S&gt;, Partial&lt;UpsertDataToPGCast&lt;T&gt;&gt;][]</span>
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
#### Return type
#### <span style="color: green;">void | UpdateReturnType&lt;P, T, S&gt;</span>

## insert<span style="opacity: 0.6;">(data: UpsertDataToPGCast | UpsertDataToPGCast<T>[], params?: SelectParams): Promise&lt;InsertReturnType&gt;</span>
Inserts a new record into the table.
#### Parameters

  - **data** <span style="color: red">required</span> <span style="color: green;">InsertData</span>
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
#### Return type
#### <span style="color: green;">InsertReturnType</span>

  Nothing is returned by default.
  `returning` must be specified to return the updated records.
  If an array of records is inserted then an array of records will be returned
  otherwise a single record will be returned.

## upsert<span style="opacity: 0.6;">(filter: FullFilter, newData: Partial, params?: SelectParams): Promise&lt;UpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Inserts or updates a record in the table.
- If a record matching the `filter` exists, it updates the record.
- If no matching record exists, it inserts a new record.
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
  - **newData** <span style="color: red">required</span> <span style="color: green;">Partial</span>

    Make all properties in T optional
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
#### Return type
#### <span style="color: green;">UpdateReturnType&lt;P, T, S&gt; | undefined</span>

## delete<span style="opacity: 0.6;">(filter?: FullFilter, params?: SelectParams): Promise&lt;UpdateReturnType&lt;P, T, S&gt; | undefined&gt;</span>
Deletes records from the table based on the specified filter criteria.
- If no filter is provided, all records may be deleted (use with caution).
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
#### Return type
#### <span style="color: green;">UpdateReturnType&lt;P, T, S&gt; | undefined</span>