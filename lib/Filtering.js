"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFilterItem = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
const parseFilterItem = (args) => {
    const { filter: _f, select, tableAlias, pgp } = args;
    if (!_f || (0, prostgles_types_1.isEmpty)(_f))
        return "";
    const mErr = (msg) => {
        throw `${msg}: ${JSON.stringify(_f, null, 2)}`;
    };
    const asValue = (v) => pgp.as.format("$1", [v]);
    const fKeys = (0, prostgles_types_1.getKeys)(_f);
    if (fKeys.length === 0) {
        return "";
        /**
         * { field1: cond1, field2: cond2 }
         */
    }
    else if (fKeys.length > 1) {
        return fKeys.map(fk => (0, exports.parseFilterItem)({
            filter: { [fk]: _f[fk] },
            select,
            tableAlias,
            pgp,
        }))
            .sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
            .join(" AND ");
    }
    const fKey = fKeys[0];
    /* Exists filter */
    if (prostgles_types_1.EXISTS_KEYS.find(k => k in _f)) {
        // parseExistsFilter()
    }
    let selItem;
    if (select)
        selItem = select.find(s => fKey === s.alias);
    let rightF = _f[fKey];
    const getLeftQ = (selItm) => {
        if (selItm.type === "function")
            return selItm.getQuery();
        return selItm.getQuery(tableAlias);
    };
    /**
      * Parsed left side of the query
      */
    let leftQ; // = asName(selItem.alias);
    /*
      Select item not found.
      Check if dot/json notation. Build obj if necessary
      */
    const dot_notation_delims = ["->", "."];
    if (!selItem) {
        /* See if dot notation. Pick the best matching starting string */
        if (select) {
            selItem = select.find(s => dot_notation_delims.find(delimiter => fKey.startsWith(s.alias + delimiter)));
        }
        if (!selItem) {
            return mErr("Bad filter. Could not match to a column or alias or dot notation: ");
        }
        let remainingStr = fKey.slice(selItem.alias.length);
        /* Is json path spec */
        if (remainingStr.startsWith("->")) {
            /** Has shorthand operand 'col->>key.<>'  */
            const matchingOperand = prostgles_types_1.CompareFilterKeys.find(operand => remainingStr.endsWith(`.${operand}`));
            if (matchingOperand) {
                remainingStr = remainingStr.slice(0, -matchingOperand.length - 1);
                rightF = { [matchingOperand]: rightF };
            }
            leftQ = getLeftQ(selItem);
            const getSep = (fromIdx = 0) => {
                const strPart = remainingStr.slice(fromIdx);
                let idx = strPart.indexOf("->");
                let idxx = strPart.indexOf("->>");
                if (idx > -1) {
                    /* if -> matches then check if it's the last separator */
                    if (idx === idxx)
                        return { idx: idx + fromIdx, sep: "->>" };
                    return { idx: idx + fromIdx, sep: "->" };
                }
                idx = strPart.indexOf("->>");
                if (idx > -1) {
                    return { idx: idx + fromIdx, sep: "->>" };
                }
                return undefined;
            };
            let currSep = getSep();
            while (currSep) {
                let nextSep = getSep(currSep.idx + currSep.sep.length);
                let nextIdx = nextSep ? nextSep.idx : remainingStr.length;
                /* If ending in set then add set as well into key */
                if (nextSep && nextIdx + nextSep.sep.length === remainingStr.length) {
                    nextIdx = remainingStr.length;
                    nextSep = undefined;
                }
                // console.log({ currSep, nextSep })
                leftQ += currSep.sep + asValue(remainingStr.slice(currSep.idx + currSep.sep.length, nextIdx));
                currSep = nextSep;
            }
            /*
              Is collapsed filter spec  e.g. { "col.$ilike": 'text' }
              will transform into { col: { $ilike: ['text'] } }
            */
        }
        else if (remainingStr.startsWith(".")) {
            leftQ = getLeftQ(selItem);
            let getSep = (fromIdx = 0) => {
                const idx = remainingStr.slice(fromIdx).indexOf(".");
                if (idx > -1)
                    return fromIdx + idx;
                return idx;
            };
            let currIdx = getSep();
            let res = {};
            let curObj = res;
            while (currIdx > -1) {
                let nextIdx = getSep(currIdx + 1);
                let nIdx = nextIdx > -1 ? nextIdx : remainingStr.length;
                /* If ending in dot then add dot as well into key */
                if (nextIdx + 1 === remainingStr.length) {
                    nIdx = remainingStr.length;
                    nextIdx = -1;
                }
                const key = remainingStr.slice(currIdx + 1, nIdx);
                curObj[key] = nextIdx > -1 ? {} : _f[fKey];
                curObj = curObj[key];
                currIdx = nextIdx;
            }
            rightF = res;
        }
        else {
            console.trace(141, select, selItem, remainingStr);
            mErr("Bad filter. Could not find the valid col name or alias or col json path");
        }
    }
    else {
        leftQ = getLeftQ(selItem);
    }
    if (!leftQ)
        mErr("Internal error: leftQ missing?!");
    /* Matching sel item */
    if ((0, DboBuilder_1.isPlainObject)(rightF)) {
        const parseRightVal = (val, expect = null) => {
            const checkIfArr = () => {
                if (!Array.isArray(val))
                    return mErr("This type of filter/column expects an Array of items");
            };
            if (expect === "csv") {
                checkIfArr();
                return pgp.as.format("($1:csv)", [val]);
            }
            else if (expect === "array" || selItem && selItem.columnPGDataType && selItem.columnPGDataType === "ARRAY") {
                checkIfArr();
                return pgp.as.format(" ARRAY[$1:csv]", [val]);
            }
            return asValue(val);
        };
        const OPERANDS = [
            ...prostgles_types_1.TextFilterKeys,
            ...prostgles_types_1.JsonbFilterKeys,
            ...prostgles_types_1.CompareFilterKeys,
            ...prostgles_types_1.CompareInFilterKeys
        ];
        const filterKeys = Object.keys(rightF);
        const filterOperand = filterKeys[0];
        /** JSON cannot be compared so we'll cast it to TEXT */
        if (selItem?.column_udt_type === "json" || prostgles_types_1.TextFilterKeys.includes(filterOperand)) {
            leftQ += "::TEXT ";
        }
        /** It's an object key which means it's an equality comparison against a json object */
        if (selItem?.column_udt_type?.startsWith("json") && !OPERANDS.includes(filterOperand)) {
            return leftQ + " = " + parseRightVal(rightF);
        }
        if (filterKeys.length !== 1 && selItem.column_udt_type !== "jsonb") {
            return mErr("Bad filter. Expecting one key only");
        }
        const filterValue = rightF[filterOperand];
        const ALLOWED_FUNCS = [...prostgles_types_1.GeomFilter_Funcs, ...prostgles_types_1.TextFilter_FullTextSearchFilterKeys];
        let funcName;
        let funcArgs;
        /**
         * Filter notation
         * geom && st_makeenvelope(funcArgs)
         */
        if ((0, prostgles_types_1.isObject)(filterValue) && !(filterValue instanceof Date)) {
            const filterValueKeys = Object.keys(filterValue);
            // if(!filterValueKeys.length || filterValueKeys.length !== 1){
            //   return mErr("Bad filter. Expecting a nested object with one key only but got: " + JSON.stringify(filterValue, null, 2));
            // }
            funcName = filterValueKeys[0];
            if (ALLOWED_FUNCS.includes(funcName)) {
                funcArgs = filterValue[funcName];
                // return mErr(`Bad filter. Nested function ${funcName} could not be found. Expecting one of: ${ALLOWED_FUNCS}`);
            }
            else {
                funcName = undefined;
            }
        }
        /** st_makeenvelope */
        if (prostgles_types_1.GeomFilterKeys.includes(filterOperand) && funcName && prostgles_types_1.GeomFilter_Funcs.includes(funcName)) {
            /** If leftQ is geography then this err can happen: 'Antipodal (180 degrees long) edge detected!' */
            if (funcName.toLowerCase() === "st_makeenvelope") {
                leftQ += "::geometry";
            }
            return `${leftQ} ${filterOperand} ${funcName}${parseRightVal(funcArgs, "csv")}`;
        }
        else if (["=", "$eq"].includes(filterOperand) && !funcName) {
            if (filterValue === null)
                return leftQ + " IS NULL ";
            return leftQ + " = " + parseRightVal(filterValue);
        }
        else if (["<>", "$ne"].includes(filterOperand)) {
            if (filterValue === null)
                return leftQ + " IS NOT NULL ";
            return leftQ + " <> " + parseRightVal(filterValue);
        }
        else if ([">", "$gt"].includes(filterOperand)) {
            return leftQ + " > " + parseRightVal(filterValue);
        }
        else if (["<", "$lt"].includes(filterOperand)) {
            return leftQ + " < " + parseRightVal(filterValue);
        }
        else if ([">=", "$gte"].includes(filterOperand)) {
            return leftQ + " >=  " + parseRightVal(filterValue);
        }
        else if (["<=", "$lte"].includes(filterOperand)) {
            return leftQ + " <= " + parseRightVal(filterValue);
        }
        else if (["$in"].includes(filterOperand)) {
            if (!filterValue?.length) {
                return " FALSE ";
            }
            let _fVal = filterValue.filter((v) => v !== null);
            let c1 = "", c2 = "";
            if (_fVal.length) {
                c1 = leftQ + " IN " + parseRightVal(_fVal, "csv");
            }
            if (filterValue.includes(null))
                c2 = ` ${leftQ} IS NULL `;
            return [c1, c2].filter(c => c).join(" OR ");
        }
        else if (["$nin"].includes(filterOperand)) {
            if (!filterValue?.length) {
                return " TRUE ";
            }
            let _fVal = filterValue.filter((v) => v !== null);
            let c1 = "", c2 = "";
            if (_fVal.length)
                c1 = leftQ + " NOT IN " + parseRightVal(_fVal, "csv");
            if (filterValue.includes(null))
                c2 = ` ${leftQ} IS NOT NULL `;
            return [c1, c2].filter(c => c).join(" AND ");
        }
        else if (["$between"].includes(filterOperand)) {
            if (!Array.isArray(filterValue) || filterValue.length !== 2) {
                return mErr("Between filter expects an array of two values");
            }
            return leftQ + " BETWEEN " + asValue(filterValue[0]) + " AND " + asValue(filterValue[1]);
        }
        else if (["$ilike"].includes(filterOperand)) {
            return leftQ + " ILIKE " + asValue(filterValue);
        }
        else if (["$like"].includes(filterOperand)) {
            return leftQ + " LIKE " + asValue(filterValue);
        }
        else if (["$nilike"].includes(filterOperand)) {
            return leftQ + " NOT ILIKE " + asValue(filterValue);
        }
        else if (["$nlike"].includes(filterOperand)) {
            return leftQ + " NOT LIKE " + asValue(filterValue);
            /* MAYBE TEXT OR MAYBE ARRAY */
        }
        else if (["@>", "<@", "$contains", "$containedBy", "&&", "@@"].includes(filterOperand)) {
            let operand = filterOperand === "@@" ? "@@" :
                ["@>", "$contains"].includes(filterOperand) ? "@>" :
                    ["&&"].includes(filterOperand) ? "&&" :
                        "<@";
            /* Array for sure */
            if (Array.isArray(filterValue)) {
                return leftQ + operand + parseRightVal(filterValue, "array");
                /* FTSQuery */
            }
            else if (["@@"].includes(filterOperand) && prostgles_types_1.TextFilter_FullTextSearchFilterKeys.includes(funcName)) {
                let lq = `to_tsvector(${leftQ}::text)`;
                if (selItem && selItem.columnPGDataType === "tsvector")
                    lq = leftQ;
                let res = `${lq} ${operand} ` + `${funcName}${parseRightVal(funcArgs, "csv")}`;
                return res;
            }
            else {
                return mErr("Unrecognised filter operand: " + filterOperand + " ");
            }
        }
        else {
            return mErr("Unrecognised filter operand: " + filterOperand + " ");
        }
    }
    else {
        /* Is an equal filter */
        if (rightF === null) {
            return leftQ + " IS NULL ";
        }
        else {
            return leftQ + " = " + asValue(rightF);
        }
    }
};
exports.parseFilterItem = parseFilterItem;
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
