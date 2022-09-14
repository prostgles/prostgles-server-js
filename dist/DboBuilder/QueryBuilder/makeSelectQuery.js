"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeSelectQuery = void 0;
const DboBuilder_1 = require("../../DboBuilder");
const prostgles_types_1 = require("prostgles-types");
/* No validation/authorisation at this point */
function makeSelectQuery(_this, q, depth = 0, joinFields = [], selectParams = {}) {
    const PREF = `prostgles`, joins = q.joins || [], 
    // aggs = q.aggs || [],
    makePref = (q) => !q.tableAlias ? q.table : `${q.tableAlias || ""}_${q.table}`, makePrefANON = (joinAlias, table) => (0, prostgles_types_1.asName)(!joinAlias ? table : `${joinAlias || ""}_${table}`), makePrefAN = (q) => (0, prostgles_types_1.asName)(makePref(q));
    const indentLine = (numInd, str, indentStr = "    ") => new Array(numInd).fill(indentStr).join("") + str;
    const indStr = (numInd, str) => str.split("\n").map(s => indentLine(numInd, s)).join("\n");
    const indjArr = (numInd, strArr, indentStr = "    ") => strArr.map(str => indentLine(numInd, str));
    const indJ = (numInd, strArr, separator = " \n ", indentStr = "    ") => indjArr(numInd, strArr, indentStr).join(separator);
    const selectArrComma = (strArr) => strArr.map((s, i, arr) => s + (i < arr.length - 1 ? " , " : " "));
    const prefJCAN = (q, str) => (0, prostgles_types_1.asName)(`${q.tableAlias || q.table}_${PREF}_${str}`);
    // const indent = (a, b) => a;
    const joinTables = (q1, q2) => {
        const joinInfo = _this.getJoins(q1.table, q2.table, q2.$path, true);
        const paths = joinInfo.paths;
        return paths.flatMap(({ table, on }, i) => {
            const getColName = (col, q) => {
                if (table === q.table) {
                    const colFromSelect = q.select.find(s => s.getQuery() === (0, prostgles_types_1.asName)(col));
                    if (!colFromSelect) {
                        console.error(`${col} column might be missing in user publish `);
                        throw `Could not find join column (${col}) in allowe select. Some join tables and columns might be invalid/dissallowed`;
                    }
                    return colFromSelect.alias;
                }
                return col;
            };
            const getPrevColName = (col) => {
                return getColName(col, q1);
            };
            const getThisColName = (col) => {
                return getColName(col, q2);
            };
            // console.log(JSON.stringify({i, table, on, q1, q2}, null, 2));
            const prevTable = i === 0 ? q1.table : (paths[i - 1].table);
            const thisAlias = makePrefANON(q2.tableAlias, table);
            // const prevAlias = i === 0? makePrefAN(q1) : thisAlias;
            const prevAlias = i === 0 ? makePrefAN(q1) : makePrefANON(q2.tableAlias, prevTable);
            // If root then prev table is aliased from root query. Alias from join otherwise
            let iQ = [
                (0, prostgles_types_1.asName)(table) + ` ${thisAlias}`
            ];
            /* If target table then add filters, options, etc */
            if (i === paths.length - 1) {
                // const targetSelect = (
                //     q2.select.concat(
                //         (q2.joins || []).map(j => j.tableAlias || j.table)
                //     ).concat(
                //         /* Rename aggs to avoid collision with join cols */
                //         (q2.aggs || []).map(a => asName(`agg_${a.alias}`) + " AS " + asName(a.alias)) || [])
                //     ).filter(s => s).join(", ");
                const targetSelect = q2.select.filter(s => s.selected).map(s => {
                    /* Rename aggs to avoid collision with join cols */
                    if (s.type === "aggregation")
                        return (0, prostgles_types_1.asName)(`agg_${s.alias}`) + " AS " + (0, prostgles_types_1.asName)(s.alias);
                    return (0, prostgles_types_1.asName)(s.alias);
                }).concat(q2.joins?.map(j => (0, prostgles_types_1.asName)(j.table)) ?? []).join(", ");
                const _iiQ = makeSelectQuery(_this, q2, depth + 1, 
                // on.map(([c1, c2]) => asName(c2)),
                on.flatMap(cond => cond.map(([c1, c2]) => (0, prostgles_types_1.asName)(c2))), selectParams);
                // const iiQ = flat(_iiQ.split("\n")); // prettify for debugging
                // console.log(_iiQ)
                const iiQ = [_iiQ];
                iQ = [
                    "(",
                    ...indjArr(depth + 1, [
                        `-- 4. [target table] `,
                        `SELECT *,`,
                        `row_number() over() as ${prefJCAN(q2, `rowid_sorted`)},`,
                        `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${prefJCAN(q2, `json`)}`,
                        `FROM (`,
                        ...iiQ,
                        `) ${(0, prostgles_types_1.asName)(q2.table)}    `
                    ]),
                    `) ${thisAlias}`
                ];
            }
            const getJoinCondition = (t1Alias, t2Alias, on) => {
                return on.map(cond => cond.map(([c1, c2]) => `${t1Alias}.${(0, prostgles_types_1.asName)(getPrevColName(c1))} = ${t2Alias}.${(0, prostgles_types_1.asName)(getThisColName(c2))} `).join(" AND ")).join(" OR ");
            };
            let jres = [
                `${q2.isLeftJoin ? "LEFT" : "INNER"} JOIN `,
                ...iQ,
                `ON ${getJoinCondition(prevAlias, thisAlias, on)}`
            ];
            return jres;
        });
    };
    const getGroupBy = (rootSelectItems, groupByItems) => {
        if (groupByItems.length) {
            /** Root Select column index number is used where possible to prevent "non-integer constant in GROUP BY" error */
            return `GROUP BY ` + groupByItems.map(gi => {
                const idx = rootSelectItems.findIndex(si => si.alias === gi.alias);
                if (idx < 0)
                    throw `Could not find GROUP BY column ${gi.alias} in ROOT SELECT ${rootSelectItems.map(s => s.alias)}`;
                return idx + 1;
            }).join(", ");
        }
        return "";
    };
    /* Leaf query -> no joins -> return simple query */
    const aggs = q.select.filter(s => s.type === "aggregation");
    const nonAggs = q.select.filter(s => depth || s.selected).filter(s => s.type !== "aggregation");
    if (!joins.length) {
        /* Nested queries contain all fields to allow joining */
        let groupBy = "";
        const rootSelectItems = q.select.filter(s => joinFields.includes(s.getQuery()) || s.selected);
        /* If aggs exist need to set groupBy add joinFields into select */
        if (aggs.length || selectParams?.groupBy) {
            // const missingFields = joinFields.filter(jf => !q.select.find(s => s.type === "column" && s.alias === jf));
            // if(depth && missingFields.length){
            //     // select = Array.from(new Set(missingFields.concat(select)));
            // }
            if (nonAggs.length) {
                let groupByFields = nonAggs.filter(sf => !depth || joinFields.includes(sf.getQuery()));
                groupBy = getGroupBy(rootSelectItems, groupByFields);
                // if(groupByFields.length){
                //   groupBy = `GROUP BY ${groupByFields.map(sf => sf.type === "function"? sf.getQuery() :  asName(sf.alias)).join(", ")}\n`;
                // }
            }
        }
        // console.log(q.select, joinFields)
        let simpleQuery = indJ(depth, [
            `-- 0. or 5. [leaf query] `
            /* Group by selected fields + any join fields */
            ,
            `SELECT ` + rootSelectItems.map(s => {
                // return s.getQuery() + ((s.type !== "column")? (" AS " + s.alias) : "")
                if (s.type === "aggregation") {
                    /* Rename aggs to avoid collision with join cols */
                    return s.getQuery() + " AS " + (0, prostgles_types_1.asName)((depth ? "agg_" : "") + s.alias);
                }
                return s.getQuery() + " AS " + (0, prostgles_types_1.asName)(s.alias);
            }).join(", "),
            `FROM ${(0, prostgles_types_1.asName)(q.table)} `,
            q.where,
            groupBy //!aggs.length? "" : `GROUP BY ${nonAggs.map(sf => asName(sf.alias)).join(", ")}`,
            ,
            q.having ? `HAVING ${q.having}` : "",
            (0, DboBuilder_1.prepareSort)(q.orderByItems),
            !depth ? `LIMIT ${q.limit} ` : null,
            !depth ? `OFFSET ${q.offset || 0} ` : null
        ].filter(v => v && (v + "").trim().length));
        // console.log(fres);
        return simpleQuery;
    }
    else {
        // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
        if (q.select.find(s => s.type === "aggregation") &&
            joins.find(j => j.select.find(s => s.type === "aggregation")))
            throw "Cannot join two aggregates";
    }
    if (joins && joins.length && (aggs.length || selectParams.groupBy))
        throw "Joins within Aggs dissallowed";
    // if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
    const rootSelectItems = q.select.filter(s => depth || s.selected);
    let rootGroupBy;
    if ((selectParams.groupBy || aggs.length || q.joins && q.joins.length) && nonAggs.length) {
        const groupByItems = (depth ?
            q.allFields.map(f => (0, prostgles_types_1.asName)(f)) :
            nonAggs.map(s => s.type === "function" ? s.getQuery() : (0, prostgles_types_1.asName)(s.alias))).concat((aggs?.length) ?
            [] :
            [`ctid`]).filter(s => s);
        /** Add ORDER BY items not included in root select */
        q.orderByItems.forEach(sortItem => {
            if ("fieldQuery" in sortItem && !groupByItems.includes(sortItem.fieldQuery)) {
                groupByItems.push(sortItem.fieldQuery);
            }
        });
        rootGroupBy = `GROUP BY ${groupByItems.join(", ")} `;
    }
    /* Joined query */
    const joinedQuery = [
        " \n",
        `-- 0. [joined root]  `,
        "SELECT    ",
        ...selectArrComma(rootSelectItems.map(s => s.getQuery() + " AS " + (0, prostgles_types_1.asName)(s.alias)).concat(joins.map((j, i) => {
            /** Apply LIMIT to joined items */
            const jsq = `json_agg(${prefJCAN(j, `json`)}::jsonb ORDER BY ${prefJCAN(j, `rowid_sorted`)}) FILTER (WHERE ${prefJCAN(j, `limit`)} <= ${j.limit} AND ${prefJCAN(j, `dupes_rowid`)} = 1 AND ${prefJCAN(j, `json`)} IS NOT NULL)`;
            const resAlias = (0, prostgles_types_1.asName)(j.tableAlias || j.table);
            // If limit = 1 then return a single json object (first one)
            return (j.limit === 1 ? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) + `  AS ${resAlias}`;
        }))),
        `FROM ( `,
        ...indjArr(depth + 1, [
            "-- 1. [subquery limit + dupes] ",
            "SELECT     ",
            ...selectArrComma([`t1.*`].concat(joins.map((j, i) => {
                return `row_number() over(partition by ${prefJCAN(j, `dupes_rowid`)}, ` +
                    `ctid order by ${prefJCAN(j, `rowid_sorted`)}) AS ${prefJCAN(j, `limit`)}  `;
            }))),
            `FROM ( ----------- ${makePrefAN(q)}`,
            ...indjArr(depth + 1, [
                "-- 2. [source full select + ctid to group by] ",
                "SELECT ",
                ...selectArrComma(q.allFields.concat(["ctid"])
                    .map(field => `${makePrefAN(q)}.${(0, prostgles_types_1.asName)(field)}  `)
                    .concat(joins.map((j, i) => makePrefAN(j) + "." + prefJCAN(j, `json`) + ", " + makePrefAN(j) + "." + prefJCAN(j, `rowid_sorted`)).concat(joins.map(j => `row_number() over(partition by ${makePrefAN(j)}.${prefJCAN(j, `rowid_sorted`)}, ${makePrefAN(q)}.ctid ) AS ${prefJCAN(j, `dupes_rowid`)}`)))),
                `FROM ( `,
                ...indjArr(depth + 1, [
                    "-- 3. [source table] ",
                    "SELECT ",
                    "*, row_number() over() as ctid ",
                    `FROM ${(0, prostgles_types_1.asName)(q.table)} `,
                    `${q.where} `
                ]),
                `) ${makePrefAN(q)} `,
                ...joins.flatMap((j, i) => joinTables(q, j))
            ]),
            ") t1"
        ]),
        ") t0",
        rootGroupBy,
        q.having ? `HAVING ${q.having} ` : "",
        (0, DboBuilder_1.prepareSort)(q.orderByItems),
        depth ? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`,
        "-- EOF 0. joined root",
        " \n"
    ].filter(v => v);
    let res = indJ(depth, joinedQuery);
    // res = indent(res, depth);
    // console.log(res);
    return res;
}
exports.makeSelectQuery = makeSelectQuery;
//# sourceMappingURL=makeSelectQuery.js.map