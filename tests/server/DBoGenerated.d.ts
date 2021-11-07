/* This file was generated by Prostgles 
*/ 

 

import { ViewHandler, TableHandler, JoinMaker } from "prostgles-types";

export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};


/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */
export type D_34_42_34 = { 
  "\"*\""?: string;
  "id"?: number;
}
export type D_42 = { 
  "*"?: string;
  "id"?: number;
}
export type CodePointOpen_London_201709 = { 
  "borough"?: string;
  "boroughcd"?: string;
  "eastings"?: string;
  "lsoa11_cd"?: string;
  "lsoa11_nm"?: string;
  "msoa11_cd"?: string;
  "msoa11_nm"?: string;
  "northings"?: string;
  "OBJECTID"?: string;
  "postcode"?: string;
  "rgn11_cd"?: string;
  "rgn11_nm"?: string;
  "Shape"?: any;
  "ward14_cd"?: string;
  "ward14_nm"?: string;
}
export type Aaaa = { 
  "c"?: Object;
}
export type Ex_j_ins = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Geography_columns = { 
  "coord_dimension"?: number;
  "f_geography_column"?: string;
  "f_table_catalog"?: string;
  "f_table_name"?: string;
  "f_table_schema"?: string;
  "srid"?: number;
  "type"?: string;
}
export type Geometry_columns = { 
  "coord_dimension"?: number;
  "f_geometry_column"?: string;
  "f_table_catalog"?: string;
  "f_table_name"?: string;
  "f_table_schema"?: string;
  "srid"?: number;
  "type"?: string;
}
export type Insert_rules = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
}
export type Item_children = { 
  "id"?: number;
  "item_id"?: number;
  "name"?: string;
  "tst"?: Date;
}
export type Items = { 
  "h"?: Array<string>;
  "id"?: number;
  "name"?: string;
}
export type Items2 = { 
  "hh"?: Array<string>;
  "id"?: number;
  "items_id"?: number;
  "name"?: string;
}
export type Items3 = { 
  "h"?: Array<string>;
  "id"?: number;
  "name"?: string;
}
export type Items4 = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Items4_pub = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Items_m1 = { 
  "id"?: number;
  "name"?: string;
}
export type Items_with_media = { 
  "id"?: number;
  "name"?: string;
}
export type Items_with_one_media = { 
  "id"?: number;
  "name"?: string;
}
export type Lookup_col1 = { 
  "id"?: string;
}
export type Lookup_items_m1_name_type = { 
  "en"?: string;
  "id"?: string;
  "ro"?: string;
}
export type Lookup_uuid_text_col1 = { 
  "id"?: string;
}
export type Lookup_uuid_text_col2 = { 
  "id"?: string;
}
export type Media = { 
  "content_type"?: string;
  "description"?: string;
  "etag"?: string;
  "extension"?: string;
  "id"?: string;
  "name"?: string;
  "original_name"?: string;
  "s3_url"?: string;
  "signed_url"?: string;
  "signed_url_expires"?: number;
  "url"?: string;
}
export type Mmedia = { 
  "content_type"?: string;
  "description"?: string;
  "etag"?: string;
  "extension"?: string;
  "id"?: string;
  "name"?: string;
  "original_name"?: string;
  "s3_url"?: string;
  "signed_url"?: string;
  "signed_url_expires"?: number;
  "url"?: string;
}
export type Mmmedia = { 
  "content_type"?: string;
  "description"?: string;
  "etag"?: string;
  "extension"?: string;
  "id"?: string;
  "name"?: string;
  "original_name"?: string;
  "s3_url"?: string;
  "signed_url"?: string;
  "signed_url_expires"?: number;
  "url"?: string;
}
export type Planes = { 
  "flight_number"?: string;
  "id"?: number;
  "last_updated"?: number;
  "x"?: number;
  "y"?: number;
}
export type Prgll = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Prostgles_lookup_media_items_with_media = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Prostgles_lookup_media_items_with_one_media = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Prostgles_lookup_media_various = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Shapes = { 
  "geog"?: any;
  "geom"?: any;
  "id"?: string;
}
export type Skills = { 
  "id"?: string;
  "registration_id"?: string;
  "type"?: string;
  "years"?: number;
}
export type Spatial_ref_sys = { 
  "auth_name"?: string;
  "auth_srid"?: number;
  "proj4text"?: string;
  "srid"?: number;
  "srtext"?: string;
}
export type T = { 
  "t"?: string;
}
export type Test = { 
  "id"?: number;
  "parent"?: number;
}
export type Tr1 = { 
  "id"?: number;
  "t1"?: string;
}
export type Tr2 = { 
  "id"?: number;
  "t1"?: string;
  "t2"?: string;
  "tr1_id"?: number;
}
export type Tt = { 
  "id"?: number;
  "t1"?: string;
  "t2"?: string;
}
export type Tt1 = { 
  "id"?: number;
  "t1"?: string;
  "t2"?: string;
}
export type Tttt = { 
  "t"?: string;
}
export type Usr = { 
  "added"?: Date;
  "age"?: number;
  "id"?: number;
  "is_active"?: boolean;
  "msg"?: string;
  "status"?: string;
}
export type Uuid_text = { 
  "col1"?: string;
  "col2"?: string;
  "id"?: string;
  "name"?: string;
}
export type V_items = { 
  "id"?: number;
  "name"?: string;
}
export type Various = { 
  "added"?: Date;
  "h"?: Array<string>;
  "id"?: number;
  "jsn"?: Object;
  "name"?: string;
  "tsv"?: any;
}
export type Various_nested = { 
  "various_id"?: number;
}

