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