/* This file was generated by Prostgles 
*/ 

 

import { ViewHandler, TableHandler, JoinMaker } from "prostgles-types";

export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};


/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */
export type D_34_42_34 = { 
  "id"?: number;
  "\"*\""?: string;
}
export type D_42 = { 
  "id"?: number;
  "*"?: string;
}
export type Ex_j_ins = { 
  "id"?: number;
  "public"?: string;
  "name"?: string;
  "added"?: Date;
}
export type I18n_languages = { 
  "id"?: string;
  "label"?: string;
  "label_en"?: string;
}
export type Insert_rules = { 
  "id"?: number;
  "name"?: string;
  "added"?: Date;
}
export type Item_children = { 
  "id"?: number;
  "item_id"?: number;
  "name"?: string;
  "tst"?: Date;
}
export type Items = { 
  "id"?: number;
  "h"?: Array<string>;
  "name"?: string;
}
export type Items2 = { 
  "id"?: number;
  "items_id"?: number;
  "hh"?: Array<string>;
  "name"?: string;
}
export type Items3 = { 
  "id"?: number;
  "h"?: Array<string>;
  "name"?: string;
}
export type Items4 = { 
  "id"?: number;
  "public"?: string;
  "name"?: string;
  "added"?: Date;
}
export type Items4_pub = { 
  "id"?: number;
  "public"?: string;
  "name"?: string;
  "added"?: Date;
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
export type Lookup_experience_types = { 
  "id"?: string;
  "en"?: string;
  "ro"?: string;
}
export type Lookup_settled_status = { 
  "id"?: string;
  "en"?: string;
  "ro"?: string;
}
export type Lookup_status = { 
  "id"?: string;
  "en"?: string;
  "fr"?: string;
}
export type Media = { 
  "id"?: string;
  "name"?: string;
  "extension"?: string;
  "content_type"?: string;
  "url"?: string;
  "original_name"?: string;
  "description"?: string;
  "s3_url"?: string;
  "signed_url"?: string;
  "signed_url_expires"?: number;
  "etag"?: string;
}
export type Planes = { 
  "id"?: number;
  "x"?: number;
  "y"?: number;
  "flight_number"?: string;
  "last_updated"?: number;
}
export type Prgll = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Prostgles_lookup_media_items_m1 = { 
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
export type Prostgles_lookup_media_skills = { 
  "foreign_id"?: string;
  "media_id"?: string;
}
export type Prostgles_lookup_media_usr = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Prostgles_lookup_media_various = { 
  "foreign_id"?: number;
  "media_id"?: string;
}
export type Skills = { 
  "id"?: string;
  "registration_id"?: string;
  "type"?: string;
  "years"?: number;
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
  "tr1_id"?: number;
  "t1"?: string;
  "t2"?: string;
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
  "id"?: number;
  "status"?: string;
  "msg"?: string;
  "added"?: Date;
  "is_active"?: boolean;
  "age"?: number;
}
export type V_items = { 
  "id"?: number;
  "name"?: string;
}
export type Various = { 
  "id"?: number;
  "h"?: Array<string>;
  "name"?: string;
  "tsv"?: any;
  "jsn"?: Object;
  "added"?: Date;
}
export type Various_nested = { 
  "various_id"?: number;
}

export type JoinMakerTables = {
 "items": JoinMaker<Items>;
 "items2": JoinMaker<Items2>;
 "items3": JoinMaker<Items3>;
 "items_m1": JoinMaker<Items_m1>;
 "items_with_media": JoinMaker<Items_with_media>;
 "items_with_one_media": JoinMaker<Items_with_one_media>;
 "lookup_experience_types": JoinMaker<Lookup_experience_types>;
 "lookup_status": JoinMaker<Lookup_status>;
 "media": JoinMaker<Media>;
 "prostgles_lookup_media_items_m1": JoinMaker<Prostgles_lookup_media_items_m1>;
 "prostgles_lookup_media_items_with_media": JoinMaker<Prostgles_lookup_media_items_with_media>;
 "prostgles_lookup_media_items_with_one_media": JoinMaker<Prostgles_lookup_media_items_with_one_media>;
 "prostgles_lookup_media_skills": JoinMaker<Prostgles_lookup_media_skills>;
 "prostgles_lookup_media_usr": JoinMaker<Prostgles_lookup_media_usr>;
 "skills": JoinMaker<Skills>;
 "tr1": JoinMaker<Tr1>;
 "tr2": JoinMaker<Tr2>;
 "tt": JoinMaker<Tt>;
 "tt1": JoinMaker<Tt1>;
 "usr": JoinMaker<Usr>;
};

/* DBO Definition. Isomorphic */
export type DBObj = {
  "\"*\"": TableHandler<D_34_42_34> 
  "*": TableHandler<D_42> 
  "ex_j_ins": TableHandler<Ex_j_ins> 
  "i18n_languages": TableHandler<I18n_languages> 
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
  "lookup_experience_types": TableHandler<Lookup_experience_types> 
  "lookup_settled_status": TableHandler<Lookup_settled_status> 
  "lookup_status": TableHandler<Lookup_status> 
  "media": TableHandler<Media> 
  "planes": TableHandler<Planes> 
  "prgll": TableHandler<Prgll> 
  "prostgles_lookup_media_items_m1": TableHandler<Prostgles_lookup_media_items_m1> 
  "prostgles_lookup_media_items_with_media": TableHandler<Prostgles_lookup_media_items_with_media> 
  "prostgles_lookup_media_items_with_one_media": TableHandler<Prostgles_lookup_media_items_with_one_media> 
  "prostgles_lookup_media_skills": TableHandler<Prostgles_lookup_media_skills> 
  "prostgles_lookup_media_usr": TableHandler<Prostgles_lookup_media_usr> 
  "prostgles_lookup_media_various": TableHandler<Prostgles_lookup_media_various> 
  "skills": TableHandler<Skills> 
  "t": TableHandler<T> 
  "test": TableHandler<Test> 
  "tr1": TableHandler<Tr1> 
  "tr2": TableHandler<Tr2> 
  "tt": TableHandler<Tt> 
  "tt1": TableHandler<Tt1> 
  "tttt": TableHandler<Tttt> 
  "usr": TableHandler<Usr> 
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
      [key in "id" | "\"*\""]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "*": { 
      [key in "id" | "*"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "ex_j_ins": { 
      [key in "id" | "public" | "name" | "added"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "i18n_languages": { 
      [key in "id" | "label" | "label_en"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "insert_rules": { 
      [key in "id" | "name" | "added"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "item_children": { 
      [key in "id" | "item_id" | "name" | "tst"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items": { 
      [key in "id" | "h" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items2": { 
      [key in "id" | "items_id" | "hh" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items3": { 
      [key in "id" | "h" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items4": { 
      [key in "id" | "public" | "name" | "added"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "items4_pub": { 
      [key in "id" | "public" | "name" | "added"]: { [lang_id in keyof LANG_IDS]: string }; 
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
    "lookup_experience_types": { 
      [key in "id" | "en" | "ro"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_settled_status": { 
      [key in "id" | "en" | "ro"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "lookup_status": { 
      [key in "id" | "en" | "fr"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "media": { 
      [key in "id" | "name" | "extension" | "content_type" | "url" | "original_name" | "description" | "s3_url" | "signed_url" | "signed_url_expires" | "etag"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "planes": { 
      [key in "id" | "x" | "y" | "flight_number" | "last_updated"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prgll": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_items_m1": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_items_with_media": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_items_with_one_media": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_skills": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_usr": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "prostgles_lookup_media_various": { 
      [key in "foreign_id" | "media_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "skills": { 
      [key in "id" | "registration_id" | "type" | "years"]: { [lang_id in keyof LANG_IDS]: string }; 
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
      [key in "id" | "tr1_id" | "t1" | "t2"]: { [lang_id in keyof LANG_IDS]: string }; 
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
      [key in "id" | "status" | "msg" | "added" | "is_active" | "age"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "v_items": { 
      [key in "id" | "name"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "various": { 
      [key in "id" | "h" | "name" | "tsv" | "jsn" | "added"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
    "various_nested": { 
      [key in "various_id"]: { [lang_id in keyof LANG_IDS]: string }; 
    }; 
  }> 
} 
