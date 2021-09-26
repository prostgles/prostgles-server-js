

/**
 * Example: col_name: { $gt: 2 }
 * @alias CompareFilter
 */
 export type CompareFilter<T = Date | number | string | boolean> =
 /**
  * column value equals provided value
  */
 | T 
 | { "=": T } | { "$eq": T }
 | { "<>": T } | { "$ne": T }
 | { ">": T } | { "$gt": T }
 | { ">=": T } | { "$gte": T }
 | { "<=": T } | { "$lte": T }

 | { "$in": T[] }
 | { "$nin": T[] }
 | { "$between": [T, T] }
;
export const CompareFilterKeys = ["=", "$eq","<>",">",">=","<=","$eq","$ne","$gt","$gte","$lte"];
export const CompareInFilterKeys = ["$in", "$nin"]

export type FullTextSearchFilter = 
 | { "to_tsquery": string[] }
 | { "plainto_tsquery": string[] }
 | { "phraseto_tsquery": string[] }
 | { "websearch_to_tsquery": string[] }
;
export const TextFilter_FullTextSearchFilterKeys = ["to_tsquery","plainto_tsquery","phraseto_tsquery","websearch_to_tsquery"];

export type TextFilter = 
 | CompareFilter<string>
 | { "$ilike": string }
 | { "$like": string }

 | { "@@": FullTextSearchFilter }
 | { "@>": FullTextSearchFilter } |  { "$contains": FullTextSearchFilter } 
 | { "<@": FullTextSearchFilter } |  { "$containedBy": FullTextSearchFilter } 
;
export const TextFilterFTSKeys = ["@@", "@>", "<@", "$contains", "$containedBy"];

export type ArrayFilter<T = (number | boolean | string)[]> = 
 | CompareFilter<T>
 | { "@>": T } |  { "$contains": T } 
 | { "<@": T } |  { "$containedBy": T } 
 | { "&&": T } |  { "$overlaps": T }
;

/* POSTGIS */

/**
* Makes bounding box from NW and SE points
* float xmin, float ymin, float xmax, float ymax, integer srid=unknown
* https://postgis.net/docs/ST_MakeEnvelope.html
*/
export type GeoBBox = { ST_MakeEnvelope: number[] }


/**
* Returns TRUE if A's 2D bounding box intersects B's 2D bounding box.
* https://postgis.net/docs/reference.html#Operators
*/
export type GeomFilter = 

 /**
  * A's 2D bounding box intersects B's 2D bounding box.
  */
 | { "&&": GeoBBox }
//  | { "&&&": GeoBBox }
//  | { "&<": GeoBBox }
//  | { "&<|": GeoBBox }
//  | { "&>": GeoBBox }
//  | { "<<": GeoBBox }
//  | { "<<|": GeoBBox }
//  | { ">>": GeoBBox }

//  | { "=": GeoBBox }

 /**
  * A's bounding box is contained by B's
  */
 | { "@": GeoBBox }
//  | { "|&>": GeoBBox }
//  | { "|>>": GeoBBox }

 /**
  * A's bounding box contains B's.
  */
//  | { "~": GeoBBox }
//  | { "~=": GeoBBox }
;
export const GeomFilterKeys = ["~","~=","@","|&>","|>>", ">>", "=", "<<|", "<<", "&>", "&<|", "&<", "&&&", "&&"]
export const GeomFilter_Funcs = ["ST_MakeEnvelope", "ST_MakeEnvelope".toLowerCase()]

export type AllowedTSTypes = string | number | boolean | Date | any[];
// export type AnyObject = { [key: string]: AllowedTSTypes };
export type AnyObject = { [key: string]: any };

export type FilterDataType<T = any> = 
 T extends string ? TextFilter
: T extends number ? CompareFilter<T>
: T extends boolean ? CompareFilter<T>
: T extends Date ? CompareFilter<T>
: T extends any[] ? ArrayFilter<T>
: (CompareFilter<T> & ArrayFilter<T> & TextFilter & GeomFilter)
;

export const EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"] as const;
export type EXISTS_KEY = typeof EXISTS_KEYS[number];

/* Traverses object keys to make filter */
export type FilterForObject<T = AnyObject> = {
  [K in keyof Partial<T> & AnyObject]: FilterDataType<T[K]>
} | 
/**
 * Filters with shorthand notation
 * @example: { "name.$ilike": 'abc' }
 */
{ [K in keyof Omit<{ [key: string]: any }, keyof T>]: (FilterDataType | Date | string | number | (Date | string | number)[]) };


/**
 * Filter that relates to a single column { col: 2 } or
 * an exists filter: { $exists: {  } }
 */
export type FilterItem<T = AnyObject> = 
  | FilterForObject<T> 
  | Partial<{ [key in EXISTS_KEY]: { [key: string]: FilterForObject } }>


/**
 * Full filter
 * @example { $or: [ { id: 1 }, { status: 'live' } ] }
 */
export type FullFilter<T = AnyObject> = 
 | FilterItem<T> 
 | { $and: (FilterItem<T>  | FullFilter)[] } 
 | { $or: (FilterItem<T>  | FullFilter)[] } 
 | { $not: FilterItem<T>  }
;

/**
 * Simpler FullFilter to reduce load on compilation
 */
export type FullFilterBasic<T = { [key: string]: any }> = {
  [key in keyof Partial<T & { [key: string]: any }>]: any
}

// const d: FullFilterBasic<{ a: number, ab: number  }> = {
//   adw: 2
// }
// export type FullFilterSimple = any;
// const f: FullFilter<{ a: Date, s: string }> = {
//   // hehe: { "@>": ['', 2] }
//   $exists: { dadwa: { $and: [{ a: 2 }] }},
//   $and: [ { a: { $gt: 23 } }],
//   a: { $eqq: new Date() },
//   // s: { $between: [2, '3']},
// }

