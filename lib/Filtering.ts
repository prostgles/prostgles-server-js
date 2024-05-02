

import {
  CompareFilterKeys,
  CompareInFilterKeys,
  FilterDataType,
  FullFilter,
  GeomFilterKeys, GeomFilter_Funcs,
  JsonbFilterKeys,
  TextFilterKeys,
  TextFilter_FullTextSearchFilterKeys,
  getKeys,
  isEmpty,
  isObject
} from "prostgles-types";
import { SelectItem } from "./DboBuilder/QueryBuilder/QueryBuilder";
import { pgp } from "./DboBuilder/DboBuilderTypes";


export const FILTER_OPERANDS = [
  ...TextFilterKeys,
  ...JsonbFilterKeys,
  ...CompareFilterKeys,
  ...CompareInFilterKeys
] as const;

/**
* Parse a single filter
* Ensure only single key objects reach this point
*/
type ParseFilterItemArgs = { 
  filter: FullFilter<void, void>; 
  select: SelectItem[] | undefined;
  tableAlias: string | undefined;
  allowedColumnNames: string[];
};

export const parseFilterItem = (args: ParseFilterItemArgs): string => {
  const { filter: _f, select, tableAlias, allowedColumnNames } = args;

  if(!_f || isEmpty(_f)) return "";

  const mErr = (msg: string) => {
    throw `${msg}: ${JSON.stringify(_f, null, 2)}`
  };
  const asValue = (v: any) => pgp.as.format("$1", [v]);

  const fKeys = getKeys(_f)
  if(fKeys.length === 0){
    return "";
    
  /**
   * { field1: cond1, field2: cond2 }
   */
  } else if(fKeys.length > 1){
    return fKeys.map(fk => parseFilterItem({
      filter: { [fk]: _f[fk] },
      select, 
      tableAlias,
      allowedColumnNames,
    }))
    .sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
    .join(" AND ")
  }

  const fKey: string = fKeys[0]!;

  let selItem: SelectItem | undefined;
  if(select) {
    selItem = select.find(s => fKey === s.alias);
  }
  let rightF: FilterDataType<any> = (_f as any)[fKey];

  const validateSelectedItemFilter = (selectedItem: SelectItem | undefined) => {
    const fields = selectedItem?.getFields();
    if(Array.isArray(fields) && fields.length > 1) {
      const dissallowedFields = fields.filter(fname => !allowedColumnNames.includes(fname));
      if(dissallowedFields.length){
        throw new Error(`Invalid/disallowed columns found in filter: ${dissallowedFields}`)
      }
    }
  }
  const getLeftQ = (selItm: SelectItem) => {
    validateSelectedItemFilter(selItem);
    if(selItm.type === "function" || selItm.type === "aggregation") return selItm.getQuery();
    return selItm.getQuery(tableAlias);
  }

  /**
    * Parsed left side of the query
    */
  let leftQ: string | undefined;// = asName(selItem.alias);

  /* 
    Select item not found. 
    Check if dot/json notation. Build obj if necessary 
    */
  const dot_notation_delims = ["->", "."];
  if(!selItem){
    
    /* See if dot notation. Pick the best matching starting string */
    if(select){
      selItem = select.find(s => 
        dot_notation_delims.find(delimiter => fKey.startsWith(s.alias + delimiter))
      );
      validateSelectedItemFilter(selItem);
    }
    if(!selItem) {
      return mErr("Bad filter. Could not match to a column or alias or dot notation: "); 
    }

    let remainingStr = fKey.slice(selItem.alias.length);


    /* Is json path spec */
    if(remainingStr.startsWith("->")){

      /** Has shorthand operand 'col->>key.<>'  */
      const matchingOperand = CompareFilterKeys.find(operand => remainingStr.endsWith(`.${operand}`));
      if(matchingOperand){
        remainingStr = remainingStr.slice(0, -matchingOperand.length - 1)
        rightF = { [matchingOperand]: rightF }
      }

      leftQ = getLeftQ(selItem);
      
      /**
        * get json path separators. Expecting -> to come first
        */
      type GetSepRes = { idx: number; sep: string } | undefined
      const getSep = (fromIdx = 0): GetSepRes => {
        const strPart = remainingStr.slice(fromIdx)
        let idx = strPart.indexOf("->");
        const idxx = strPart.indexOf("->>");
        if(idx > -1) {
          /* if -> matches then check if it's the last separator */
          if(idx === idxx) return { idx: idx + fromIdx, sep: "->>" }
          return { idx: idx + fromIdx, sep: "->" }
        }
        idx = strPart.indexOf("->>");
        if(idx > -1) {
          return { idx: idx + fromIdx, sep: "->>" }
        }

        return undefined;
      }


      let currSep = getSep();
      while(currSep){
        let nextSep = getSep(currSep.idx + currSep.sep.length);

        let nextIdx = nextSep? nextSep.idx : remainingStr.length;

        /* If ending in set then add set as well into key */
        if(nextSep && nextIdx + nextSep.sep.length === remainingStr.length) {
          nextIdx = remainingStr.length;
          nextSep =  undefined;
        }

        leftQ += currSep.sep + asValue(remainingStr.slice(currSep.idx + currSep.sep.length, nextIdx));
        currSep = nextSep;
      }

    /* 
      Is collapsed filter spec  e.g. { "col.$ilike": 'text' } 
      will transform into { col: { $ilike: ['text'] } }
    */
    } else if(remainingStr.startsWith(".")){
      leftQ = getLeftQ(selItem);

      const getSep = (fromIdx = 0) => {
        const idx = remainingStr.slice(fromIdx).indexOf(".");
        if(idx > -1) return fromIdx + idx;
        return idx; 
      }
      let currIdx = getSep();
      const res: any = {};
      let curObj = res;

      while(currIdx > -1){
        let nextIdx = getSep(currIdx + 1);
        let nIdx = nextIdx > -1? nextIdx : remainingStr.length;

        /* If ending in dot then add dot as well into key */
        if(nextIdx + 1 === remainingStr.length) {
          nIdx = remainingStr.length;
          nextIdx = -1;
        }

        const key = remainingStr.slice(currIdx + 1, nIdx);
        curObj[key] = nextIdx > -1? {} : (_f as any)[fKey];
        curObj = curObj[key];

        currIdx = nextIdx;
      }
      
      rightF = res;
    } else {
      // console.trace(141, select, selItem, remainingStr)
      mErr("Bad filter. Could not find the valid col name or alias or col json path")
    }

  } else {
    leftQ = getLeftQ(selItem);
  }

  if(!leftQ) mErr("Internal error: leftQ missing?!");

  const parseRightVal = (val: any, expect?: "csv" | "array" | "json" | "jsonb") => {
    try {
      return parseFilterRightValue(val, { selectItem: selItem, expect });
    } catch(e: any){
      return mErr(e);
    }
  }

  /* Matching sel item */
  if(isObject(rightF)){

    const filterKeys = Object.keys(rightF);
    let filterOperand: typeof FILTER_OPERANDS[number] = filterKeys[0] as any;

    /** JSON cannot be compared so we'll cast it to TEXT */
    if(selItem?.column_udt_type === "json" || TextFilterKeys.includes(filterOperand as any)){
      leftQ += "::TEXT "
    }

    /** It's an object key which means it's an equality comparison against a json object */
    if(selItem?.column_udt_type?.startsWith("json") && !FILTER_OPERANDS.includes(filterOperand)){
      return leftQ + " = " + parseRightVal(rightF);
    }    

    let filterValue = rightF[filterOperand];
    const ALLOWED_FUNCS = [ ...GeomFilter_Funcs, ...TextFilter_FullTextSearchFilterKeys] as const;
    let funcName: undefined | typeof ALLOWED_FUNCS[number];
    let funcArgs: undefined | any[];

    if(selItem.column_udt_type === "interval" && isObject(rightF) && Object.values(rightF).every(v => Number.isFinite(v))){
      filterOperand = "=";
      filterValue = Object.entries(rightF).map(([k, v]) => `${v}${k}`).join(" ");
      
    } else if(filterKeys.length !== 1 && selItem.column_udt_type !== "jsonb") {
      return mErr("Bad filter. Expecting one key only");

    } else if(isObject(filterValue) && !(filterValue instanceof Date)){

      /**
       * Filter notation
       * geom && st_makeenvelope(funcArgs)
       */
      const filterValueKeys = Object.keys(filterValue);
      funcName = filterValueKeys[0] as any;
      if(ALLOWED_FUNCS.includes(funcName as any)){
        funcArgs = filterValue[funcName as any];
      } else {
        funcName = undefined;
      }
    } 

    /** st_makeenvelope */
    if(GeomFilterKeys.includes(filterOperand as any) && funcName && GeomFilter_Funcs.includes(funcName as any)){
      
      /** If leftQ is geography then this err can happen: 'Antipodal (180 degrees long) edge detected!' */
      // Disabled due to bad performance
      // if(funcName.toLowerCase() === "st_makeenvelope") {
      //   leftQ += "::geometry";
      // }

      return `${leftQ} ${filterOperand} ${funcName}${parseRightVal(funcArgs, "csv")}`;

    } else if(["=", "$eq"].includes(filterOperand) && !funcName){
      if(filterValue === null) return leftQ + " IS NULL ";
      return leftQ + " = " + parseRightVal(filterValue);

    } else if(["<>", "$ne"].includes(filterOperand)){
      if(filterValue === null) return leftQ + " IS NOT NULL ";
      return leftQ + " <> " + parseRightVal(filterValue);

    } else if([">", "$gt"].includes(filterOperand)){
      return leftQ + " > " + parseRightVal(filterValue);

    } else if(["<", "$lt"].includes(filterOperand)){
      return leftQ + " < " + parseRightVal(filterValue);

    } else if([">=", "$gte"].includes(filterOperand)){
      return leftQ + " >=  " + parseRightVal(filterValue);

    } else if(["<=", "$lte"].includes(filterOperand)){
      return leftQ + " <= " + parseRightVal(filterValue);

    } else if(["$in"].includes(filterOperand)){
      if(!filterValue?.length) {
        return " FALSE ";
      }

      const _fVal: any[] = filterValue.filter((v: any) => v !== null);
      let c1 = "", c2 = "";
      if(_fVal.length) {
        c1 = leftQ + " IN " + parseRightVal(_fVal, "csv");
      }
      if(filterValue.includes(null)) c2 = ` ${leftQ} IS NULL `;
      return [c1, c2].filter(c => c).join(" OR ");

    } else if(["$nin"].includes(filterOperand)){
      if(!filterValue?.length) {
        return " TRUE ";
      }

      const nonNullFilterValues: any[] = filterValue.filter((v: any) => v !== null);
      let c1 = "", c2 = "";
      if(nonNullFilterValues.length) c1 = leftQ + " NOT IN " + parseRightVal(nonNullFilterValues, "csv");
      if(filterValue.includes(null)) c2 = ` ${leftQ} IS NOT NULL `;
      return [c1, c2].filter(c => c).join(" AND ");

    } else if(["$between"].includes(filterOperand)){
      if(!Array.isArray(filterValue) || filterValue.length !== 2){
        return mErr("Between filter expects an array of two values");
      }
      return leftQ + " BETWEEN " + asValue(filterValue[0]) + " AND " + asValue(filterValue[1]);

    } else if(["$ilike"].includes(filterOperand)){
      return leftQ + " ILIKE " + asValue(filterValue);

    } else if(["$like"].includes(filterOperand)){
      return leftQ + " LIKE " + asValue(filterValue);

    } else if(["$nilike"].includes(filterOperand)){
      return leftQ + " NOT ILIKE " + asValue(filterValue);

    } else if(["$nlike"].includes(filterOperand)){
      return leftQ + " NOT LIKE " + asValue(filterValue);

    /* MAYBE TEXT OR MAYBE ARRAY */
    } else if(["@>", "<@", "$contains", "$containedBy", "$overlaps", "&&", "@@"].includes(filterOperand)){
      const operand = filterOperand === "@@"? "@@": 
          ["@>", "$contains"].includes(filterOperand)? "@>" : 
          ["&&", "$overlaps"].includes(filterOperand)? "&&" : 
          "<@";

      /* Array for sure */
      if(Array.isArray(filterValue)){
        return leftQ + operand + parseRightVal(filterValue, "array");
          
      /* FTSQuery */
      } else if(["@@"].includes(filterOperand) && TextFilter_FullTextSearchFilterKeys.includes(funcName! as any)) {
        let lq = `to_tsvector(${leftQ}::text)`;
        if(selItem && selItem.columnPGDataType === "tsvector") lq = leftQ!;

        const res = `${lq} ${operand} ` + `${funcName}${parseRightVal(funcArgs, "csv")}`;

        return res;
      } else {
        return mErr("Unrecognised filter operand: " + filterOperand + " ");
      }

    } else {

      return mErr("Unrecognised filter operand: " + filterOperand + " ");
    }


  } else {

    /* Is an equal filter */
    if(rightF === null){
      return leftQ + " IS NULL ";
    } else {

      /**
       * Ensure that when comparing an array to a json column, the array is cast to json
       */
      let valueStr = asValue(rightF);
      if(selItem?.column_udt_type?.startsWith("json") && Array.isArray(rightF)){
        valueStr = pgp.as.format(`$1::jsonb`, [JSON.stringify(rightF)]);
      } 
      return `${leftQ} = ${valueStr}`;
    }
  }
}

