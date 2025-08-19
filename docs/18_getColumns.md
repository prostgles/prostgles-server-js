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
  - **character_maximum_length** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>
  - **numeric_precision** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>
  - **numeric_scale** <span style="color: grey">optional</span> <span style="color: green;">number | null | undefined</span>
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