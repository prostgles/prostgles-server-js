/* This file was generated by Prostgles 
*/ 

 /* SCHEMA DEFINITON. Table names have been altered to work with Typescript */
/* DBO Definition */

export type DBSchemaGenerated = {
  "\"*\"": {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      "\"*\""?: null | string;
      id?: number;
    };
  };
  "*": {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      "*"?: null | string;
      id?: number;
    };
  };
  credential_types: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string;
    };
  };
  ex_j_ins: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      id?: number;
      name: string;
      public?: null | string;
    };
  };
  geography_columns: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      coord_dimension?: null | number;
      f_geography_column?: null | string;
      f_table_catalog?: null | string;
      f_table_name?: null | string;
      f_table_schema?: null | string;
      srid?: null | number;
      type?: null | string;
    };
  };
  geometry_columns: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      coord_dimension?: null | number;
      f_geometry_column?: null | string;
      f_table_catalog?: null | string;
      f_table_name?: null | string;
      f_table_schema?: null | string;
      srid?: null | number;
      type?: null | string;
    };
  };
  insert_rules: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      id?: number;
      name?: null | string;
    };
  };
  item_children: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      item_id?: null | number;
      name?: null | string;
      tst?: null | Date;
    };
  };
  items: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      h?: null | Array<string>;
      id?: number;
      name?: null | string;
    };
  };
  items_multi: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      items0_id?: null | number;
      items1_id?: null | number;
      items2_id?: null | number;
      items3_id?: null | number;
      name?: null | string;
    };
  };
  items_with_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      name?: null | string;
    };
  };
  items_with_one_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      name?: null | string;
    };
  };
  items2: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      hh?: null | Array<string>;
      id?: number;
      items_id?: null | number;
      name?: null | string;
    };
  };
  items3: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      h?: null | Array<string>;
      id?: number;
      name?: null | string;
    };
  };
  items4: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      id?: number;
      name: string;
      public?: null | string;
    };
  };
  items4_pub: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      id?: number;
      name: string;
      public?: null | string;
    };
  };
  items4a: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      items_id?: null | number;
      items2_id?: null | number;
      name?: null | string;
    };
  };
  lookup_col1: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string;
    };
  };
  lookup_status: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      en?: null | string;
      fr?: null | string;
      id: string;
    };
  };
  media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date;
      content_length?: number;
      content_type: string;
      deleted?: null | number;
      deleted_from_storage?: null | number;
      description?: null | string;
      etag?: null | string;
      extension: string;
      id?: string;
      name: string;
      original_name: string;
      s3_url?: null | string;
      signed_url?: null | string;
      signed_url_expires?: null | number;
      url: string;
    };
  };
  obj_table: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      obj?: null | any;
    };
  };
  planes: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      flight_number?: null | string;
      id?: number;
      last_updated: number;
      x?: null | number;
      y?: null | number;
    };
  };
  prostgles_lookup_media_items_with_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      foreign_id?: null | number;
      media_id: string;
    };
  };
  prostgles_lookup_media_items_with_one_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      foreign_id: number;
      media_id: string;
    };
  };
  rec: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      parent_id?: null | number;
      recf?: null | number;
    };
  };
  rec_ref: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
    };
  };
  shapes: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      geog?: null | any;
      geom?: null | any;
      id?: string;
    };
  };
  spatial_ref_sys: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      auth_name?: null | string;
      auth_srid?: null | number;
      proj4text?: null | string;
      srid: number;
      srtext?: null | string;
    };
  };
  tjson: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      colOneOf: "a" | "b" | "c"
      json:       { 
        a: boolean;
        arr: '1' | '2' | '3';
        arr1: 1 | 2 | 3;
        arr2: number[];
        arrStr?: null | string[];
        o?: 
        | null
        | {  o1: number; }
        | {  o2: boolean; }; 
      };
      jsonOneOf?: 
        | null
        | {  command: 'a'; }
        | {  command: 'b'; option: number[]; }
      status?: 
        | null
        | {  ok: string; }
        | {  err: string; }
        | {  loading: {  loaded: number; total: number; }; }
      table_config?: null |       { 
        referencedTables?: {  name: string; minFiles: number; }[]; 
      };
    };
  };
  tr1: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      t1?: null | string;
    };
  };
  tr2: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      t1?: null | string;
      t2?: null | string;
      tr1_id?: null | number;
    };
  };
  user_statuses: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string;
    };
  };
  user_types: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string;
    };
  };
  users: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      email: string;
      id?: number;
      preferences?:       { 
        showIntro?: boolean;
        theme?: 'light' | 'dark' | 'auto';
        others: any[]; 
      };
      status: "active" | "disabled" | "pending"
    };
  };
  usr: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      age?: null | number;
      id?: number;
      is_active?: null | boolean;
      msg?: null | string;
      status?: null | string;
    };
  };
  uuid_text: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      col1?: null | string;
      col2?: null | string;
      id?: string;
      name?: null | string;
    };
  };
  v_items: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: null | number;
      name?: null | string;
    };
  };
  various: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: null | Date;
      h?: null | Array<string>;
      id?: number;
      jsn?: null | any;
      name?: null | string;
      tsv?: null | string;
    };
  };
  
}
