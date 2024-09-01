export type DBSchemaGenerated = {
  items: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      h?: null | string[];
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
      hh?: null | string[];
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
      h?: null | string[];
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
      added?: null | string;
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
      added?: null | string;
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
  "prostgles_test.basic": {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      txt?: null | string;
    };
  };
  "prostgles_test.basic1": {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      id_basic?: null | number;
      txt?: null | string;
    };
  };
  "prostgles_test.mv_basic1": {
    is_view: true;
    select: true;
    insert: false;
    update: false;
    delete: false;
    columns: {
      id: number;
      id_basic: number;
      txt: string;
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
  self_join: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      my_id?: null | number;
      my_id1?: null | number;
      name?: null | string;
    };
  };
  shapes: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      geog?: null | string;
      geom?: null | string;
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
  symbols: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id: string;
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
      json: {    a: boolean;   arr: '1' | '2' | '3';   arr1: 1 | 2 | 3;   arr2: number[];   arrStr?: null | string[];   o?: | null
 |  {  o1: number; }
 |  {  o2: boolean; };  };
      jsonOneOf?: 
       | null
       |  {  command: 'a'; }
       |  {  command: 'b';  option: number[]; }
      status?: 
       | null
       |  {  ok: string; }
       |  {  err: string; }
       |  {  loading: {  loaded: number;  total: number; }; }
      table_config?: null | {    referencedTables?: (  {  name: string;  minFiles: number; } )[];   recType?: null | Record<'a' | 'b',  {  bools: boolean[]; }>;  };
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
  tr3: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      t2?: null | string;
      tr2_id?: null | number;
    };
  };
  trades: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      price: string;
      symbol: string;
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
      preferences: {    showIntro?: boolean;   theme?: 'light' | 'dark' | 'auto';   others: any[];  };
      status: "active" | "disabled" | "pending"
    };
  };
  users_public_info: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      avatar?: null | string;
      id?: number;
      name?: null | string;
      sid?: null | string;
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
      id?: null | string;
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
      added?: null | string;
      h?: null | string[];
      id?: number;
      jsn?: null | any;
      name?: null | string;
      tsv?: null | string;
    };
  };
  
}
