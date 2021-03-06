"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFilterItem = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
exports.parseFilterItem = (args) => {
    const { filter: _f, select, tableAlias, pgp } = args;
    if (!_f || prostgles_types_1.isEmpty(_f))
        return "";
    const mErr = (msg) => {
        throw `${msg}: ${JSON.stringify(_f, null, 2)}`;
    }, asValue = (v) => pgp.as.format("$1", [v]);
    const fKeys = Object.keys(_f);
    if (fKeys.length === 0) {
        return "";
    }
    else if (fKeys.length > 1) {
        return fKeys.map(fk => exports.parseFilterItem({
            filter: { [fk]: _f[fk] },
            select,
            tableAlias,
            pgp
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
            return selItem.getQuery();
        return selItem.getQuery(tableAlias);
    };
    /**
      * Parsed left side of the query
      */
    let leftQ; // = asName(selItem.alias);
    /* Check if string notation. Build obj if necessary */
    const dot_notation_delims = ["->", "."];
    if (!selItem) {
        /* See if dot notation. Pick the best matching starting string */
        if (select) {
            selItem = select.find(s => fKey.startsWith(s.alias) &&
                dot_notation_delims.find(dn => fKey.slice(s.alias.length).startsWith(dn)));
        }
        if (!selItem)
            mErr("Bad filter. Could not match to a column or alias: ");
        const remainingStr = fKey.slice(selItem.alias.length);
        /* Is json path spec */
        if (remainingStr.startsWith("->")) {
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
            /* Is collapsed filter spec  e.g. { "col.$ilike": 'text' } */
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
    if (DboBuilder_1.isPlainObject(rightF)) {
        const parseRightVal = (val, expect = null) => {
            if (expect === "csv") {
                return pgp.as.format("($1:csv)", [val]);
            }
            else if (expect === "array" || selItem && selItem.columnPGDataType && selItem.columnPGDataType === "ARRAY") {
                if (!Array.isArray(val))
                    return mErr("This type of filter/column expects an Array of items");
                return pgp.as.format(" ARRAY[$1:csv]", [val]);
            }
            return asValue(val);
        };
        const filterKeys = Object.keys(rightF);
        if (filterKeys.length !== 1)
            mErr("Bad filter. Expecting one key only");
        const fOpType = filterKeys[0];
        const fVal = rightF[fOpType];
        let sOpType;
        let sVal;
        if (fVal && DboBuilder_1.isPlainObject(fVal)) {
            const keys = Object.keys(fVal);
            if (!keys.length || keys.length !== 1) {
                return mErr("Bad filter. Expecting a nested object with one key only ");
            }
            sOpType = keys[0];
            sVal = fVal[sOpType];
        }
        // console.log({ fOpType, fVal, sOpType })
        if (prostgles_types_1.GeomFilterKeys.includes(fOpType) && sOpType && prostgles_types_1.GeomFilter_Funcs.includes(sOpType)) {
            return leftQ + ` ${fOpType} ` + `${sOpType}${parseRightVal(sVal, "csv")}`;
        }
        else if (["=", "$eq"].includes(fOpType) && !sOpType) {
            if (fVal === null)
                return leftQ + " IS NULL ";
            return leftQ + " = " + parseRightVal(fVal);
        }
        else if (["<>", "$ne"].includes(fOpType)) {
            return leftQ + " <> " + parseRightVal(fVal);
        }
        else if ([">", "$gt"].includes(fOpType)) {
            return leftQ + " > " + parseRightVal(fVal);
        }
        else if (["<", "$lt"].includes(fOpType)) {
            return leftQ + " < " + parseRightVal(fVal);
        }
        else if ([">=", "$gte"].includes(fOpType)) {
            return leftQ + " >=  " + parseRightVal(fVal);
        }
        else if (["<=", "$lte"].includes(fOpType)) {
            return leftQ + " <= " + parseRightVal(fVal);
        }
        else if (["$in"].includes(fOpType)) {
            return leftQ + " IN " + parseRightVal(fVal, "csv");
        }
        else if (["$nin"].includes(fOpType)) {
            return leftQ + " NOT IN " + parseRightVal(fVal, "csv");
        }
        else if (["$between"].includes(fOpType)) {
            if (!Array.isArray(fVal) || fVal.length !== 2) {
                return mErr("Between filter expects an array of two values");
            }
            return leftQ + " BETWEEN " + asValue(fVal[0]) + " AND " + asValue(fVal[1]);
        }
        else if (["$ilike"].includes(fOpType)) {
            return leftQ + " ILIKE " + asValue(fVal);
        }
        else if (["$like"].includes(fOpType)) {
            return leftQ + " LIKE " + asValue(fVal);
            /* MAYBE TEXT OR MAYBE ARRAY */
        }
        else if (["@>", "<@", "$contains", "$containedBy", "&&", "@@"].includes(fOpType)) {
            let operand = fOpType === "@@" ? "@@" :
                ["@>", "$contains"].includes(fOpType) ? "@>" :
                    ["&&"].includes(fOpType) ? "&&" :
                        "<@";
            /* Array for sure */
            if (Array.isArray(fVal)) {
                return leftQ + operand + parseRightVal(fVal, "array");
                /* FTSQuery */
            }
            else if (["@@"].includes(fOpType) && prostgles_types_1.TextFilter_FullTextSearchFilterKeys.includes(sOpType)) {
                let lq = `to_tsvector(${leftQ}::text)`;
                if (selItem && selItem.columnDataType === "tsvector")
                    lq = leftQ;
                let res = `${lq} ${operand} ` + `${sOpType}${parseRightVal(sVal, "csv")}`;
                return res;
            }
            else {
                return mErr("Unrecognised filter operand: " + fOpType + " ");
            }
        }
        else {
            return mErr("Unrecognised filter operand: " + fOpType + " ");
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
//# sourceMappingURL=Filtering.js.map