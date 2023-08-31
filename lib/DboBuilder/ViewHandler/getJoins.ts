import { JoinPath, getKeys } from "prostgles-types";
import { ViewHandler } from "./ViewHandler";
import { JoinInfo } from "../../DboBuilder";

/**
 * Returns all tables and fields required to join from source table to target table
 */
export function getJoins(this: ViewHandler, source: string, target: string, path?: JoinPath, checkTableConfig?: boolean): JoinInfo {

  if (!this.joinPaths) throw `${source} - ${target} Join info missing or dissallowed`;

  if (path && !path.length) throw `Empty join path specified for ${source} <-> ${target}`

  /* Find the join path between tables */
  if (checkTableConfig) {
    const tableConfigJoinInfo = this.dboBuilder?.prostgles?.tableConfigurator?.getJoinInfo(source, target);
    if (tableConfigJoinInfo) return tableConfigJoinInfo;
  }

  let joinInfo: {
    t1: string;
    t2: string;
    path: JoinPath;
  } | undefined;

  if (!path) {
    const _jp = this.joinPaths.find(j => j.t1 === source && j.t2 === target);
    if(_jp){
      joinInfo = {
        ..._jp,
        path: _jp.path.map(table => ({ table }))
      }
      
      _jp.path.map(table => ({ table }))
    }
  } else {
    joinInfo = {
      t1: source,
      t2: target,
      path
    }
  }

  /* Self join */
  if (source === target) {
    const tableHandler = this.dboBuilder.tablesOrViews?.find(t => t.name === source);
    if (!tableHandler) throw `Table not found for joining ${source}`;

    const fcols = tableHandler.columns.filter(c => c.references?.some(({ ftable }) => ftable === this.name));
    if (fcols.length) {
      throw "Self referencing not supported yet"
      // return {
      //     paths: [{
      //         source,
      //         target,
      //         table: target,
      //         on: fcols.map(fc => fc.references!.some(({ fcols }) => fcols.map(fcol => [fc.name,  fcol])))
      //     }],
      //     expectOne: false
      // }
    }
  }
  if (!joinInfo || !this.joinPaths.find(j => path ? j.path.join() === path.join() : j.t1 === source && j.t2 === target)) {
    throw `Joining ${source} <-...-> ${target} dissallowed or missing`;
  }

  /* Make the join chain info */
  const paths: JoinInfo["paths"] = (path || joinInfo.path).map((tablePath, i, arr) => {
    const prevTable = arr[i - 1]!;
    const t1 = i === 0 ? source : prevTable.table;

    this.joins ??= this.dboBuilder.joins;

    /* Get join options */
    const join = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(tablePath.table));
    if (!join) throw `Joining ${t1} <-> ${tablePath} dissallowed or missing`;

    const on: [string, string][][] = [];

    join.on.map(cond => {
      const condArr: [string, string][] = [];
      Object.entries(cond).forEach(([leftKey, rightKey]) => {

        const checkIfOnSpecified = (fields: [l: string, r: string], isLtr: boolean) => {
          if(tablePath.on){
            return Object.entries(tablePath.on).some(on => (isLtr? on : on.slice(0).reverse()).join() === fields.join())
          }

          return true;
        }

        /* Left table is joining on keys OR Left table is joining on values */
        const isLtr = join.tables[0] === t1;
        const fields: [string, string] = isLtr? [leftKey, rightKey] : [rightKey, leftKey];
        if(checkIfOnSpecified(fields, isLtr)){
          condArr.push(fields)
        }
      });
      on.push(condArr);
    })


    return {
      source,
      target,
      table: tablePath.table,
      on
    };
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
  return {
    paths,
    expectOne
  };
}
