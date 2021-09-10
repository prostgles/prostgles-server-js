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
export type Lookup_status = { 
  "id"?: string;
  "en"?: string;
  "fr"?: string;
}
export type Planes = { 
  "id"?: number;
  "x"?: number;
  "y"?: number;
  "flight_number"?: string;
  "last_updated"?: number;
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

export type JoinMakerTables = {
 "items": JoinMaker<Items>;
 "items2": JoinMaker<Items2>;
 "items3": JoinMaker<Items3>;
};

/* DBO Definition. Isomorphic */
export type DBObj = {
  "\"*\"": TableHandler<D_34_42_34> 
  "*": TableHandler<D_42> 
  "ex_j_ins": TableHandler<Ex_j_ins> 
  "item_children": TableHandler<Item_children> 
  "items": TableHandler<Items> 
  "items2": TableHandler<Items2> 
  "items3": TableHandler<Items3> 
  "items4": TableHandler<Items4> 
  "items4_pub": TableHandler<Items4_pub> 
  "lookup_status": TableHandler<Lookup_status> 
  "planes": TableHandler<Planes> 
  "tr1": TableHandler<Tr1> 
  "tr2": TableHandler<Tr2> 
  "tt": TableHandler<Tt> 
  "usr": TableHandler<Usr> 
  "v_items": ViewHandler<V_items> 
  "various": TableHandler<Various> 
  leftJoin: JoinMakerTables;
  innerJoin: JoinMakerTables;
  leftJoinOne: JoinMakerTables;
  innerJoinOne: JoinMakerTables;
 tx: (t: TxCB) => Promise<any | void> ;
};
