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
      "\"*\""?: string | null;
      id?: number
    };
  };
  "*": {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      "*"?: string | null;
      id?: number
    };
  };
  ex_j_ins: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      id?: number
      name: string
      public?: string | null;
    };
  };
  geography_columns: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      coord_dimension?: number | null;
      f_geography_column?: string | null;
      f_table_catalog?: string | null;
      f_table_name?: string | null;
      f_table_schema?: string | null;
      srid?: number | null;
      type?: string | null;
    };
  };
  geometry_columns: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      coord_dimension?: number | null;
      f_geometry_column?: string | null;
      f_table_catalog?: string | null;
      f_table_name?: string | null;
      f_table_schema?: string | null;
      srid?: number | null;
      type?: string | null;
    };
  };
  insert_rules: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      id?: number
      name?: string | null;
    };
  };
  item_children: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      item_id?: number | null;
      name?: string | null;
      tst?: Date | null;
    };
  };
  items: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      h?: Array<string> | null;
      id?: number
      name?: string | null;
    };
  };
  items_multi: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      items0_id?: number | null;
      items1_id?: number | null;
      items2_id?: number | null;
      items3_id?: number | null;
      name?: string | null;
    };
  };
  items_with_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      name?: string | null;
    };
  };
  items_with_one_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      name?: string | null;
    };
  };
  items2: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      hh?: Array<string> | null;
      id?: number
      items_id?: number | null;
      name?: string | null;
    };
  };
  items3: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      h?: Array<string> | null;
      id?: number
      name?: string | null;
    };
  };
  items4: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      id?: number
      name: string
      public?: string | null;
    };
  };
  items4_pub: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      id?: number
      name: string
      public?: string | null;
    };
  };
  items4a: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      items_id?: number | null;
      items2_id?: number | null;
      name?: string | null;
    };
  };
  lookup_col1: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string
    };
  };
  lookup_status: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      en?: string | null;
      fr?: string | null;
      id: string
    };
  };
  media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      content_length?: number
      content_type: string
      deleted?: number | null;
      deleted_from_storage?: number | null;
      description?: string | null;
      etag?: string | null;
      extension: string
      id?: string
      name: string
      original_name: string
      s3_url?: string | null;
      signed_url?: string | null;
      signed_url_expires?: number | null;
      url: string
    };
  };
  obj_table: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      obj?: any | null;
    };
  };
  planes: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      flight_number?: string | null;
      id?: number
      last_updated: number
      x?: number | null;
      y?: number | null;
    };
  };
  prostgles_lookup_media_items_with_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      foreign_id?: number | null;
      media_id: string
    };
  };
  prostgles_lookup_media_items_with_one_media: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      foreign_id: number
      media_id: string
    };
  };
  shapes: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      geog?: any | null;
      geom?: any | null;
      id?: string
    };
  };
  spatial_ref_sys: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      auth_name?: string | null;
      auth_srid?: number | null;
      proj4text?: string | null;
      srid: number
      srtext?: string | null;
    };
  };
  tr1: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      t1?: string | null;
    };
  };
  tr2: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number
      t1?: string | null;
      t2?: string | null;
      tr1_id?: number | null;
    };
  };
  usr: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      age?: number | null;
      id?: number
      is_active?: boolean | null;
      msg?: string | null;
      status?: string | null;
    };
  };
  uuid_text: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      col1?: string | null;
      col2?: string | null;
      id?: string
      name?: string | null;
    };
  };
  v_items: {
    is_view: true;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number | null;
      name?: string | null;
    };
  };
  various: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      added?: Date | null;
      h?: Array<string> | null;
      id?: number
      jsn?: any | null;
      name?: string | null;
      tsv?: any | null;
    };
  };
  
}
