## getInfo()
Retrieves the table/view info
```typescript
  getInfo: (lang?: string): Promise<TableInfo>
  ```
#### Arguments

  - **lang**: `string`   - Language code for i18n data. ```typescript.   "en". ```.
#### Return type
`TableInfo`  
  - **oid**: `number`   - OID from the postgres database. Useful in handling renamed tables.
  - **comment**: `string`   - Comment from the postgres database.
  - **isFileTable**: `{ allowedNestedInserts?: { table: string; column: string; }[] | undefined; }`   - Defined if this is the fileTable.
    - **allowedNestedInserts**: `{ table: string; column: string; }`  
      - **table**: `string`  
      - **column**: `string`  
  - **hasFiles**: `false`   - True if fileTable is enabled and this table references the fileTable.
  - **isView**: `false`  
  - **fileTableName**: `string`   - Name of the fileTable (if enabled).
  - **dynamicRules**: `{ update?: boolean | undefined; }`   -  See dynamicFields from Update rules.
    - **update**: `false`  
  - **info**: `{ label?: string | undefined; }`   - Additional table info provided through TableConfig.
    - **label**: `string`  
  - **uniqueColumnGroups**: `string[][] | undefined`   -  

## getColumns()
Retrieves columns metadata of the table/view
```typescript
  getColumns: (lang?: string, params?: GetColumnsParams): Promise<ValidatedColumnInfo[]>
  ```
#### Arguments

  - **lang**: `string`  
  - **params**: `GetColumnsParams`   - Dynamic/filter based rules allow limit what columns can be updated based on the request data/filter. This allows parameter allows identifying the columns that can be updated based on the request data.
    - **rule**: `"update"`  
    - **data**: `AnyObject`  

    - **filter**: `AnyObject`  

#### Return type
`ValidatedColumnInfo`  
  - **name**: `string`  
  - **label**: `string`   - Column display name. Will be first non empty value from i18n data, comment, name.
  - **comment**: `string`   - Column description (if provided).
  - **ordinal_position**: `number`   - Ordinal position of the column within the table (count starts at 1).
  - **is_nullable**: `boolean`   - 
  - **is_updatable**: `boolean`  
  - **is_generated**: `boolean`   - If the column is a generated column (converted to boolean from ALWAYS and NEVER).
  - **data_type**: `string`   - Simplified data type.
  - **udt_name**: `PG_COLUMN_UDT_DATA_TYPE`   - Postgres raw data types. values starting with underscore means it's an array of that data type.
  - **element_type**: `string`   - Element data type.
  - **element_udt_name**: `string`   - Element raw data type.
  - **is_pkey**: `boolean`   - PRIMARY KEY constraint on column. A table can have more then one PK.
  - **references**: `{ ftable: string; fcols: string[]; cols: string[]; }`  
    - **ftable**: `string`  
    - **fcols**: `string`  
    - **cols**: `string`  
  - **has_default**: `boolean`   - true if column has a default value. Used for excluding pkey from insert.
  - **column_default**: `any`   - Column default value.
  - **min**: `string | number | undefined`   - Extracted from tableConfig. Used in SmartForm.
  - **max**: `string | number | undefined`  
  - **hint**: `string`  
  - **jsonbSchema**: `JSONBSchema`  
    - **nullable**: `any`   - False by default.
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
  - **file**: `FileColumnConfig | undefined`   - If degined then this column is referencing the file table. Extracted from FileTable config. Used in SmartForm.
  - **tsDataType**: `"string" | "number" | "boolean" | "any" | "number[]" | "boolean[]" | "string[]" | "any[]"`   - TypeScript data type.
  - **select**: `boolean`   - Can be viewed/selected.
  - **orderBy**: `boolean`   - Can be ordered by.
  - **filter**: `boolean`   - Can be filtered by.
  - **insert**: `boolean`   - Can be inserted.
  - **update**: `boolean`   - Can be updated.
  - **delete**: `boolean`   - Can be used in the delete filter.

## find()
Retrieves a list of matching records from the view/table
```typescript
  find: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): Promise<GetSelectReturnType<S, P, T, true>>
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetSelectReturnType`  

## findOne()
Retrieves a record from the view/table
```typescript
  findOne: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): Promise<GetSelectReturnType<S, P, T, false> | undefined>
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetSelectReturnType<S, P, T, false> | undefined`  

## subscribe()
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
  subscribe: (filter: FullFilter, params: SelectParams, onData: (items: GetSelectReturnType<S, P, T, true>) => any, onError?: OnError): Promise<SubscriptionHandler>
  ```
#### Arguments

  - **filter**: `FullFilter`   - Group or simple filter.
  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
  - **onData**: `(items: GetSelectReturnType<S, P, T, true>) => any`  
  - **onError**: `OnError`  
#### Return type
`SubscriptionHandler`  
  - **unsubscribe**: `() => Promise<any>`  
  - **filter**: `{} | FullFilter<void, void>`  

## subscribeOne()
Retrieves first matching record from the view/table and subscribes to changes
```typescript
  subscribeOne: (filter: FullFilter, params: SelectParams, onData: (item: GetSelectReturnType<S, P, T, false> | undefined) => any, onError?: OnError): Promise<SubscriptionHandler>
  ```
#### Arguments

  - **filter**: `FullFilter`   - Group or simple filter.
  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
  - **onData**: `(item: GetSelectReturnType<S, P, T, false> | undefined) => any`  
  - **onError**: `OnError`  
#### Return type
`SubscriptionHandler`  
  - **unsubscribe**: `() => Promise<any>`  
  - **filter**: `{} | FullFilter<void, void>`  

## count()
Returns the number of rows that match the filter
```typescript
  count: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): Promise<number>
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`number`  

