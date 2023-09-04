import { JoinPath, RawJoinPath } from "prostgles-types";
import { ViewHandler } from "./ViewHandler";

type parseJoinPathArgs = {
  rawPath: RawJoinPath;
  rootTable: string;
  viewHandler: ViewHandler;
  allowMultiOrJoin?: boolean;
  addShortestJoinIfMissing?: boolean;
}
export type ParsedJoinPath = { table: string; on: Record<string, string>[] };

/**
 * Return a valid join path
 */
export const parseJoinPath = ({ rawPath, rootTable, viewHandler, allowMultiOrJoin = false, addShortestJoinIfMissing }: parseJoinPathArgs): ParsedJoinPath[] => {
  const result: ParsedJoinPath[] = [];
  let cleanPath = typeof rawPath === "string"? [{ table: rawPath }] : rawPath;
  if(addShortestJoinIfMissing && cleanPath[0] !== "**"){
    cleanPath = ["**", ...cleanPath]
  }
  cleanPath.forEach((item, i) => {
    const prevTable = result.at(-1)?.table ?? rootTable;
    if(!prevTable) throw `prevTable missing`;

    const pushJoinPath = (targetPath: JoinPath) => {
      const getShortestJoin = i === 1 && cleanPath[0] === "**";
      const joinInfo = getJoins(viewHandler, prevTable, [targetPath], { allowMultiOrJoin, getShortestJoin });
      
      joinInfo.paths.forEach(path => {

        /** Check if join tables are valid */
        if (!viewHandler.dboBuilder.dbo[path.table]) {
          throw { stack: ["prepareExistCondition()"], message: `Invalid or dissallowed table in join path: ${path.table}` };
        }
        result.push({
          table: path.table,
          on: path.on.map(constraint => Object.fromEntries(constraint))
        });
      })
    }

    /** Shortest join */
    if(item === "**"){

    } else if(typeof item === "string"){
      const table = item;
      pushJoinPath({ table })
    } else {
      pushJoinPath(item);
    }
  });

  const missingPath = result.find(r => !r.on.length || r.on.some(v => !Object.keys(v).length));
  if(missingPath){
    throw `Missing join on condition for: ${missingPath.table}`
  }

  return result;
}

import { JoinInfo } from "../../DboBuilder";

type Opts = {
  allowMultiOrJoin?: boolean;
  getShortestJoin?: boolean;
}

/**
 * Returns all tables and fields required to join from source table to target table
 * Respecting the path.on condition
 */