export type JoinMakerTables = {
 "items": JoinMaker<Items>;
 "items2": JoinMaker<Items2>;
 "items3": JoinMaker<Items3>;
 "items_with_media": JoinMaker<Items_with_media>;
 "items_with_one_media": JoinMaker<Items_with_one_media>;
 "lookup_col1": JoinMaker<Lookup_col1>;
 "media": JoinMaker<Media>;
 "prostgles_lookup_media_items_with_media": JoinMaker<Prostgles_lookup_media_items_with_media>;
 "prostgles_lookup_media_items_with_one_media": JoinMaker<Prostgles_lookup_media_items_with_one_media>;
 "tr1": JoinMaker<Tr1>;
 "tr2": JoinMaker<Tr2>;
 "tt": JoinMaker<Tt>;
 "tt1": JoinMaker<Tt1>;
 "uuid_text": JoinMaker<Uuid_text>;
};

/* DBO Definition. Isomorphic */
export type DBObj = {
  "\"*\"": TableHandler<D_34_42_34> 
  "*": TableHandler<D_42> 
  "CodePointOpen_London_201709": TableHandler<CodePointOpen_London_201709> 
  "aaaa": TableHandler<Aaaa> 
  "ex_j_ins": TableHandler<Ex_j_ins> 
  "geography_columns": ViewHandler<Geography_columns> 
  "geometry_columns": ViewHandler<Geometry_columns> 
  "insert_rules": TableHandler<Insert_rules> 
  "item_children": TableHandler<Item_children> 
  "items": TableHandler<Items> 
  "items2": TableHandler<Items2> 
  "items3": TableHandler<Items3> 
  "items4": TableHandler<Items4> 
  "items4_pub": TableHandler<Items4_pub> 
  "items_m1": TableHandler<Items_m1> 
  "items_with_media": TableHandler<Items_with_media> 
  "items_with_one_media": TableHandler<Items_with_one_media> 
  "lookup_col1": TableHandler<Lookup_col1> 
  "lookup_items_m1_name_type": TableHandler<Lookup_items_m1_name_type> 
  "lookup_uuid_text_col1": TableHandler<Lookup_uuid_text_col1> 
  "lookup_uuid_text_col2": TableHandler<Lookup_uuid_text_col2> 
  "media": TableHandler<Media> 
  "mmedia": TableHandler<Mmedia> 
  "mmmedia": TableHandler<Mmmedia> 
  "planes": TableHandler<Planes> 
  "prgll": TableHandler<Prgll> 
  "prostgles_lookup_media_items_with_media": TableHandler<Prostgles_lookup_media_items_with_media> 
  "prostgles_lookup_media_items_with_one_media": TableHandler<Prostgles_lookup_media_items_with_one_media> 
  "prostgles_lookup_media_various": TableHandler<Prostgles_lookup_media_various> 
  "shapes": TableHandler<Shapes> 
  "skills": TableHandler<Skills> 
  "spatial_ref_sys": TableHandler<Spatial_ref_sys> 
  "t": TableHandler<T> 
  "test": TableHandler<Test> 
  "tr1": TableHandler<Tr1> 
  "tr2": TableHandler<Tr2> 
  "tt": TableHandler<Tt> 
  "tt1": TableHandler<Tt1> 
  "tttt": TableHandler<Tttt> 
  "usr": TableHandler<Usr> 
  "uuid_text": TableHandler<Uuid_text> 
  "v_items": ViewHandler<V_items> 
  "various": TableHandler<Various> 
  "various_nested": TableHandler<Various_nested> 
  leftJoin: JoinMakerTables;
  innerJoin: JoinMakerTables;
  leftJoinOne: JoinMakerTables;
  innerJoinOne: JoinMakerTables;
 tx: (t: TxCB) => Promise<any | void> ;
};

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]>; }; 
export type I18N_DBO_CONFIG<LANG_IDS = { en: 1, fr: 1 }> = { 
  fallbackLang: keyof LANG_IDS; 
  column_labels?: DeepPartial<{ 
    "\"*\"": { 
      [key in "\"*\"" | "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "*": { 
      [key in "*" | "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "CodePointOpen_London_201709": { 
      [key in "borough" | "boroughcd" | "eastings" | "lsoa11_cd" | "lsoa11_nm" | "msoa11_cd" | "msoa11_nm" | "northings" | "OBJECTID" | "postcode" | "rgn11_cd" | "rgn11_nm" | "Shape" | "ward14_cd" | "ward14_nm"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "aaaa": { 
      [key in "c"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "ex_j_ins": { 
      [key in "added" | "id" | "name" | "public"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "geography_columns": { 
      [key in "coord_dimension" | "f_geography_column" | "f_table_catalog" | "f_table_name" | "f_table_schema" | "srid" | "type"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "geometry_columns": { 
      [key in "coord_dimension" | "f_geometry_column" | "f_table_catalog" | "f_table_name" | "f_table_schema" | "srid" | "type"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "insert_rules": { 
      [key in "added" | "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "item_children": { 
      [key in "id" | "item_id" | "name" | "tst"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items": { 
      [key in "h" | "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items2": { 
      [key in "hh" | "id" | "items_id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items3": { 
      [key in "h" | "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items4": { 
      [key in "added" | "id" | "name" | "public"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items4_pub": { 
      [key in "added" | "id" | "name" | "public"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items_m1": { 
      [key in "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items_with_media": { 
      [key in "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items_with_one_media": { 
      [key in "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_col1": { 
      [key in "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_items_m1_name_type": { 
      [key in "en" | "id" | "ro"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_uuid_text_col1": { 
      [key in "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_uuid_text_col2": { 
      [key in "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "media": { 
      [key in "content_type" | "description" | "etag" | "extension" | "id" | "name" | "original_name" | "s3_url" | "signed_url" | "signed_url_expires" | "url"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "mmedia": { 
      [key in "content_type" | "description" | "etag" | "extension" | "id" | "name" | "original_name" | "s3_url" | "signed_url" | "signed_url_expires" | "url"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "mmmedia": { 
      [key in "content_type" | "description" | "etag" | "extension" | "id" | "name" | "original_name" | "s3_url" | "signed_url" | "signed_url_expires" | "url"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "planes": { 
      [key in "flight_number" | "id" | "last_updated" | "x" | "y"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prgll": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_items_with_media": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_items_with_one_media": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_various": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "shapes": { 
      [key in "geog" | "geom" | "id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "skills": { 
      [key in "id" | "registration_id" | "type" | "years"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "spatial_ref_sys": { 
      [key in "auth_name" | "auth_srid" | "proj4text" | "srid" | "srtext"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "t": { 
      [key in "t"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "test": { 
      [key in "id" | "parent"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "tr1": { 
      [key in "id" | "t1"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "tr2": { 
      [key in "id" | "t1" | "t2" | "tr1_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "tt": { 
      [key in "id" | "t1" | "t2"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "tt1": { 
      [key in "id" | "t1" | "t2"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "tttt": { 
      [key in "t"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "usr": { 
      [key in "added" | "age" | "id" | "is_active" | "msg" | "status"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "uuid_text": { 
      [key in "col1" | "col2" | "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "v_items": { 
      [key in "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "various": { 
      [key in "added" | "h" | "id" | "jsn" | "name" | "tsv"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "various_nested": { 
      [key in "various_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
  }> 
} 