## size()
Returns result size in bits
```typescript
  size: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): Promise<string>
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`string`  

## getJoinedTables()

```typescript
  getJoinedTables: (): string[]
  ```
#### Arguments

#### Return type
`string`  





## sync()

```typescript
  sync: (basicFilter: EqualityFilter, options: SyncOptions, onChange: (data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any, onError?: (error: any) => void): Promise<{ $unsync: () => void; $upsert: (newData: T[]) => any; getItems: () => T[]; }>
  ```
#### Arguments

  - **basicFilter**: `EqualityFilter`   - Equality filter used for sync. Multiple columns are combined with AND.

  - **options**: `SyncOptions`  
  - **onChange**: `(data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any`  
  - **onError**: `(error: any) => void`  
#### Return type
`{ $unsync: () => void; $upsert: (newData: T[]) => any; getItems: () => T[]; }`  
  - **$unsync**: `() => void`  
  - **$upsert**: `(newData: T[]) => any`  
  - **getItems**: `() => T[]`  

## useSync()
Retrieves rows matching the filter and keeps them in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
  useSync: (basicFilter: EqualityFilter, syncOptions: SyncOptions): { data: SyncDataItem<Required<T>>[] | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **basicFilter**: `EqualityFilter`   - Equality filter used for sync. Multiple columns are combined with AND.

  - **syncOptions**: `SyncOptions`  
#### Return type
`{ data: SyncDataItem<Required<T>>[] | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `SyncDataItem<Required<T>>[] | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  

## syncOne()

```typescript
  syncOne: (basicFilter: Partial, options: SyncOneOptions, onChange: (data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any, onError?: (error: any) => void): Promise<SingleSyncHandles<T, false>>
  ```
#### Arguments

  - **basicFilter**: `Partial`   - Make all properties in T optional.

  - **options**: `SyncOneOptions`  
  - **onChange**: `(data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any`  
  - **onError**: `(error: any) => void`  
#### Return type
`SingleSyncHandles`   - CRUD handles added if initialised with handlesOnData = true.
  - **$get**: `() => T | undefined`  
  - **$find**: `(idObj: Partial<T>) => T | undefined`  
  - **$unsync**: `() => any`  
  - **$delete**: `() => void`  
  - **$update**: `<OPTS extends $UpdateOpts>(newData: OPTS extends { deepMerge: true; } ? DeepPartial<T> : Partial<T>, opts?: OPTS | undefined) => any`  
  - **$cloneSync**: `CloneSync`  
  - **$cloneMultiSync**: `CloneMultiSync`  

## useSyncOne()
Retrieves the first row matching the filter and keeps it in sync
- use { handlesOnData: true } to get optimistic updates method: $update
- any changes to the row using the $update method will be reflected instantly
   to all sync subscribers that were initiated with the same syncOptions
```typescript
  useSyncOne: (basicFilter: EqualityFilter, syncOptions: SyncOneOptions): { data: SyncDataItem<Required<T>> | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **basicFilter**: `EqualityFilter`   - Equality filter used for sync. Multiple columns are combined with AND.

  - **syncOptions**: `SyncOneOptions`  
#### Return type
`{ data: SyncDataItem<Required<T>> | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `SyncDataItem<Required<T>> | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  



## useSubscribe()
Retrieves a list of matching records from the view/table and subscribes to changes
```typescript
  useSubscribe: (filter?: FullFilter<T, S> | undefined, options?: SubscribeParams): { data: GetSelectReturnType<S, SubParams, T, true> | undefined; error?: any; isLoading: boolean; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **options**: `SubscribeParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
    - **throttle**: `number`   - If true then the subscription will be throttled to the provided number of milliseconds.
    - **throttleOpts**: `{ skipFirst?: boolean | undefined; }`  
      - **skipFirst**: `false`   -  If true then the first value will be emitted at the end of the interval. Instant otherwise.
#### Return type
`{ data: GetSelectReturnType<S, SubParams, T, true> | undefined; error?: any; isLoading: boolean; }`  
  - **data**: `GetSelectReturnType<S, SubParams, T, true> | undefined`  
  - **error**: `any`  
  - **isLoading**: `boolean`  

## useSubscribeOne()
Retrieves a matching record from the view/table and subscribes to changes
```typescript
  useSubscribeOne: (filter?: FullFilter<T, S> | undefined, options?: SubscribeParams): { data: GetSelectReturnType<S, SubParams, T, false> | undefined; error?: any; isLoading: boolean; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **options**: `SubscribeParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
    - **throttle**: `number`   - If true then the subscription will be throttled to the provided number of milliseconds.
    - **throttleOpts**: `{ skipFirst?: boolean | undefined; }`  
      - **skipFirst**: `false`   -  If true then the first value will be emitted at the end of the interval. Instant otherwise.
#### Return type
`{ data: GetSelectReturnType<S, SubParams, T, false> | undefined; error?: any; isLoading: boolean; }`  
  - **data**: `GetSelectReturnType<S, SubParams, T, false> | undefined`  
  - **error**: `any`  
  - **isLoading**: `boolean`  

## useFind()
Retrieves a list of matching records from the view/table
```typescript
  useFind: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): { data: GetSelectReturnType<S, P, T, true> | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`{ data: GetSelectReturnType<S, P, T, true> | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `GetSelectReturnType<S, P, T, true> | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  

## useFindOne()
Retrieves first matching record from the view/table
```typescript
  useFindOne: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): { data: GetSelectReturnType<S, P, T, false> | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`{ data: GetSelectReturnType<S, P, T, false> | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `GetSelectReturnType<S, P, T, false> | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  

## useCount()
Returns the total number of rows matching the filter
```typescript
  useCount: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): { data: number | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`{ data: number | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `number | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  

## useSize()
Returns result size in bits matching the filter and selectParams
```typescript
  useSize: (filter?: FullFilter<T, S> | undefined, selectParams?: SelectParams): { data: string | undefined; isLoading: boolean; error?: any; }
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **selectParams**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`{ data: string | undefined; isLoading: boolean; error?: any; }`  
  - **data**: `string | undefined`  
  - **isLoading**: `boolean`  
  - **error**: `any`  

## update()
Updates a record in the table based on the specified filter criteria
- Use { multi: false } to ensure no more than one row is updated
```typescript
  update: (filter: FullFilter, newData: Partial, params?: SelectParams): Promise<GetUpdateReturnType<P, T, S> | undefined>
  ```
#### Arguments

  - **filter**: `FullFilter`   - Group or simple filter.
  - **newData**: `Partial`   - Make all properties in T optional.

  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetUpdateReturnType<P, T, S> | undefined`  

## updateBatch()
Updates multiple records in the table in a batch operation.
- Each item in the `data` array contains a filter and the corresponding data to update.
```typescript
  updateBatch: (data: [FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][], params?: SelectParams): Promise<void | GetUpdateReturnType<P, T, S>>
  ```
#### Arguments

  - **data**: `[FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][]`  
  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`void | GetUpdateReturnType<P, T, S>`  

## insert()
Inserts a new record into the table.
```typescript
  insert: (data: UpsertDataToPGCast | UpsertDataToPGCast<T>[], params?: SelectParams): Promise<GetInsertReturnType<D, P, T, S>>
  ```
#### Arguments

  - **data**: `InsertData`  
  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetInsertReturnType`  

## upsert()
Inserts or updates a record in the table.
- If a record matching the `filter` exists, it updates the record.
- If no matching record exists, it inserts a new record.
```typescript
  upsert: (filter: FullFilter, newData: Partial, params?: SelectParams): Promise<GetUpdateReturnType<P, T, S> | undefined>
  ```
#### Arguments

  - **filter**: `FullFilter`   - Group or simple filter.
  - **newData**: `Partial`   - Make all properties in T optional.

  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetUpdateReturnType<P, T, S> | undefined`  

## delete()
Deletes records from the table based on the specified filter criteria.
- If no filter is provided, all records may be deleted (use with caution).
```typescript
  delete: (filter?: FullFilter<T, S> | undefined, params?: SelectParams): Promise<GetUpdateReturnType<P, T, S> | undefined>
  ```
#### Arguments

  - **filter**: `FullFilter<T, S> | undefined`  
  - **params**: `SelectParams`  
    - **limit**: `number | null | undefined`   - Max number of rows to return. - If undefined then 1000 will be applied as the default. - On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present).
    - **offset**: `number`   - Number of rows to skip.
    - **groupBy**: `false`   - Will group by all non aggregated fields specified in select (or all fields by default).
    - **returnType**: `"row" | "value" | "values" | "statement" | "statement-no-rls" | "statement-where" | undefined`   - Result data structure/type:. - row: the first row as an object. - value: the first value from of first field. - values: array of values from the selected field. - statement: sql statement. - statement-no-rls: sql statement without row level security. - statement-where: sql statement where condition.
    - **select**: `Select`   - Fields/expressions/linked data to select. - If empty then all fields will be selected. - If "*" then all fields will be selected. - If { field: 0 } then all fields except the specified field will be selected. - If { field: 1 } then only the specified field will be selected. - If { field: { funcName: [args] } } then the field will be selected with the specified function applied. - If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields.
    - **orderBy**: `OrderBy`   - Order by options. - If array then the order will be maintained.
    - **having**: `FullFilter<T, S> | undefined`   - Filter applied after any aggregations (group by).
#### Return type
`GetUpdateReturnType<P, T, S> | undefined`  