function getJoins(viewHandler: ViewHandler, source: string, path: JoinPath[], { allowMultiOrJoin = true, getShortestJoin }: Opts = {}): JoinInfo {
  const [lastItem] = path;
  if(!lastItem){
    throw `Empty path`;
  }
  if(getShortestJoin && path.length !== 1){
    throw `getShortestJoin requires exactly 1 path item`
  }
  const target = lastItem.table;
  if (!viewHandler.joinPaths) {
    throw `Join info missing`;
  }

  /* Self join */
  if (source === target) {
    const tableHandler = viewHandler.dboBuilder.tablesOrViews?.find(t => t.name === source);
    if (!tableHandler) throw `Table not found for joining ${source}`;

    const fcols = tableHandler.columns.filter(c => c.references?.some(({ ftable }) => ftable === viewHandler.name));
    if(!fcols.length){
      throw `There is no self-join foreign key relationship for table ${JSON.stringify(target)}`
    }
    let allOnJoins: [string, string][][] = [];
    fcols.forEach(fc => {
      fc.references!.forEach(({ fcols, cols }) => {
        const fieldArr = fcols.map((fcol, i) => [fcol,  cols[i]!] as [string, string]);
        allOnJoins.push(fieldArr);
      })
    });
    allOnJoins = [
      ...allOnJoins,
      /** Reverse as well */
      ...allOnJoins.map(constraint => (constraint).map(([left, right]) => [right, left] as [string, string]))
    ]
    return {
      paths: [{
        source,
        target,
        table: target,
        on: getValidOn(lastItem.on, allOnJoins.map(v => Object.fromEntries(v)))
      }],
      expectOne: false
    }
  }

  /* Find the join path between tables */
  const tableConfigJoinInfo = viewHandler.dboBuilder?.prostgles?.tableConfigurator?.getJoinInfo(source, target);
  if (tableConfigJoinInfo) return tableConfigJoinInfo;

  const actualPath = getShortestJoin? 
    viewHandler.joinPaths.find(j => {
      return j.t1 === source && j.t2 === target
    })?.path.map(table => ({ table, on: undefined })).slice(1) : 
    viewHandler.joinPaths.find(j => {
      return j.path.join() === [{ table: source }, ...path].map(p => p.table).join()
    })? path : undefined;

  if(getShortestJoin && actualPath?.length && lastItem.on?.length){
    actualPath[actualPath.length-1]!.on = lastItem.on;
  }
  
  if (!actualPath) {
    throw `Joining ${source} <-...-> ${target} dissallowed or missing`;
  }

  /* Make the join chain info */
  const paths: JoinInfo["paths"] = [];
  actualPath.forEach((tablePath, i, arr) => {
    const prevTable = arr[i - 1]!;
    const t1 = i === 0 ? source : prevTable.table;

    viewHandler.joins ??= viewHandler.dboBuilder.joins;

    /* Get join options */
    const join = viewHandler.joins.find(j => j.tables.includes(t1) && j.tables.includes(tablePath.table));
    if (!join) {
      throw `Joining ${t1} <-> ${tablePath} dissallowed or missing`;
    }

    const on = getValidOn(tablePath.on, join.on);

    // join.on.map(fullConstraint => {
    //   const condArr: [string, string][] = [];
    //   Object.entries(fullConstraint).forEach(([leftKey, rightKey]) => {

    //     const checkIfOnSpecified = (fields: [string, string], isLtr: boolean) => {
    //       if(tablePath.on){
    //         return tablePath.on.some(requestedConstraint => {
    //           const consFieldEntries = Object.entries(requestedConstraint)
              
    //           return consFieldEntries.every(consFields => (isLtr? consFields : consFields.slice(0).reverse()).join() === fields.join())
    //         });
    //       }

    //       return true;
    //     }

    //     /* Left table is joining on keys OR Left table is joining on values */
    //     const isLtr = join.tables[0] === t1;
    //     const fields: [string, string] = isLtr? [leftKey, rightKey] : [rightKey, leftKey];
    //     if(checkIfOnSpecified(fields, isLtr)){
    //       condArr.push(fields)
    //     }
    //   });
    //   on.push(condArr);
    // })

    paths.push({
      source,
      target,
      table: tablePath.table,
      on
    });
  });
  const expectOne = false;
  // paths.map(({ source, target, on }, i) => {
  // if(expectOne && on.length === 1){
  //     const sourceCol = on[0][1];
  //     const targetCol = on[0][0];

  //     const sCol = this.dboBuilder.dbo[source].columns.find(c => c.name === sourceCol)
  //     const tCol = this.dboBuilder.dbo[target].columns.find(c => c.name === targetCol)
  //     console.log({ sourceCol, targetCol, sCol, source, tCol, target, on})
  //     expectOne = sCol.is_pkey && tCol.is_pkey
  // }
  // })

  const isMultiOrJoin = paths.find(p => p.on.length > 1);
  if(!allowMultiOrJoin && isMultiOrJoin){
    throw `Table ${JSON.stringify(source)} can join to ${JSON.stringify(target)} through multiple constraints. Must chose one of ${JSON.stringify(isMultiOrJoin.on)}`
  }
  return {
    paths,
    expectOne
  };
}


const getValidOn = (requested: JoinPath["on"], possible: ParsedJoinPath["on"]) => {

  if(!requested){
    return possible.map(v => Object.entries(v));
  }
  if(!requested.length){
    throw `Invalid requested "tablePath.on". Cannot be empty`
  }
  const isValid = requested.every(requestedConstraint => {
    const requestedConsFields = Object.entries(requestedConstraint)
    return possible.some(fullConstraint => {
      const fullConsFields = Object.entries(fullConstraint)
      return fullConsFields.every(fullFields => requestedConsFields.every(requestedFields => requestedFields.join() === fullFields.join()))
    })
  });

  if(!isValid){
    throw `Invalid path specified for join: ${JSON.stringify(requested)}. Allowed paths: ${JSON.stringify(possible)}`
  }

  return requested.map(v => Object.entries(v));
}