type ParseRightValOpts = {
  expect?: "csv" | "array" | "json" | "jsonb";
  selectItem: SelectItem | undefined;
}
export const parseFilterRightValue = (val: any, { expect, selectItem }: ParseRightValOpts) => {
  const asValue = (v: any) => pgp.as.format("$1", [v]);
  const checkIfArr = () => {
    if(!Array.isArray(val)) {
      throw "This type of filter/column expects an Array of items";
    }
  }
  if(expect === "csv" || expect?.startsWith("json")){
    checkIfArr();
    return pgp.as.format(`($1:${expect})`, [val]);

  } else if(expect === "array" || selectItem?.columnPGDataType === "ARRAY"){
    checkIfArr();        
    return pgp.as.format(" ARRAY[$1:csv]", [val]);

  }

  return asValue(val);
}

// ensure pgp is not NULL!!!
// const asValue = v => v;// pgp.as.value;

// const filters: FilterSpec[] = [
//   ...(["ilike", "like"].map(op => ({ 
//     operands: ["$" + op],
//     tsDataTypes: ["any"] as TSDataType[],
//     tsDefinition: ` { $${op}: string } `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       return `${leftQuery}::text ${op.toUpperCase()} ${asValue(rightVal)}::text` 
//     }
//   }))),
//   { 
//     operands: ["", "="],
//     tsDataTypes: ["any"],
//     tsDefinition: ` { "=": any } | any `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       if(rightVal === null) return`${leftQuery} IS NULL `;
//       return `${leftQuery} = ${asValue(rightVal)}`;
//     }
//   }
// ];