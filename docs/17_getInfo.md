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
    - **update** <span style="color: grey">optional</span> <span style="color: green;">boolean</span>
  - **label** <span style="color: grey">optional</span> <span style="color: green;">string</span>

    Additional table info provided through TableConfig
  - **uniqueColumnGroups** <span style="color: grey">optional</span> <span style="color: green;">string</span>
  - **publishInfo** <span style="color: red">required</span> <span style="color: green;">{ select?: { disabledMethods?: Partial&lt;Record&lt;"findOne" | "find" | "count" | "size" | "subscribe" | "subscribeOne" | "sync", 1&gt;&gt; | undefined; syncConfig: SyncTableInfo | undefined; } | undefined; update?: { ...; } | undefined; insert?: { ...; } | undefined; delete?: {} | undefined; }</span>
    - **select** <span style="color: grey">optional</span> <span style="color: green;">{ disabledMethods?: Partial&lt;Record&lt;"findOne" | "find" | "count" | "size" | "subscribe" | "subscribeOne" | "sync", 1&gt;&gt; | undefined; syncConfig: SyncTableInfo | undefined; }</span>
      - **disabledMethods** <span style="color: grey">optional</span> <span style="color: green;">Partial</span>
      - **syncConfig** <span style="color: red">required</span> <span style="color: green;">SyncTableInfo | undefined</span>
    - **update** <span style="color: grey">optional</span> <span style="color: green;">{ disabledMethods?: Partial&lt;Record&lt;"update" | "upsert" | "updateBatch", 1&gt;&gt; | undefined; }</span>
      - **disabledMethods** <span style="color: grey">optional</span> <span style="color: green;">Partial</span>
    - **insert** <span style="color: grey">optional</span> <span style="color: green;">{ requiredNestedInserts?: RequiredNestedInsert[] | undefined; allowedNestedInserts?: string[] | undefined; }</span>
      - **requiredNestedInserts** <span style="color: grey">optional</span> <span style="color: green;">RequiredNestedInsert[]</span>

        Controlled through the publish.table_name.insert config
        If defined then any insert on this table must also contain nested inserts for the specified tables that reference this table
      - **allowedNestedInserts** <span style="color: grey">optional</span> <span style="color: green;">string</span>
    - **delete** <span style="color: grey">optional</span> <span style="color: green;">{}</span>
