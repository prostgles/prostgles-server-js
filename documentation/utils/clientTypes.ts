import type { TS_Type } from "./getSerializableType";
export const definitions = [
  {
    "type": "object",
    "alias": "TableHandlerClient<T, S>",
    "aliasSymbolescapedName": "TableHandlerClient",
    "properties": {
      "getInfo": {
        "type": "function",
        "alias": "(lang?: string | undefined) => Promise<TableInfo>",
        "arguments": [
          {
            "name": "lang",
            "optional": true,
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "comments": "Language code for i18n data\n```typescript\n  \"en\"\n```"
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<TableInfo>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "object",
            "alias": "TableInfo",
            "aliasSymbolescapedName": "TableInfo",
            "comments": "",
            "properties": {
              "oid": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": false,
                "comments": "OID from the postgres database\nUseful in handling renamed tables"
              },
              "comment": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true,
                "comments": "Comment from the postgres database"
              },
              "isFileTable": {
                "type": "object",
                "alias": "{ allowedNestedInserts?: { table: string; column: string; }[] | undefined; }",
                "comments": "Defined if this is the fileTable",
                "properties": {
                  "allowedNestedInserts": {
                    "type": "array",
                    "alias": "{ table: string; column: string; }[]",
                    "itemType": {
                      "type": "object",
                      "alias": "{ table: string; column: string; }",
                      "properties": {
                        "table": {
                          "type": "primitive",
                          "alias": "string",
                          "subType": "string",
                          "optional": false
                        },
                        "column": {
                          "type": "primitive",
                          "alias": "string",
                          "subType": "string",
                          "optional": false
                        }
                      }
                    },
                    "optional": true,
                    "comments": "Defined if direct inserts are disabled.\nOnly nested inserts through the specified tables/columns are allowed"
                  }
                },
                "optional": true
              },
              "hasFiles": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "True if fileTable is enabled and this table references the fileTable"
              },
              "isView": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true
              },
              "fileTableName": {
                "type": "primitive",
                "alias": "string",
                "subType": "string",
                "optional": true,
                "comments": "Name of the fileTable (if enabled)"
              },
              "dynamicRules": {
                "type": "object",
                "alias": "{ update?: boolean | undefined; }",
                "comments": "Used for getColumns in cases where the columns are dynamic based on the request.\nSee dynamicFields from Update rules",
                "properties": {
                  "update": {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean",
                    "optional": true
                  }
                },
                "optional": true
              },
              "info": {
                "type": "object",
                "alias": "{ label?: string | undefined; }",
                "comments": "Additional table info provided through TableConfig",
                "properties": {
                  "label": {
                    "type": "primitive",
                    "alias": "string",
                    "subType": "string",
                    "optional": true
                  }
                },
                "optional": true
              },
              "uniqueColumnGroups": {
                "type": "union",
                "alias": "string[][] | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "array",
                    "alias": "string[][]",
                    "itemType": {
                      "type": "array",
                      "alias": "string[]",
                      "itemType": {
                        "type": "primitive",
                        "alias": "string",
                        "subType": "string"
                      }
                    }
                  }
                ],
                "optional": false,
                "comments": "List of unique column indexes/constraints.\nColumn groups where at least a column is not allowed to be viewed (selected) are omitted."
              }
            }
          }
        },
        "optional": false,
        "comments": "Retrieves the table/view info"
      },
      "getColumns": {
        "type": "function",
        "alias": "GetColumns",
        "aliasSymbolescapedName": "GetColumns",
        "arguments": [
          {
            "name": "lang",
            "optional": true,
            "type": "primitive",
            "alias": "string",
            "subType": "string",
            "comments": ""
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "GetColumnsParams",
            "aliasSymbolescapedName": "GetColumnsParams",
            "comments": "Dynamic/filter based rules allow limit what columns can be updated based on the request data/filter\nThis allows parameter allows identifying the columns that can be updated based on the request data",
            "properties": {
              "rule": {
                "type": "literal",
                "alias": "\"update\"",
                "value": "update",
                "optional": false
              },
              "data": {
                "type": "object",
                "alias": "AnyObject",
                "aliasSymbolescapedName": "AnyObject",
                "properties": {},
                "optional": false
              },
              "filter": {
                "type": "object",
                "alias": "AnyObject",
                "aliasSymbolescapedName": "AnyObject",
                "properties": {},
                "optional": false
              }
            }
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<ValidatedColumnInfo[]>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "array",
            "alias": "ValidatedColumnInfo[]",
            "itemType": {
              "type": "object",
              "alias": "ValidatedColumnInfo",
              "aliasSymbolescapedName": "ValidatedColumnInfo",
              "properties": {
                "name": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false
                },
                "label": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false,
                  "comments": "Column display name. Will be first non empty value from i18n data, comment, name"
                },
                "comment": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false,
                  "comments": "Column description (if provided)"
                },
                "ordinal_position": {
                  "type": "primitive",
                  "alias": "number",
                  "subType": "number",
                  "optional": false,
                  "comments": "Ordinal position of the column within the table (count starts at 1)"
                },
                "is_nullable": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "True if column is nullable. A not-null constraint is one way a column can be known not nullable, but there may be others."
                },
                "is_updatable": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false
                },
                "is_generated": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "If the column is a generated column (converted to boolean from ALWAYS and NEVER)"
                },
                "data_type": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false,
                  "comments": "Simplified data type"
                },
                "udt_name": {
                  "type": "reference",
                  "alias": "PG_COLUMN_UDT_DATA_TYPE",
                  "aliasSymbolescapedName": "PG_COLUMN_UDT_DATA_TYPE",
                  "comments": "Postgres raw data types. values starting with underscore means it's an array of that data type",
                  "optional": false
                },
                "element_type": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false,
                  "comments": "Element data type"
                },
                "element_udt_name": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": false,
                  "comments": "Element raw data type"
                },
                "is_pkey": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "PRIMARY KEY constraint on column. A table can have more then one PK"
                },
                "references": {
                  "type": "array",
                  "alias": "{ ftable: string; fcols: string[]; cols: string[]; }[]",
                  "itemType": {
                    "type": "object",
                    "alias": "{ ftable: string; fcols: string[]; cols: string[]; }",
                    "properties": {
                      "ftable": {
                        "type": "primitive",
                        "alias": "string",
                        "subType": "string",
                        "optional": false
                      },
                      "fcols": {
                        "type": "array",
                        "alias": "string[]",
                        "itemType": {
                          "type": "primitive",
                          "alias": "string",
                          "subType": "string"
                        },
                        "optional": false
                      },
                      "cols": {
                        "type": "array",
                        "alias": "string[]",
                        "itemType": {
                          "type": "primitive",
                          "alias": "string",
                          "subType": "string"
                        },
                        "optional": false
                      }
                    }
                  },
                  "optional": true,
                  "comments": "Foreign key constraint\nA column can reference multiple tables"
                },
                "has_default": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "true if column has a default value\nUsed for excluding pkey from insert"
                },
                "column_default": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any",
                  "optional": true,
                  "comments": "Column default value"
                },
                "min": {
                  "type": "union",
                  "alias": "string | number | undefined",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "undefined",
                      "subType": "undefined"
                    },
                    {
                      "type": "primitive",
                      "alias": "string",
                      "subType": "string"
                    },
                    {
                      "type": "primitive",
                      "alias": "number",
                      "subType": "number"
                    }
                  ],
                  "optional": true,
                  "comments": "Extracted from tableConfig\nUsed in SmartForm"
                },
                "max": {
                  "type": "union",
                  "alias": "string | number | undefined",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "undefined",
                      "subType": "undefined"
                    },
                    {
                      "type": "primitive",
                      "alias": "string",
                      "subType": "string"
                    },
                    {
                      "type": "primitive",
                      "alias": "number",
                      "subType": "number"
                    }
                  ],
                  "optional": true
                },
                "hint": {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string",
                  "optional": true
                },
                "jsonbSchema": {
                  "type": "object",
                  "alias": "JSONBSchema<FieldTypeObj>",
                  "aliasSymbolescapedName": "JSONBSchema",
                  "properties": {
                    "nullable": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true,
                      "comments": "False by default"
                    },
                    "description": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "title": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "type": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "allowedValues": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "oneOf": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "oneOfType": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "arrayOf": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "arrayOfType": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "enum": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "record": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "lookup": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "defaultValue": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    }
                  },
                  "optional": true
                },
                "file": {
                  "type": "union",
                  "alias": "FileColumnConfig | undefined",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "undefined",
                      "subType": "undefined"
                    },
                    {
                      "type": "object",
                      "alias": "{ acceptedContent: FieldFilter<{ image: 1; audio: 1; video: 1; text: 1; application: 1; }>; } & { maxFileSizeMB?: number | undefined; }",
                      "properties": {
                        "acceptedContent": {
                          "type": "union",
                          "alias": "FieldFilter<{ image: 1; audio: 1; video: 1; text: 1; application: 1; }>",
                          "aliasSymbolescapedName": "FieldFilter",
                          "comments": "List of fields to include or exclude",
                          "types": [
                            {
                              "type": "literal",
                              "alias": "\"\"",
                              "value": ""
                            },
                            {
                              "type": "literal",
                              "alias": "\"*\"",
                              "value": "*"
                            },
                            {
                              "type": "object",
                              "alias": "{ \"*\": 1; }",
                              "properties": {
                                "*": {
                                  "type": "primitive",
                                  "alias": "1",
                                  "subType": "number",
                                  "optional": false
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ image?: true | 1 | undefined; audio?: true | 1 | undefined; video?: true | 1 | undefined; text?: true | 1 | undefined; application?: true | 1 | undefined; }",
                              "properties": {
                                "image": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ image?: false | 0 | undefined; audio?: false | 0 | undefined; video?: false | 0 | undefined; text?: false | 0 | undefined; application?: false | 0 | undefined; }",
                              "properties": {
                                "image": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "array",
                              "alias": "(\"text\" | \"image\" | \"audio\" | \"video\" | \"application\")[]",
                              "itemType": {
                                "type": "union",
                                "alias": "\"text\" | \"image\" | \"audio\" | \"video\" | \"application\"",
                                "types": [
                                  {
                                    "type": "literal",
                                    "alias": "\"text\"",
                                    "value": "text"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image\"",
                                    "value": "image"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"audio\"",
                                    "value": "audio"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video\"",
                                    "value": "video"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application\"",
                                    "value": "application"
                                  }
                                ]
                              }
                            }
                          ],
                          "optional": false
                        },
                        "maxFileSizeMB": {
                          "type": "primitive",
                          "alias": "number",
                          "subType": "number",
                          "optional": true
                        }
                      }
                    },
                    {
                      "type": "object",
                      "alias": "{ acceptedContentType: FieldFilter<{ readonly \"text/html\": readonly [\"html\", \"htm\", \"shtml\"]; readonly \"text/css\": readonly [\"css\"]; readonly \"text/csv\": readonly [\"csv\"]; readonly \"text/tsv\": readonly [\"tsv\"]; readonly \"text/xml\": readonly [\"xml\"]; ... 61 more ...; readonly \"video/webm\": readonly [...]; }>; } & { ....",
                      "properties": {
                        "acceptedContentType": {
                          "type": "union",
                          "alias": "FieldFilter<{ readonly \"text/html\": readonly [\"html\", \"htm\", \"shtml\"]; readonly \"text/css\": readonly [\"css\"]; readonly \"text/csv\": readonly [\"csv\"]; readonly \"text/tsv\": readonly [\"tsv\"]; readonly \"text/xml\": readonly [\"xml\"]; readonly \"text/mathml\": readonly [\"mml\"]; ... 60 more ...; readonly \"video/webm\": readonly...",
                          "aliasSymbolescapedName": "FieldFilter",
                          "comments": "List of fields to include or exclude",
                          "types": [
                            {
                              "type": "literal",
                              "alias": "\"\"",
                              "value": ""
                            },
                            {
                              "type": "literal",
                              "alias": "\"*\"",
                              "value": "*"
                            },
                            {
                              "type": "object",
                              "alias": "{ \"*\": 1; }",
                              "properties": {
                                "*": {
                                  "type": "primitive",
                                  "alias": "1",
                                  "subType": "number",
                                  "optional": false
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ readonly \"text/html\"?: true | 1 | undefined; readonly \"text/css\"?: true | 1 | undefined; readonly \"text/csv\"?: true | 1 | undefined; readonly \"text/tsv\"?: true | 1 | undefined; readonly \"text/xml\"?: true | ... 1 more ... | undefined; ... 61 more ...; readonly \"video/webm\"?: true | ... 1 more ... | undefined; }",
                              "properties": {
                                "text/html": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/css": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/csv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/tsv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/mathml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/plain": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/vnd.sun.j2me.app-descriptor": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/vnd.wap.wml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/x-component": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/gif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/jpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/png": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/tiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/vnd.wap.wbmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-icon": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-jng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-ms-bmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/svg+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/webp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/sql": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-javascript": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/atom+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/rss+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/java-archive": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/mac-binhex40": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/msword": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/pdf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/postscript": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/rtf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.ms-excel": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.ms-powerpoint": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.wap.wmlc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.google-earth.kml+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.google-earth.kmz": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-7z-compressed": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-cocoa": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-java-archive-diff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-java-jnlp-file": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-makeself": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-perl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-pilot": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-rar-compressed": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-redhat-package-manager": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-sea": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-shockwave-flash": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-stuffit": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-tcl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-x509-ca-cert": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-xpinstall": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/xhtml+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/zip": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/octet-stream": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/midi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/ogg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/x-realaudio": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/3gpp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/quicktime": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-flv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-mng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-ms-asf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-ms-wmv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-msvideo": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/mp4": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/webm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ readonly \"text/html\"?: false | 0 | undefined; readonly \"text/css\"?: false | 0 | undefined; readonly \"text/csv\"?: false | 0 | undefined; readonly \"text/tsv\"?: false | 0 | undefined; readonly \"text/xml\"?: false | ... 1 more ... | undefined; ... 61 more ...; readonly \"video/webm\"?: false | ... 1 more ... | undefined; }",
                              "properties": {
                                "text/html": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/css": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/csv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/tsv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/mathml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/plain": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/vnd.sun.j2me.app-descriptor": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/vnd.wap.wml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "text/x-component": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/gif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/jpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/png": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/tiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/vnd.wap.wbmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-icon": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-jng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/x-ms-bmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/svg+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "image/webp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/sql": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-javascript": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/atom+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/rss+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/java-archive": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/mac-binhex40": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/msword": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/pdf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/postscript": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/rtf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.ms-excel": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.ms-powerpoint": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.wap.wmlc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.google-earth.kml+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/vnd.google-earth.kmz": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-7z-compressed": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-cocoa": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-java-archive-diff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-java-jnlp-file": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-makeself": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-perl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-pilot": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-rar-compressed": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-redhat-package-manager": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-sea": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-shockwave-flash": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-stuffit": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-tcl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-x509-ca-cert": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/x-xpinstall": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/xhtml+xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/zip": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "application/octet-stream": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/midi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/ogg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "audio/x-realaudio": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/3gpp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/quicktime": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-flv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-mng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-ms-asf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-ms-wmv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/x-msvideo": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/mp4": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "video/webm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "array",
                              "alias": "(\"text/html\" | \"text/css\" | \"text/csv\" | \"text/tsv\" | \"text/xml\" | \"text/mathml\" | \"text/plain\" | \"text/vnd.sun.j2me.app-descriptor\" | \"text/vnd.wap.wml\" | \"text/x-component\" | ... 56 more ... | \"video/webm\")[]",
                              "itemType": {
                                "type": "union",
                                "alias": "\"text/html\" | \"text/css\" | \"text/csv\" | \"text/tsv\" | \"text/xml\" | \"text/mathml\" | \"text/plain\" | \"text/vnd.sun.j2me.app-descriptor\" | \"text/vnd.wap.wml\" | \"text/x-component\" | ... 56 more ... | \"video/webm\"",
                                "types": [
                                  {
                                    "type": "literal",
                                    "alias": "\"text/html\"",
                                    "value": "text/html"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/css\"",
                                    "value": "text/css"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/csv\"",
                                    "value": "text/csv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/tsv\"",
                                    "value": "text/tsv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/xml\"",
                                    "value": "text/xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/mathml\"",
                                    "value": "text/mathml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/plain\"",
                                    "value": "text/plain"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/vnd.sun.j2me.app-descriptor\"",
                                    "value": "text/vnd.sun.j2me.app-descriptor"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/vnd.wap.wml\"",
                                    "value": "text/vnd.wap.wml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"text/x-component\"",
                                    "value": "text/x-component"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/gif\"",
                                    "value": "image/gif"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/jpeg\"",
                                    "value": "image/jpeg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/png\"",
                                    "value": "image/png"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/tiff\"",
                                    "value": "image/tiff"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/vnd.wap.wbmp\"",
                                    "value": "image/vnd.wap.wbmp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/x-icon\"",
                                    "value": "image/x-icon"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/x-jng\"",
                                    "value": "image/x-jng"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/x-ms-bmp\"",
                                    "value": "image/x-ms-bmp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/svg+xml\"",
                                    "value": "image/svg+xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"image/webp\"",
                                    "value": "image/webp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/sql\"",
                                    "value": "application/sql"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-javascript\"",
                                    "value": "application/x-javascript"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/atom+xml\"",
                                    "value": "application/atom+xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/rss+xml\"",
                                    "value": "application/rss+xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/java-archive\"",
                                    "value": "application/java-archive"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/mac-binhex40\"",
                                    "value": "application/mac-binhex40"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/msword\"",
                                    "value": "application/msword"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/pdf\"",
                                    "value": "application/pdf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/postscript\"",
                                    "value": "application/postscript"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/rtf\"",
                                    "value": "application/rtf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/vnd.ms-excel\"",
                                    "value": "application/vnd.ms-excel"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/vnd.ms-powerpoint\"",
                                    "value": "application/vnd.ms-powerpoint"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/vnd.wap.wmlc\"",
                                    "value": "application/vnd.wap.wmlc"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/vnd.google-earth.kml+xml\"",
                                    "value": "application/vnd.google-earth.kml+xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/vnd.google-earth.kmz\"",
                                    "value": "application/vnd.google-earth.kmz"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-7z-compressed\"",
                                    "value": "application/x-7z-compressed"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-cocoa\"",
                                    "value": "application/x-cocoa"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-java-archive-diff\"",
                                    "value": "application/x-java-archive-diff"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-java-jnlp-file\"",
                                    "value": "application/x-java-jnlp-file"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-makeself\"",
                                    "value": "application/x-makeself"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-perl\"",
                                    "value": "application/x-perl"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-pilot\"",
                                    "value": "application/x-pilot"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-rar-compressed\"",
                                    "value": "application/x-rar-compressed"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-redhat-package-manager\"",
                                    "value": "application/x-redhat-package-manager"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-sea\"",
                                    "value": "application/x-sea"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-shockwave-flash\"",
                                    "value": "application/x-shockwave-flash"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-stuffit\"",
                                    "value": "application/x-stuffit"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-tcl\"",
                                    "value": "application/x-tcl"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-x509-ca-cert\"",
                                    "value": "application/x-x509-ca-cert"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/x-xpinstall\"",
                                    "value": "application/x-xpinstall"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/xhtml+xml\"",
                                    "value": "application/xhtml+xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/zip\"",
                                    "value": "application/zip"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"application/octet-stream\"",
                                    "value": "application/octet-stream"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"audio/midi\"",
                                    "value": "audio/midi"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"audio/mpeg\"",
                                    "value": "audio/mpeg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"audio/ogg\"",
                                    "value": "audio/ogg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"audio/x-realaudio\"",
                                    "value": "audio/x-realaudio"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/3gpp\"",
                                    "value": "video/3gpp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/mpeg\"",
                                    "value": "video/mpeg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/quicktime\"",
                                    "value": "video/quicktime"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/x-flv\"",
                                    "value": "video/x-flv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/x-mng\"",
                                    "value": "video/x-mng"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/x-ms-asf\"",
                                    "value": "video/x-ms-asf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/x-ms-wmv\"",
                                    "value": "video/x-ms-wmv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/x-msvideo\"",
                                    "value": "video/x-msvideo"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/mp4\"",
                                    "value": "video/mp4"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"video/webm\"",
                                    "value": "video/webm"
                                  }
                                ]
                              }
                            }
                          ],
                          "optional": false
                        },
                        "maxFileSizeMB": {
                          "type": "primitive",
                          "alias": "number",
                          "subType": "number",
                          "optional": true
                        }
                      }
                    },
                    {
                      "type": "object",
                      "alias": "{ acceptedFileTypes: FieldFilter<Record<\"html\" | \"htm\" | \"shtml\" | \"css\" | \"csv\" | \"tsv\" | \"xml\" | \"webm\" | \"mml\" | \"txt\" | \"jad\" | \"wml\" | \"htc\" | \"gif\" | \"jpeg\" | \"jpg\" | \"png\" | \"tif\" | \"tiff\" | ... 79 more ... | \"mp4\", 1>>; } & { ...; }",
                      "properties": {
                        "acceptedFileTypes": {
                          "type": "union",
                          "alias": "FieldFilter<Record<\"html\" | \"htm\" | \"shtml\" | \"css\" | \"csv\" | \"tsv\" | \"xml\" | \"webm\" | \"mml\" | \"txt\" | \"jad\" | \"wml\" | \"htc\" | \"gif\" | \"jpeg\" | \"jpg\" | \"png\" | \"tif\" | \"tiff\" | \"wbmp\" | \"ico\" | \"jng\" | ... 76 more ... | \"mp4\", 1>>",
                          "aliasSymbolescapedName": "FieldFilter",
                          "comments": "List of fields to include or exclude",
                          "types": [
                            {
                              "type": "literal",
                              "alias": "\"\"",
                              "value": ""
                            },
                            {
                              "type": "literal",
                              "alias": "\"*\"",
                              "value": "*"
                            },
                            {
                              "type": "object",
                              "alias": "{ \"*\": 1; }",
                              "properties": {
                                "*": {
                                  "type": "primitive",
                                  "alias": "1",
                                  "subType": "number",
                                  "optional": false
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ html?: true | 1 | undefined; htm?: true | 1 | undefined; shtml?: true | 1 | undefined; css?: true | 1 | undefined; csv?: true | 1 | undefined; tsv?: true | 1 | undefined; xml?: true | 1 | undefined; ... 91 more ...; mp4?: true | ... 1 more ... | undefined; }",
                              "properties": {
                                "html": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "htm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "shtml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "css": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "csv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tsv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "webm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "txt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jad": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "htc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "gif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jpg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "png": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wbmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ico": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "bmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "svg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "webp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sql": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "js": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "atom": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rss": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "war": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ear": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "hqx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "doc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "docx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pdf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ps": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "eps": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ai": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rtf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xls": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xlsx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ppt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pptx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wmlc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kmz": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "7z": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "cco": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jardiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jnlp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "run": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "prc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pdb": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rpm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sea": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "swf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sit": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tcl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tk": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "der": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pem": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "crt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xpi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xhtml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "zip": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "bin": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "exe": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "dll": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "deb": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "dmg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "eot": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "iso": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "img": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mid": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "midi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mp3": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ogg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ra": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "3gpp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "3gp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mpg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mov": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "flv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "asx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "asf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wmv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "avi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "m4v": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mp4": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "object",
                              "alias": "{ html?: false | 0 | undefined; htm?: false | 0 | undefined; shtml?: false | 0 | undefined; css?: false | 0 | undefined; csv?: false | 0 | undefined; tsv?: false | 0 | undefined; xml?: false | 0 | undefined; ... 91 more ...; mp4?: false | ... 1 more ... | undefined; }",
                              "properties": {
                                "html": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "htm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "shtml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "css": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "csv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tsv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "webm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "txt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jad": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "htc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "gif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jpg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "png": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tif": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wbmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ico": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "bmp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "svg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "webp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sql": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "js": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "atom": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rss": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "war": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ear": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "hqx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "doc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "docx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pdf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ps": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "eps": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ai": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rtf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xls": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xlsx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ppt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pptx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wmlc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kmz": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "7z": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "cco": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jardiff": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "jnlp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "run": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "prc": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pdb": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "rpm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sea": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "swf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "sit": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tcl": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "tk": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "der": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "pem": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "crt": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xpi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "xhtml": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "zip": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "bin": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "exe": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "dll": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "deb": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "dmg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "eot": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "iso": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "img": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "msm": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mid": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "midi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "kar": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mp3": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ogg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "ra": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "3gpp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "3gp": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mpeg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mpg": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mov": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "flv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mng": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "asx": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "asf": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "wmv": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "avi": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "m4v": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                },
                                "mp4": {
                                  "type": "primitive",
                                  "alias": "any",
                                  "subType": "any",
                                  "optional": true
                                }
                              }
                            },
                            {
                              "type": "array",
                              "alias": "(\"html\" | \"htm\" | \"shtml\" | \"css\" | \"csv\" | \"tsv\" | \"xml\" | \"webm\" | \"mml\" | \"txt\" | \"jad\" | \"wml\" | \"htc\" | \"gif\" | \"jpeg\" | \"jpg\" | \"png\" | \"tif\" | \"tiff\" | \"wbmp\" | \"ico\" | \"jng\" | ... 76 more ... | \"mp4\")[]",
                              "itemType": {
                                "type": "union",
                                "alias": "\"html\" | \"htm\" | \"shtml\" | \"css\" | \"csv\" | \"tsv\" | \"xml\" | \"webm\" | \"mml\" | \"txt\" | \"jad\" | \"wml\" | \"htc\" | \"gif\" | \"jpeg\" | \"jpg\" | \"png\" | \"tif\" | \"tiff\" | \"wbmp\" | \"ico\" | \"jng\" | ... 76 more ... | \"mp4\"",
                                "types": [
                                  {
                                    "type": "literal",
                                    "alias": "\"html\"",
                                    "value": "html"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"htm\"",
                                    "value": "htm"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"shtml\"",
                                    "value": "shtml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"css\"",
                                    "value": "css"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"csv\"",
                                    "value": "csv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"tsv\"",
                                    "value": "tsv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"xml\"",
                                    "value": "xml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"webm\"",
                                    "value": "webm"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mml\"",
                                    "value": "mml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"txt\"",
                                    "value": "txt"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jad\"",
                                    "value": "jad"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"wml\"",
                                    "value": "wml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"htc\"",
                                    "value": "htc"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"gif\"",
                                    "value": "gif"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jpeg\"",
                                    "value": "jpeg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jpg\"",
                                    "value": "jpg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"png\"",
                                    "value": "png"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"tif\"",
                                    "value": "tif"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"tiff\"",
                                    "value": "tiff"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"wbmp\"",
                                    "value": "wbmp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ico\"",
                                    "value": "ico"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jng\"",
                                    "value": "jng"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"bmp\"",
                                    "value": "bmp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"svg\"",
                                    "value": "svg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"webp\"",
                                    "value": "webp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"sql\"",
                                    "value": "sql"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"js\"",
                                    "value": "js"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"atom\"",
                                    "value": "atom"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"rss\"",
                                    "value": "rss"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jar\"",
                                    "value": "jar"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"war\"",
                                    "value": "war"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ear\"",
                                    "value": "ear"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"hqx\"",
                                    "value": "hqx"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"doc\"",
                                    "value": "doc"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"docx\"",
                                    "value": "docx"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pdf\"",
                                    "value": "pdf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ps\"",
                                    "value": "ps"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"eps\"",
                                    "value": "eps"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ai\"",
                                    "value": "ai"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"rtf\"",
                                    "value": "rtf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"xls\"",
                                    "value": "xls"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"xlsx\"",
                                    "value": "xlsx"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ppt\"",
                                    "value": "ppt"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pptx\"",
                                    "value": "pptx"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"wmlc\"",
                                    "value": "wmlc"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"kml\"",
                                    "value": "kml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"kmz\"",
                                    "value": "kmz"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"7z\"",
                                    "value": "7z"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"cco\"",
                                    "value": "cco"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jardiff\"",
                                    "value": "jardiff"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"jnlp\"",
                                    "value": "jnlp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"run\"",
                                    "value": "run"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pl\"",
                                    "value": "pl"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pm\"",
                                    "value": "pm"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"prc\"",
                                    "value": "prc"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pdb\"",
                                    "value": "pdb"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"rar\"",
                                    "value": "rar"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"rpm\"",
                                    "value": "rpm"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"sea\"",
                                    "value": "sea"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"swf\"",
                                    "value": "swf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"sit\"",
                                    "value": "sit"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"tcl\"",
                                    "value": "tcl"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"tk\"",
                                    "value": "tk"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"der\"",
                                    "value": "der"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"pem\"",
                                    "value": "pem"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"crt\"",
                                    "value": "crt"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"xpi\"",
                                    "value": "xpi"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"xhtml\"",
                                    "value": "xhtml"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"zip\"",
                                    "value": "zip"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"bin\"",
                                    "value": "bin"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"exe\"",
                                    "value": "exe"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"dll\"",
                                    "value": "dll"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"deb\"",
                                    "value": "deb"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"dmg\"",
                                    "value": "dmg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"eot\"",
                                    "value": "eot"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"iso\"",
                                    "value": "iso"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"img\"",
                                    "value": "img"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"msi\"",
                                    "value": "msi"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"msp\"",
                                    "value": "msp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"msm\"",
                                    "value": "msm"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mid\"",
                                    "value": "mid"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"midi\"",
                                    "value": "midi"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"kar\"",
                                    "value": "kar"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mp3\"",
                                    "value": "mp3"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ogg\"",
                                    "value": "ogg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"ra\"",
                                    "value": "ra"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"3gpp\"",
                                    "value": "3gpp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"3gp\"",
                                    "value": "3gp"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mpeg\"",
                                    "value": "mpeg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mpg\"",
                                    "value": "mpg"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mov\"",
                                    "value": "mov"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"flv\"",
                                    "value": "flv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mng\"",
                                    "value": "mng"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"asx\"",
                                    "value": "asx"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"asf\"",
                                    "value": "asf"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"wmv\"",
                                    "value": "wmv"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"avi\"",
                                    "value": "avi"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"m4v\"",
                                    "value": "m4v"
                                  },
                                  {
                                    "type": "literal",
                                    "alias": "\"mp4\"",
                                    "value": "mp4"
                                  }
                                ]
                              }
                            }
                          ],
                          "optional": false
                        },
                        "maxFileSizeMB": {
                          "type": "primitive",
                          "alias": "number",
                          "subType": "number",
                          "optional": true
                        }
                      }
                    }
                  ],
                  "optional": true,
                  "comments": "If degined then this column is referencing the file table\nExtracted from FileTable config\nUsed in SmartForm"
                },
                "tsDataType": {
                  "type": "union",
                  "alias": "\"string\" | \"number\" | \"boolean\" | \"any\" | \"number[]\" | \"boolean[]\" | \"string[]\" | \"any[]\"",
                  "types": [
                    {
                      "type": "literal",
                      "alias": "\"string\"",
                      "value": "string"
                    },
                    {
                      "type": "literal",
                      "alias": "\"number\"",
                      "value": "number"
                    },
                    {
                      "type": "literal",
                      "alias": "\"boolean\"",
                      "value": "boolean"
                    },
                    {
                      "type": "literal",
                      "alias": "\"any\"",
                      "value": "any"
                    },
                    {
                      "type": "literal",
                      "alias": "\"number[]\"",
                      "value": "number[]"
                    },
                    {
                      "type": "literal",
                      "alias": "\"boolean[]\"",
                      "value": "boolean[]"
                    },
                    {
                      "type": "literal",
                      "alias": "\"string[]\"",
                      "value": "string[]"
                    },
                    {
                      "type": "literal",
                      "alias": "\"any[]\"",
                      "value": "any[]"
                    }
                  ],
                  "optional": false,
                  "comments": "TypeScript data type"
                },
                "select": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be viewed/selected"
                },
                "orderBy": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be ordered by"
                },
                "filter": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be filtered by"
                },
                "insert": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be inserted"
                },
                "update": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be updated"
                },
                "delete": {
                  "type": "union",
                  "alias": "boolean",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "false",
                      "subType": "boolean"
                    }
                  ],
                  "optional": false,
                  "comments": "Can be used in the delete filter"
                }
              }
            }
          }
        },
        "optional": false,
        "comments": "Retrieves columns metadata of the table/view"
      },
      "find": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => Promise<GetSelectReturnType<S, P, T, true>>",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetSelectReturnType<S, P, T, true>>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "primitive",
            "alias": "GetSelectReturnType<S, P, T, true>",
            "aliasSymbolescapedName": "GetSelectReturnType",
            "subType": "any"
          }
        },
        "optional": false,
        "comments": "Retrieves a list of matching records from the view/table"
      },
      "findOne": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => Promise<GetSelectReturnType<S, P, T, false> | undefined>",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetSelectReturnType<S, P, T, false> | undefined>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "union",
            "alias": "GetSelectReturnType<S, P, T, false> | undefined",
            "types": [
              {
                "type": "primitive",
                "alias": "undefined",
                "subType": "undefined"
              },
              {
                "type": "primitive",
                "alias": "GetSelectReturnType<S, P, T, false>",
                "aliasSymbolescapedName": "GetSelectReturnType",
                "subType": "any"
              }
            ]
          }
        },
        "optional": false,
        "comments": "Retrieves a record from the view/table"
      },
      "subscribe": {
        "type": "function",
        "alias": "<P extends SubscribeParams<T, S>>(filter: FullFilter<T, S>, params: P, onData: (items: GetSelectReturnType<S, P, T, true>) => any, onError?: OnError | undefined) => Promise<...>",
        "arguments": [
          {
            "name": "filter",
            "optional": false,
            "type": "reference",
            "alias": "FullFilter<T, S>",
            "aliasSymbolescapedName": "FullFilter",
            "comments": "Group or simple filter"
          },
          {
            "name": "params",
            "optional": false,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          },
          {
            "name": "onData",
            "optional": false,
            "type": "function",
            "alias": "(items: GetSelectReturnType<S, P, T, true>) => any",
            "arguments": [
              {
                "name": "items",
                "optional": false,
                "type": "primitive",
                "alias": "GetSelectReturnType<S, P, T, true>",
                "aliasSymbolescapedName": "GetSelectReturnType",
                "subType": "any",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "any",
              "subType": "any"
            },
            "comments": ""
          },
          {
            "name": "onError",
            "optional": true,
            "type": "function",
            "alias": "OnError",
            "aliasSymbolescapedName": "OnError",
            "arguments": [
              {
                "name": "err",
                "optional": false,
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<SubscriptionHandler>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "object",
            "alias": "SubscriptionHandler",
            "aliasSymbolescapedName": "SubscriptionHandler",
            "comments": "",
            "properties": {
              "unsubscribe": {
                "type": "function",
                "alias": "() => Promise<any>",
                "arguments": [],
                "returnType": {
                  "type": "promise",
                  "alias": "Promise<any>",
                  "comments": "Represents the completion of an asynchronous operation",
                  "innerType": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any"
                  }
                },
                "optional": false
              },
              "filter": {
                "type": "union",
                "alias": "{} | FullFilter<void, void>",
                "types": [
                  {
                    "type": "object",
                    "alias": "{}",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "ComplexFilter",
                    "aliasSymbolescapedName": "ComplexFilter",
                    "comments": "Complex filter that allows applying functions to columns",
                    "properties": {
                      "$filter": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "{ $and: FullFilter<void, void>[]; }",
                    "properties": {
                      "$and": {
                        "type": "array",
                        "alias": "FullFilter<void, void>[]",
                        "itemType": {
                          "type": "reference",
                          "alias": "FullFilter<void, void>",
                          "aliasSymbolescapedName": "FullFilter",
                          "comments": "Group or simple filter"
                        },
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "{ $or: FullFilter<void, void>[]; }",
                    "properties": {
                      "$or": {
                        "type": "reference",
                        "alias": "FullFilter<void, void>[]",
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "NormalFilter<AnyObject>",
                    "aliasSymbolescapedName": "NormalFilter",
                    "comments": "Column filter with operators\nMultiple columns are combined with AND",
                    "properties": {
                      "$filter": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }>",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {},
                    "intersectionParent": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.@@`]: any; [x: `${string}.@>`]: any; [x: `${string}.<@`]: any; [x: `${string}.$contains`]: any; [x: `${string}.$containedBy`]: any; }>"
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.$ilike`]: any; [x: `${string}.$like`]: any; [x: `${string}.$nilike`]: any; [x: `${string}.$nlike`]: any; }>",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.@@`]: any; [x: `${string}.@>`]: any; [x: `${string}.<@`]: any; [x: `${string}.$contains`]: any; [x: `${string}.$containedBy`]: any; }>",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ $exists: any; $notExists: any; $existsJoined: any; $notExistsJoined: any; }>",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {
                      "$exists": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$notExists": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$existsJoined": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$notExistsJoined": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      }
                    }
                  }
                ],
                "optional": false
              }
            }
          }
        },
        "optional": false,
        "comments": "Retrieves a list of matching records from the view/table and subscribes to changes"
      },
      "subscribeOne": {
        "type": "function",
        "alias": "<P extends SubscribeParams<T, S>>(filter: FullFilter<T, S>, params: P, onData: (item: GetSelectReturnType<S, P, T, false> | undefined) => any, onError?: OnError | undefined) => Promise<...>",
        "arguments": [
          {
            "name": "filter",
            "optional": false,
            "type": "reference",
            "alias": "FullFilter<T, S>",
            "aliasSymbolescapedName": "FullFilter",
            "comments": "Group or simple filter"
          },
          {
            "name": "params",
            "optional": false,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          },
          {
            "name": "onData",
            "optional": false,
            "type": "function",
            "alias": "(item: GetSelectReturnType<S, P, T, false> | undefined) => any",
            "arguments": [
              {
                "name": "item",
                "optional": false,
                "type": "union",
                "alias": "GetSelectReturnType<S, P, T, false> | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "GetSelectReturnType<S, P, T, false>",
                    "aliasSymbolescapedName": "GetSelectReturnType",
                    "subType": "any"
                  }
                ],
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "any",
              "subType": "any"
            },
            "comments": ""
          },
          {
            "name": "onError",
            "optional": true,
            "type": "function",
            "alias": "OnError",
            "aliasSymbolescapedName": "OnError",
            "arguments": [
              {
                "name": "err",
                "optional": false,
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<SubscriptionHandler>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "object",
            "alias": "SubscriptionHandler",
            "aliasSymbolescapedName": "SubscriptionHandler",
            "comments": "",
            "properties": {
              "unsubscribe": {
                "type": "function",
                "alias": "() => Promise<any>",
                "arguments": [],
                "returnType": {
                  "type": "promise",
                  "alias": "Promise<any>",
                  "comments": "Represents the completion of an asynchronous operation",
                  "innerType": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any"
                  }
                },
                "optional": false
              },
              "filter": {
                "type": "union",
                "alias": "{} | FullFilter<void, void>",
                "types": [
                  {
                    "type": "object",
                    "alias": "{}",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "ComplexFilter",
                    "aliasSymbolescapedName": "ComplexFilter",
                    "comments": "Complex filter that allows applying functions to columns",
                    "properties": {
                      "$filter": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "{ $and: FullFilter<void, void>[]; }",
                    "properties": {
                      "$and": {
                        "type": "array",
                        "alias": "FullFilter<void, void>[]",
                        "itemType": {
                          "type": "reference",
                          "alias": "FullFilter<void, void>",
                          "aliasSymbolescapedName": "FullFilter",
                          "comments": "Group or simple filter"
                        },
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "{ $or: FullFilter<void, void>[]; }",
                    "properties": {
                      "$or": {
                        "type": "reference",
                        "alias": "FullFilter<void, void>[]",
                        "optional": false
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "NormalFilter<AnyObject>",
                    "aliasSymbolescapedName": "NormalFilter",
                    "comments": "Column filter with operators\nMultiple columns are combined with AND",
                    "properties": {
                      "$filter": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      }
                    }
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }>",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {},
                    "intersectionParent": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.@@`]: any; [x: `${string}.@>`]: any; [x: `${string}.<@`]: any; [x: `${string}.$contains`]: any; [x: `${string}.$containedBy`]: any; }>"
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.=`]: any; [x: `${string}.$eq`]: any; [x: `${string}.<>`]: any; [x: `${string}.>`]: any; [x: `${string}.<`]: any; [x: `${string}.>=`]: any; [x: `${string}.<=`]: any; [x: `${string}.$ne`]: any; [x: `${string}.$gt`]: any; [x: `${string}.$gte`]: any; [x: `${string}.$lt`]: any; [x: `${string}.$lt...",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.$ilike`]: any; [x: `${string}.$like`]: any; [x: `${string}.$nilike`]: any; [x: `${string}.$nlike`]: any; }>",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ [x: `${string}.$in`]: any[]; [x: `${string}.$nin`]: any[]; }> & Partial<{ [x: `${string}.@@`]: any; [x: `${string}.@>`]: any; [x: `${string}.<@`]: any; [x: `${string}.$contains`]: any; [x: `${string}.$containedBy`]: any; }>",
                    "properties": {}
                  },
                  {
                    "type": "object",
                    "alias": "Partial<{ $exists: any; $notExists: any; $existsJoined: any; $notExistsJoined: any; }>",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {
                      "$exists": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$notExists": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$existsJoined": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$notExistsJoined": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      }
                    }
                  }
                ],
                "optional": false
              }
            }
          }
        },
        "optional": false,
        "comments": "Retrieves first matching record from the view/table and subscribes to changes"
      },
      "count": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => Promise<number>",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<number>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "primitive",
            "alias": "number",
            "subType": "number"
          }
        },
        "optional": false,
        "comments": "Returns the number of rows that match the filter"
      },
      "size": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => Promise<string>",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<string>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "primitive",
            "alias": "string",
            "subType": "string"
          }
        },
        "optional": false,
        "comments": "Returns result size in bits"
      },
      "getJoinedTables": {
        "type": "function",
        "alias": "() => string[]",
        "arguments": [],
        "returnType": {
          "type": "array",
          "alias": "string[]",
          "itemType": {
            "type": "primitive",
            "alias": "string",
            "subType": "string"
          }
        },
        "optional": false
      },
      "_syncInfo": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "getSync": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "sync": {
        "type": "function",
        "alias": "Sync<T>",
        "aliasSymbolescapedName": "Sync",
        "arguments": [
          {
            "name": "basicFilter",
            "optional": false,
            "type": "object",
            "alias": "EqualityFilter<T>",
            "aliasSymbolescapedName": "EqualityFilter",
            "comments": "Equality filter used for sync\nMultiple columns are combined with AND",
            "properties": {}
          },
          {
            "name": "options",
            "optional": false,
            "type": "reference",
            "alias": "SyncOptions",
            "aliasSymbolescapedName": "SyncOptions",
            "comments": ""
          },
          {
            "name": "onChange",
            "optional": false,
            "type": "function",
            "alias": "(data: SyncDataItem<Required<T>, false>[], delta?: Partial<T>[] | undefined) => any",
            "arguments": [
              {
                "name": "data",
                "optional": false,
                "type": "array",
                "alias": "SyncDataItem<Required<T>, false>[]",
                "itemType": {
                  "type": "object",
                  "alias": "SyncDataItem<Required<T>, false>",
                  "aliasSymbolescapedName": "SyncDataItem",
                  "properties": {
                    "$get": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$find": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$unsync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$delete": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$update": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$cloneSync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$cloneMultiSync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    }
                  }
                },
                "comments": ""
              },
              {
                "name": "delta",
                "optional": true,
                "type": "array",
                "alias": "Partial<T>[]",
                "itemType": {
                  "type": "object",
                  "alias": "Partial<T>",
                  "aliasSymbolescapedName": "Partial",
                  "comments": "Make all properties in T optional",
                  "properties": {}
                },
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "any",
              "subType": "any"
            },
            "comments": ""
          },
          {
            "name": "onError",
            "optional": true,
            "type": "function",
            "alias": "(error: any) => void",
            "arguments": [
              {
                "name": "error",
                "optional": false,
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<{ $unsync: () => void; $upsert: (newData: T[]) => any; getItems: () => T[]; }>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "object",
            "alias": "{ $unsync: () => void; $upsert: (newData: T[]) => any; getItems: () => T[]; }",
            "properties": {
              "$unsync": {
                "type": "function",
                "alias": "() => void",
                "arguments": [],
                "returnType": {
                  "type": "primitive",
                  "alias": "void",
                  "subType": "any"
                },
                "optional": false
              },
              "$upsert": {
                "type": "function",
                "alias": "(newData: T[]) => any",
                "arguments": [
                  {
                    "name": "newData",
                    "optional": false,
                    "type": "array",
                    "alias": "T[]",
                    "itemType": {
                      "type": "object",
                      "alias": "AnyObject",
                      "aliasSymbolescapedName": "AnyObject",
                      "comments": "",
                      "properties": {},
                      "intersectionParent": "SyncDataItem"
                    },
                    "comments": ""
                  }
                ],
                "returnType": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any"
                },
                "optional": false
              },
              "getItems": {
                "type": "function",
                "alias": "() => T[]",
                "arguments": [],
                "returnType": {
                  "type": "array",
                  "alias": "T[]",
                  "itemType": {
                    "type": "object",
                    "alias": "AnyObject",
                    "aliasSymbolescapedName": "AnyObject",
                    "comments": "",
                    "properties": {},
                    "intersectionParent": "SyncDataItem"
                  }
                },
                "optional": false
              }
            }
          }
        },
        "optional": true
      },
      "useSync": {
        "type": "function",
        "alias": "(basicFilter: EqualityFilter<T>, syncOptions: SyncOptions) => { data: SyncDataItem<Required<T>>[] | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "basicFilter",
            "optional": false,
            "type": "object",
            "alias": "EqualityFilter<T>",
            "aliasSymbolescapedName": "EqualityFilter",
            "comments": "Equality filter used for sync\nMultiple columns are combined with AND",
            "properties": {}
          },
          {
            "name": "syncOptions",
            "optional": false,
            "type": "reference",
            "alias": "SyncOptions",
            "aliasSymbolescapedName": "SyncOptions",
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: SyncDataItem<Required<T>>[] | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "SyncDataItem<Required<T>>[] | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "array",
                  "alias": "SyncDataItem<Required<T>>[]",
                  "itemType": {
                    "type": "object",
                    "alias": "SyncDataItem<Required<T>>",
                    "aliasSymbolescapedName": "SyncDataItem",
                    "properties": {
                      "$get": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$find": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$unsync": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$delete": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$update": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$cloneSync": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      },
                      "$cloneMultiSync": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "optional": true
                      }
                    }
                  }
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": true,
        "comments": "Retrieves rows matching the filter and keeps them in sync\n- use { handlesOnData: true } to get optimistic updates method: $update\n- any changes to the row using the $update method will be reflected instantly\n   to all sync subscribers that were initiated with the same syncOptions"
      },
      "syncOne": {
        "type": "function",
        "alias": "SyncOne<T>",
        "aliasSymbolescapedName": "SyncOne",
        "arguments": [
          {
            "name": "basicFilter",
            "optional": false,
            "type": "object",
            "alias": "Partial<T>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "properties": {}
          },
          {
            "name": "options",
            "optional": false,
            "type": "reference",
            "alias": "SyncOneOptions",
            "aliasSymbolescapedName": "SyncOneOptions",
            "comments": ""
          },
          {
            "name": "onChange",
            "optional": false,
            "type": "function",
            "alias": "(data: SyncDataItem<Required<T>, false>, delta?: Partial<T> | undefined) => any",
            "arguments": [
              {
                "name": "data",
                "optional": false,
                "type": "object",
                "alias": "SyncDataItem<Required<T>, false>",
                "aliasSymbolescapedName": "SyncDataItem",
                "properties": {
                  "$get": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$find": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$unsync": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$delete": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$update": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$cloneSync": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  },
                  "$cloneMultiSync": {
                    "type": "primitive",
                    "alias": "any",
                    "subType": "any",
                    "optional": true
                  }
                },
                "comments": ""
              },
              {
                "name": "delta",
                "optional": true,
                "type": "object",
                "alias": "Partial<T>",
                "aliasSymbolescapedName": "Partial",
                "comments": "Make all properties in T optional",
                "properties": {}
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "any",
              "subType": "any"
            },
            "comments": ""
          },
          {
            "name": "onError",
            "optional": true,
            "type": "function",
            "alias": "(error: any) => void",
            "arguments": [
              {
                "name": "error",
                "optional": false,
                "type": "primitive",
                "alias": "any",
                "subType": "any",
                "comments": ""
              }
            ],
            "returnType": {
              "type": "primitive",
              "alias": "void",
              "subType": "any"
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<SingleSyncHandles<T, false>>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "object",
            "alias": "SingleSyncHandles<T, false>",
            "aliasSymbolescapedName": "SingleSyncHandles",
            "comments": "CRUD handles added if initialised with handlesOnData = true",
            "properties": {
              "$get": {
                "type": "function",
                "alias": "() => T | undefined",
                "arguments": [],
                "returnType": {
                  "type": "union",
                  "alias": "T | undefined",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "undefined",
                      "subType": "undefined"
                    },
                    {
                      "type": "object",
                      "alias": "AnyObject",
                      "aliasSymbolescapedName": "AnyObject",
                      "comments": "",
                      "properties": {},
                      "intersectionParent": "SyncDataItem"
                    }
                  ]
                },
                "optional": false
              },
              "$find": {
                "type": "function",
                "alias": "(idObj: Partial<T>) => T | undefined",
                "arguments": [
                  {
                    "name": "idObj",
                    "optional": false,
                    "type": "object",
                    "alias": "Partial<T>",
                    "aliasSymbolescapedName": "Partial",
                    "comments": "Make all properties in T optional",
                    "properties": {}
                  }
                ],
                "returnType": {
                  "type": "union",
                  "alias": "T | undefined",
                  "types": [
                    {
                      "type": "primitive",
                      "alias": "undefined",
                      "subType": "undefined"
                    },
                    {
                      "type": "object",
                      "alias": "AnyObject",
                      "aliasSymbolescapedName": "AnyObject",
                      "comments": "",
                      "properties": {},
                      "intersectionParent": "SyncDataItem"
                    }
                  ]
                },
                "optional": false
              },
              "$unsync": {
                "type": "function",
                "alias": "() => any",
                "arguments": [],
                "returnType": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any"
                },
                "optional": false
              },
              "$delete": {
                "type": "function",
                "alias": "() => void",
                "arguments": [],
                "returnType": {
                  "type": "primitive",
                  "alias": "void",
                  "subType": "any"
                },
                "optional": false
              },
              "$update": {
                "type": "function",
                "alias": "<OPTS extends $UpdateOpts>(newData: OPTS extends { deepMerge: true; } ? DeepPartial<T> : Partial<T>, opts?: OPTS | undefined) => any",
                "arguments": [
                  {
                    "name": "newData",
                    "optional": false,
                    "type": "primitive",
                    "alias": "OPTS extends { deepMerge: true; } ? DeepPartial<T> : Partial<T>",
                    "subType": "any",
                    "comments": ""
                  },
                  {
                    "name": "opts",
                    "optional": true,
                    "type": "object",
                    "alias": "$UpdateOpts",
                    "aliasSymbolescapedName": "$UpdateOpts",
                    "comments": "",
                    "properties": {
                      "deepMerge": {
                        "type": "union",
                        "alias": "boolean",
                        "types": [
                          {
                            "type": "primitive",
                            "alias": "false",
                            "subType": "boolean"
                          }
                        ],
                        "optional": false
                      }
                    }
                  }
                ],
                "returnType": {
                  "type": "primitive",
                  "alias": "any",
                  "subType": "any"
                },
                "optional": false
              },
              "$cloneSync": {
                "type": "function",
                "alias": "CloneSync<T, false>",
                "aliasSymbolescapedName": "CloneSync",
                "arguments": [
                  {
                    "name": "onChange",
                    "optional": false,
                    "type": "function",
                    "alias": "SingleChangeListener<T, false>",
                    "aliasSymbolescapedName": "SingleChangeListener",
                    "arguments": [
                      {
                        "name": "item",
                        "optional": false,
                        "type": "object",
                        "alias": "SyncDataItem<T, false>",
                        "aliasSymbolescapedName": "SyncDataItem",
                        "properties": {
                          "$get": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$find": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$unsync": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$delete": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$update": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$cloneSync": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          },
                          "$cloneMultiSync": {
                            "type": "primitive",
                            "alias": "any",
                            "subType": "any",
                            "optional": true
                          }
                        },
                        "comments": ""
                      },
                      {
                        "name": "delta",
                        "optional": true,
                        "type": "primitive",
                        "alias": "DeepPartial<T>",
                        "aliasSymbolescapedName": "DeepPartial",
                        "subType": "any",
                        "comments": ""
                      }
                    ],
                    "returnType": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any"
                    },
                    "comments": ""
                  },
                  {
                    "name": "onError",
                    "optional": true,
                    "type": "function",
                    "alias": "(error: any) => void",
                    "arguments": [
                      {
                        "name": "error",
                        "optional": false,
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "comments": ""
                      }
                    ],
                    "returnType": {
                      "type": "primitive",
                      "alias": "void",
                      "subType": "any"
                    },
                    "comments": ""
                  }
                ],
                "returnType": {
                  "type": "reference",
                  "alias": "SingleSyncHandles<T, false>",
                  "aliasSymbolescapedName": "SingleSyncHandles",
                  "comments": "CRUD handles added if initialised with handlesOnData = true"
                },
                "optional": false
              },
              "$cloneMultiSync": {
                "type": "function",
                "alias": "CloneMultiSync<T>",
                "aliasSymbolescapedName": "CloneMultiSync",
                "arguments": [
                  {
                    "name": "onChange",
                    "optional": false,
                    "type": "function",
                    "alias": "MultiChangeListener<T>",
                    "aliasSymbolescapedName": "MultiChangeListener",
                    "arguments": [
                      {
                        "name": "items",
                        "optional": false,
                        "type": "array",
                        "alias": "SyncDataItem<T, false>[]",
                        "itemType": {
                          "type": "object",
                          "alias": "SyncDataItem<T, false>",
                          "aliasSymbolescapedName": "SyncDataItem",
                          "properties": {
                            "$get": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$find": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$unsync": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$delete": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$update": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$cloneSync": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            },
                            "$cloneMultiSync": {
                              "type": "primitive",
                              "alias": "any",
                              "subType": "any",
                              "optional": true
                            }
                          }
                        },
                        "comments": ""
                      },
                      {
                        "name": "delta",
                        "optional": false,
                        "type": "array",
                        "alias": "DeepPartial<T>[]",
                        "itemType": {
                          "type": "primitive",
                          "alias": "DeepPartial<T>",
                          "aliasSymbolescapedName": "DeepPartial",
                          "subType": "any"
                        },
                        "comments": ""
                      }
                    ],
                    "returnType": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any"
                    },
                    "comments": ""
                  },
                  {
                    "name": "onError",
                    "optional": true,
                    "type": "function",
                    "alias": "(error: any) => void",
                    "arguments": [
                      {
                        "name": "error",
                        "optional": false,
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any",
                        "comments": ""
                      }
                    ],
                    "returnType": {
                      "type": "primitive",
                      "alias": "void",
                      "subType": "any"
                    },
                    "comments": ""
                  }
                ],
                "returnType": {
                  "type": "object",
                  "alias": "MultiSyncHandles<T>",
                  "aliasSymbolescapedName": "MultiSyncHandles",
                  "comments": "",
                  "properties": {
                    "$unsync": {
                      "type": "function",
                      "alias": "() => void",
                      "arguments": [],
                      "returnType": {
                        "type": "primitive",
                        "alias": "void",
                        "subType": "any"
                      },
                      "optional": false
                    },
                    "$upsert": {
                      "type": "function",
                      "alias": "(newData: T[]) => any",
                      "arguments": [
                        {
                          "name": "newData",
                          "optional": false,
                          "type": "array",
                          "alias": "T[]",
                          "itemType": {
                            "type": "object",
                            "alias": "AnyObject",
                            "aliasSymbolescapedName": "AnyObject",
                            "comments": "",
                            "properties": {},
                            "intersectionParent": "SyncDataItem"
                          },
                          "comments": ""
                        }
                      ],
                      "returnType": {
                        "type": "primitive",
                        "alias": "any",
                        "subType": "any"
                      },
                      "optional": false
                    },
                    "getItems": {
                      "type": "function",
                      "alias": "() => AnyObject[]",
                      "arguments": [],
                      "returnType": {
                        "type": "array",
                        "alias": "AnyObject[]",
                        "itemType": {
                          "type": "object",
                          "alias": "AnyObject",
                          "aliasSymbolescapedName": "AnyObject",
                          "comments": "",
                          "properties": {}
                        }
                      },
                      "optional": false
                    }
                  }
                },
                "optional": false
              }
            }
          }
        },
        "optional": true
      },
      "useSyncOne": {
        "type": "function",
        "alias": "(basicFilter: EqualityFilter<T>, syncOptions: SyncOneOptions) => { data: SyncDataItem<Required<T>> | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "basicFilter",
            "optional": false,
            "type": "object",
            "alias": "EqualityFilter<T>",
            "aliasSymbolescapedName": "EqualityFilter",
            "comments": "Equality filter used for sync\nMultiple columns are combined with AND",
            "properties": {}
          },
          {
            "name": "syncOptions",
            "optional": false,
            "type": "reference",
            "alias": "SyncOneOptions",
            "aliasSymbolescapedName": "SyncOneOptions",
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: SyncDataItem<Required<T>> | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "SyncDataItem<Required<T>> | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "object",
                  "alias": "SyncDataItem<Required<T>>",
                  "aliasSymbolescapedName": "SyncDataItem",
                  "properties": {
                    "$get": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$find": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$unsync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$delete": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$update": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$cloneSync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    },
                    "$cloneMultiSync": {
                      "type": "primitive",
                      "alias": "any",
                      "subType": "any",
                      "optional": true
                    }
                  }
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": true,
        "comments": "Retrieves the first row matching the filter and keeps it in sync\n- use { handlesOnData: true } to get optimistic updates method: $update\n- any changes to the row using the $update method will be reflected instantly\n   to all sync subscribers that were initiated with the same syncOptions"
      },
      "_sync": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "useSubscribe": {
        "type": "function",
        "alias": "<SubParams extends SubscribeParams<T, S>>(filter?: FullFilter<T, S> | undefined, options?: SubParams | undefined) => { data: GetSelectReturnType<S, SubParams, T, true> | undefined; error?: any; isLoading: boolean; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "options",
            "optional": true,
            "type": "object",
            "alias": "SubscribeParams<T, S>",
            "aliasSymbolescapedName": "SubscribeParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              },
              "throttle": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "If true then the subscription will be throttled to the provided number of milliseconds"
              },
              "throttleOpts": {
                "type": "object",
                "alias": "{ skipFirst?: boolean | undefined; }",
                "properties": {
                  "skipFirst": {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean",
                    "optional": true,
                    "comments": "False by default.\nIf true then the first value will be emitted at the end of the interval. Instant otherwise"
                  }
                },
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: GetSelectReturnType<S, SubParams, T, true> | undefined; error?: any; isLoading: boolean; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "GetSelectReturnType<S, SubParams, T, true> | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "GetSelectReturnType<S, SubParams, T, true>",
                  "aliasSymbolescapedName": "GetSelectReturnType",
                  "subType": "any"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            }
          }
        },
        "optional": false,
        "comments": "Retrieves a list of matching records from the view/table and subscribes to changes"
      },
      "useSubscribeOne": {
        "type": "function",
        "alias": "<SubParams extends SubscribeParams<T, S>>(filter?: FullFilter<T, S> | undefined, options?: SubParams | undefined) => { data: GetSelectReturnType<S, SubParams, T, false> | undefined; error?: any; isLoading: boolean; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "options",
            "optional": true,
            "type": "object",
            "alias": "SubscribeParams<T, S>",
            "aliasSymbolescapedName": "SubscribeParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              },
              "throttle": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "If true then the subscription will be throttled to the provided number of milliseconds"
              },
              "throttleOpts": {
                "type": "object",
                "alias": "{ skipFirst?: boolean | undefined; }",
                "properties": {
                  "skipFirst": {
                    "type": "primitive",
                    "alias": "false",
                    "subType": "boolean",
                    "optional": true,
                    "comments": "False by default.\nIf true then the first value will be emitted at the end of the interval. Instant otherwise"
                  }
                },
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: GetSelectReturnType<S, SubParams, T, false> | undefined; error?: any; isLoading: boolean; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "GetSelectReturnType<S, SubParams, T, false> | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "GetSelectReturnType<S, SubParams, T, false>",
                  "aliasSymbolescapedName": "GetSelectReturnType",
                  "subType": "any"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            }
          }
        },
        "optional": false,
        "comments": "Retrieves a matching record from the view/table and subscribes to changes"
      },
      "useFind": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => { data: GetSelectReturnType<S, P, T, true> | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: GetSelectReturnType<S, P, T, true> | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "GetSelectReturnType<S, P, T, true> | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "GetSelectReturnType<S, P, T, true>",
                  "aliasSymbolescapedName": "GetSelectReturnType",
                  "subType": "any"
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": false,
        "comments": "Retrieves a list of matching records from the view/table"
      },
      "useFindOne": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => { data: GetSelectReturnType<S, P, T, false> | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: GetSelectReturnType<S, P, T, false> | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "GetSelectReturnType<S, P, T, false> | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "GetSelectReturnType<S, P, T, false>",
                  "aliasSymbolescapedName": "GetSelectReturnType",
                  "subType": "any"
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": false,
        "comments": "Retrieves first matching record from the view/table"
      },
      "useCount": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => { data: number | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: number | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "number | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "number",
                  "subType": "number"
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": false,
        "comments": "Returns the total number of rows matching the filter"
      },
      "useSize": {
        "type": "function",
        "alias": "<P extends SelectParams<T, S>>(filter?: FullFilter<T, S> | undefined, selectParams?: P | undefined) => { data: string | undefined; isLoading: boolean; error?: any; }",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "selectParams",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "object",
          "alias": "{ data: string | undefined; isLoading: boolean; error?: any; }",
          "properties": {
            "data": {
              "type": "union",
              "alias": "string | undefined",
              "types": [
                {
                  "type": "primitive",
                  "alias": "undefined",
                  "subType": "undefined"
                },
                {
                  "type": "primitive",
                  "alias": "string",
                  "subType": "string"
                }
              ],
              "optional": false
            },
            "isLoading": {
              "type": "union",
              "alias": "boolean",
              "types": [
                {
                  "type": "primitive",
                  "alias": "false",
                  "subType": "boolean"
                }
              ],
              "optional": false
            },
            "error": {
              "type": "primitive",
              "alias": "any",
              "subType": "any",
              "optional": true
            }
          }
        },
        "optional": false,
        "comments": "Returns result size in bits matching the filter and selectParams"
      },
      "update": {
        "type": "function",
        "alias": "<P extends UpdateParams<T, S>>(filter: FullFilter<T, S>, newData: Partial<UpsertDataToPGCast<T>>, params?: P | undefined) => Promise<...>",
        "arguments": [
          {
            "name": "filter",
            "optional": false,
            "type": "reference",
            "alias": "FullFilter<T, S>",
            "aliasSymbolescapedName": "FullFilter",
            "comments": "Group or simple filter"
          },
          {
            "name": "newData",
            "optional": false,
            "type": "object",
            "alias": "Partial<UpsertDataToPGCast<T>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "properties": {}
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetUpdateReturnType<P, T, S> | undefined>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "union",
            "alias": "GetUpdateReturnType<P, T, S> | undefined",
            "types": [
              {
                "type": "primitive",
                "alias": "undefined",
                "subType": "undefined"
              },
              {
                "type": "primitive",
                "alias": "GetUpdateReturnType<P, T, S>",
                "aliasSymbolescapedName": "GetUpdateReturnType",
                "subType": "any"
              }
            ]
          }
        },
        "optional": false,
        "comments": "Updates a record in the table based on the specified filter criteria\n- Use { multi: false } to ensure no more than one row is updated"
      },
      "updateBatch": {
        "type": "function",
        "alias": "<P extends UpdateParams<T, S>>(data: [FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][], params?: P | undefined) => Promise<...>",
        "arguments": [
          {
            "name": "data",
            "optional": false,
            "type": "tuple",
            "alias": "[FullFilter<T, S>, Partial<UpsertDataToPGCast<T>>][]",
            "itemTypes": [
              {
                "type": "reference",
                "alias": "FullFilter<T, S>",
                "aliasSymbolescapedName": "FullFilter",
                "comments": "Group or simple filter"
              },
              {
                "type": "object",
                "alias": "Partial<UpsertDataToPGCast<T>>",
                "aliasSymbolescapedName": "Partial",
                "comments": "Make all properties in T optional",
                "properties": {}
              }
            ],
            "comments": ""
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<void | GetUpdateReturnType<P, T, S>>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "union",
            "alias": "void | GetUpdateReturnType<P, T, S>",
            "types": [
              {
                "type": "primitive",
                "alias": "void",
                "subType": "any"
              },
              {
                "type": "primitive",
                "alias": "GetUpdateReturnType<P, T, S>",
                "aliasSymbolescapedName": "GetUpdateReturnType",
                "subType": "any"
              }
            ]
          }
        },
        "optional": false,
        "comments": "Updates multiple records in the table in a batch operation.\n- Each item in the `data` array contains a filter and the corresponding data to update."
      },
      "insert": {
        "type": "function",
        "alias": "<P extends InsertParams<T, S>, D extends InsertData<T>>(data: D, params?: P | undefined) => Promise<GetInsertReturnType<D, P, T, S>>",
        "arguments": [
          {
            "name": "data",
            "optional": false,
            "type": "union",
            "alias": "InsertData<T>",
            "aliasSymbolescapedName": "InsertData",
            "types": [
              {
                "type": "object",
                "alias": "UpsertDataToPGCast<T>",
                "aliasSymbolescapedName": "UpsertDataToPGCast",
                "comments": "",
                "properties": {}
              },
              {
                "type": "array",
                "alias": "UpsertDataToPGCast<T>[]",
                "itemType": {
                  "type": "object",
                  "alias": "UpsertDataToPGCast<T>",
                  "aliasSymbolescapedName": "UpsertDataToPGCast",
                  "comments": "",
                  "properties": {}
                }
              }
            ],
            "comments": ""
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetInsertReturnType<D, P, T, S>>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "primitive",
            "alias": "GetInsertReturnType<D, P, T, S>",
            "aliasSymbolescapedName": "GetInsertReturnType",
            "subType": "any"
          }
        },
        "optional": false,
        "comments": "Inserts a new record into the table."
      },
      "upsert": {
        "type": "function",
        "alias": "<P extends UpdateParams<T, S>>(filter: FullFilter<T, S>, newData: Partial<UpsertDataToPGCast<T>>, params?: P | undefined) => Promise<...>",
        "arguments": [
          {
            "name": "filter",
            "optional": false,
            "type": "reference",
            "alias": "FullFilter<T, S>",
            "aliasSymbolescapedName": "FullFilter",
            "comments": "Group or simple filter"
          },
          {
            "name": "newData",
            "optional": false,
            "type": "object",
            "alias": "Partial<UpsertDataToPGCast<T>>",
            "aliasSymbolescapedName": "Partial",
            "comments": "Make all properties in T optional",
            "properties": {}
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetUpdateReturnType<P, T, S> | undefined>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "union",
            "alias": "GetUpdateReturnType<P, T, S> | undefined",
            "types": [
              {
                "type": "primitive",
                "alias": "undefined",
                "subType": "undefined"
              },
              {
                "type": "primitive",
                "alias": "GetUpdateReturnType<P, T, S>",
                "aliasSymbolescapedName": "GetUpdateReturnType",
                "subType": "any"
              }
            ]
          }
        },
        "optional": false,
        "comments": "Inserts or updates a record in the table.\n- If a record matching the `filter` exists, it updates the record.\n- If no matching record exists, it inserts a new record."
      },
      "delete": {
        "type": "function",
        "alias": "<P extends DeleteParams<T, S>>(filter?: FullFilter<T, S> | undefined, params?: P | undefined) => Promise<GetUpdateReturnType<P, T, S> | undefined>",
        "arguments": [
          {
            "name": "filter",
            "optional": true,
            "type": "reference",
            "alias": "FullFilter<T, S> | undefined",
            "comments": ""
          },
          {
            "name": "params",
            "optional": true,
            "type": "object",
            "alias": "SelectParams<T, S>",
            "aliasSymbolescapedName": "SelectParams",
            "properties": {
              "limit": {
                "type": "union",
                "alias": "number | null | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "primitive",
                    "alias": "null",
                    "subType": "null"
                  },
                  {
                    "type": "primitive",
                    "alias": "number",
                    "subType": "number"
                  }
                ],
                "optional": true,
                "comments": "Max number of rows to return\n- If undefined then 1000 will be applied as the default\n- On client publish rules can affect this behaviour: cannot request more than the maxLimit (if present)"
              },
              "offset": {
                "type": "primitive",
                "alias": "number",
                "subType": "number",
                "optional": true,
                "comments": "Number of rows to skip"
              },
              "groupBy": {
                "type": "primitive",
                "alias": "false",
                "subType": "boolean",
                "optional": true,
                "comments": "Will group by all non aggregated fields specified in select (or all fields by default)"
              },
              "returnType": {
                "type": "union",
                "alias": "\"row\" | \"value\" | \"values\" | \"statement\" | \"statement-no-rls\" | \"statement-where\" | undefined",
                "types": [
                  {
                    "type": "primitive",
                    "alias": "undefined",
                    "subType": "undefined"
                  },
                  {
                    "type": "literal",
                    "alias": "\"row\"",
                    "value": "row"
                  },
                  {
                    "type": "literal",
                    "alias": "\"value\"",
                    "value": "value"
                  },
                  {
                    "type": "literal",
                    "alias": "\"values\"",
                    "value": "values"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement\"",
                    "value": "statement"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-no-rls\"",
                    "value": "statement-no-rls"
                  },
                  {
                    "type": "literal",
                    "alias": "\"statement-where\"",
                    "value": "statement-where"
                  }
                ],
                "optional": true,
                "comments": "Result data structure/type:\n- row: the first row as an object\n- value: the first value from of first field\n- values: array of values from the selected field\n- statement: sql statement\n- statement-no-rls: sql statement without row level security\n- statement-where: sql statement where condition"
              },
              "select": {
                "type": "primitive",
                "alias": "Select<T, S>",
                "aliasSymbolescapedName": "Select",
                "comments": "Fields/expressions/linked data to select\n- If empty then all fields will be selected\n- If \"*\" then all fields will be selected\n- If { field: 0 } then all fields except the specified field will be selected\n- If { field: 1 } then only the specified field will be selected\n- If { field: { funcName: [args] } } then the field will be selected with the specified function applied\n- If { field: { nestedTable: { field: 1 } } } then the field will be selected with the nested table fields",
                "subType": "any",
                "optional": true
              },
              "orderBy": {
                "type": "primitive",
                "alias": "OrderBy<S extends DBSchema ? T : void>",
                "aliasSymbolescapedName": "OrderBy",
                "subType": "any",
                "optional": true,
                "comments": "Order by options\n- If array then the order will be maintained"
              },
              "having": {
                "type": "reference",
                "alias": "FullFilter<T, S> | undefined",
                "comments": "Filter applied after any aggregations (group by)",
                "optional": true
              }
            },
            "comments": ""
          }
        ],
        "returnType": {
          "type": "promise",
          "alias": "Promise<GetUpdateReturnType<P, T, S> | undefined>",
          "comments": "Represents the completion of an asynchronous operation",
          "innerType": {
            "type": "union",
            "alias": "GetUpdateReturnType<P, T, S> | undefined",
            "types": [
              {
                "type": "primitive",
                "alias": "undefined",
                "subType": "undefined"
              },
              {
                "type": "primitive",
                "alias": "GetUpdateReturnType<P, T, S>",
                "aliasSymbolescapedName": "GetUpdateReturnType",
                "subType": "any"
              }
            ]
          }
        },
        "optional": false,
        "comments": "Deletes records from the table based on the specified filter criteria.\n- If no filter is provided, all records may be deleted (use with caution)."
      }
    }
  },
  {
    "type": "union",
    "alias": "PG_COLUMN_UDT_DATA_TYPE",
    "aliasSymbolescapedName": "PG_COLUMN_UDT_DATA_TYPE",
    "types": [
      {
        "type": "literal",
        "alias": "\"bpchar\"",
        "value": "bpchar"
      },
      {
        "type": "literal",
        "alias": "\"char\"",
        "value": "char"
      },
      {
        "type": "literal",
        "alias": "\"varchar\"",
        "value": "varchar"
      },
      {
        "type": "literal",
        "alias": "\"text\"",
        "value": "text"
      },
      {
        "type": "literal",
        "alias": "\"citext\"",
        "value": "citext"
      },
      {
        "type": "literal",
        "alias": "\"uuid\"",
        "value": "uuid"
      },
      {
        "type": "literal",
        "alias": "\"bytea\"",
        "value": "bytea"
      },
      {
        "type": "literal",
        "alias": "\"time\"",
        "value": "time"
      },
      {
        "type": "literal",
        "alias": "\"timetz\"",
        "value": "timetz"
      },
      {
        "type": "literal",
        "alias": "\"interval\"",
        "value": "interval"
      },
      {
        "type": "literal",
        "alias": "\"name\"",
        "value": "name"
      },
      {
        "type": "literal",
        "alias": "\"cidr\"",
        "value": "cidr"
      },
      {
        "type": "literal",
        "alias": "\"inet\"",
        "value": "inet"
      },
      {
        "type": "literal",
        "alias": "\"macaddr\"",
        "value": "macaddr"
      },
      {
        "type": "literal",
        "alias": "\"macaddr8\"",
        "value": "macaddr8"
      },
      {
        "type": "literal",
        "alias": "\"int4range\"",
        "value": "int4range"
      },
      {
        "type": "literal",
        "alias": "\"int8range\"",
        "value": "int8range"
      },
      {
        "type": "literal",
        "alias": "\"numrange\"",
        "value": "numrange"
      },
      {
        "type": "literal",
        "alias": "\"tsvector\"",
        "value": "tsvector"
      },
      {
        "type": "literal",
        "alias": "\"int2\"",
        "value": "int2"
      },
      {
        "type": "literal",
        "alias": "\"int4\"",
        "value": "int4"
      },
      {
        "type": "literal",
        "alias": "\"float4\"",
        "value": "float4"
      },
      {
        "type": "literal",
        "alias": "\"float8\"",
        "value": "float8"
      },
      {
        "type": "literal",
        "alias": "\"oid\"",
        "value": "oid"
      },
      {
        "type": "literal",
        "alias": "\"int8\"",
        "value": "int8"
      },
      {
        "type": "literal",
        "alias": "\"numeric\"",
        "value": "numeric"
      },
      {
        "type": "literal",
        "alias": "\"money\"",
        "value": "money"
      },
      {
        "type": "literal",
        "alias": "\"point\"",
        "value": "point"
      },
      {
        "type": "literal",
        "alias": "\"line\"",
        "value": "line"
      },
      {
        "type": "literal",
        "alias": "\"lseg\"",
        "value": "lseg"
      },
      {
        "type": "literal",
        "alias": "\"box\"",
        "value": "box"
      },
      {
        "type": "literal",
        "alias": "\"path\"",
        "value": "path"
      },
      {
        "type": "literal",
        "alias": "\"polygon\"",
        "value": "polygon"
      },
      {
        "type": "literal",
        "alias": "\"circle\"",
        "value": "circle"
      },
      {
        "type": "literal",
        "alias": "\"json\"",
        "value": "json"
      },
      {
        "type": "literal",
        "alias": "\"jsonb\"",
        "value": "jsonb"
      },
      {
        "type": "literal",
        "alias": "\"bool\"",
        "value": "bool"
      },
      {
        "type": "literal",
        "alias": "\"date\"",
        "value": "date"
      },
      {
        "type": "literal",
        "alias": "\"timestamp\"",
        "value": "timestamp"
      },
      {
        "type": "literal",
        "alias": "\"timestamptz\"",
        "value": "timestamptz"
      },
      {
        "type": "literal",
        "alias": "\"geometry\"",
        "value": "geometry"
      },
      {
        "type": "literal",
        "alias": "\"geography\"",
        "value": "geography"
      }
    ]
  },
  {
    "type": "union",
    "alias": "FullFilter<T, S> | undefined",
    "types": [
      {
        "type": "primitive",
        "alias": "undefined",
        "subType": "undefined"
      },
      {
        "type": "object",
        "alias": "ComplexFilter",
        "aliasSymbolescapedName": "ComplexFilter",
        "comments": "Complex filter that allows applying functions to columns",
        "properties": {
          "$filter": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": false
          }
        }
      },
      {
        "type": "object",
        "alias": "{ $and: FullFilter<T, S>[]; }",
        "properties": {
          "$and": {
            "type": "array",
            "alias": "FullFilter<T, S>[]",
            "itemType": {
              "type": "reference",
              "alias": "FullFilter<T, S>",
              "aliasSymbolescapedName": "FullFilter",
              "comments": "Group or simple filter"
            },
            "optional": false
          }
        }
      },
      {
        "type": "object",
        "alias": "{ $or: FullFilter<T, S>[]; }",
        "properties": {
          "$or": {
            "type": "reference",
            "alias": "FullFilter<T, S>[]",
            "optional": false
          }
        }
      },
      {
        "type": "object",
        "alias": "NormalFilter<AnyObjIfVoid<T>>",
        "aliasSymbolescapedName": "NormalFilter",
        "comments": "Column filter with operators\nMultiple columns are combined with AND",
        "properties": {
          "$filter": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          }
        }
      },
      {
        "type": "primitive",
        "alias": "ShorthandFilter<AnyObjIfVoid<T>>",
        "aliasSymbolescapedName": "ShorthandFilter",
        "comments": "Filters with shorthand notation for autocomplete convenience\nOperator is inside the key: ` \"{columnName}.{operator}\": value`",
        "subType": "any"
      },
      {
        "type": "object",
        "alias": "Partial<{ $exists: S extends DBSchema ? ExactlyOne<{ [tname in KeyofString<S>]: FullFilter<S[tname][\"columns\"], S> | { path: RawJoinPath[]; filter: FullFilter<...>; }; }> : any; $notExists: S extends DBSchema ? ExactlyOne<...> : any; $existsJoined: S extends DBSchema ? ExactlyOne<...> : any; $notExistsJoined: S exte...",
        "aliasSymbolescapedName": "Partial",
        "comments": "Make all properties in T optional",
        "properties": {
          "$exists": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          },
          "$notExists": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          },
          "$existsJoined": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          },
          "$notExistsJoined": {
            "type": "primitive",
            "alias": "any",
            "subType": "any",
            "optional": true
          }
        }
      }
    ]
  },
  {
    "type": "union",
    "alias": "FieldFilter | undefined",
    "types": [
      {
        "type": "primitive",
        "alias": "undefined",
        "subType": "undefined"
      },
      {
        "type": "literal",
        "alias": "\"\"",
        "value": ""
      },
      {
        "type": "array",
        "alias": "string[]",
        "itemType": {
          "type": "primitive",
          "alias": "string",
          "subType": "string"
        }
      },
      {
        "type": "literal",
        "alias": "\"*\"",
        "value": "*"
      },
      {
        "type": "object",
        "alias": "{ \"*\": 1; }",
        "properties": {
          "*": {
            "type": "primitive",
            "alias": "1",
            "subType": "number",
            "optional": false
          }
        }
      },
      {
        "type": "object",
        "alias": "{ [x: string]: true | 1; }",
        "properties": {}
      },
      {
        "type": "object",
        "alias": "{ [x: string]: false | 0; }",
        "properties": {}
      }
    ]
  },
  {
    "type": "object",
    "alias": "SyncOptions",
    "aliasSymbolescapedName": "SyncOptions",
    "properties": {
      "name": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "filter": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onChange": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onError": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "db": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "pushDebounce": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "skipFirstTrigger": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "select": {
        "type": "reference",
        "alias": "FieldFilter | undefined",
        "optional": true
      },
      "storageType": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "patchText": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "patchJSON": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onReady": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "skipIncomingDeltaCheck": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onDebug": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "handlesOnData": {
        "type": "primitive",
        "alias": "false",
        "subType": "boolean",
        "optional": true
      }
    }
  },
  {
    "type": "object",
    "alias": "SyncOneOptions",
    "aliasSymbolescapedName": "SyncOneOptions",
    "properties": {
      "name": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "filter": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onChange": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onError": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "db": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "pushDebounce": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "skipFirstTrigger": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "select": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "storageType": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "patchText": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "patchJSON": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onReady": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "skipIncomingDeltaCheck": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "onDebug": {
        "type": "primitive",
        "alias": "any",
        "subType": "any",
        "optional": true
      },
      "handlesOnData": {
        "type": "primitive",
        "alias": "false",
        "subType": "boolean",
        "optional": true
      }
    }
  }
] as const satisfies TS_Type[];