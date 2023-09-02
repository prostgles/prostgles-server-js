import { JoinPath, RawJoinPath } from "prostgles-types";
import { ViewHandler } from "./ViewHandler";

type parseJoinPathArgs = {
  path: RawJoinPath;
  rootTable: string;
  viewHandler: ViewHandler;
}
export type ParsedJoinPath = { table: string; on: Record<string, string>[] };

/**
 * Return a valid join path
 */
export const parseJoinPath = ({ path, rootTable, viewHandler }: parseJoinPathArgs): ParsedJoinPath[] => {
  const allowMultiOrJoin = false;
  const result: ParsedJoinPath[] = []
  path.forEach((item, i) => {
    const prevTable = result.at(-1)?.table ?? rootTable;
    if(!prevTable) throw `prevTable missing`;

    const pushJoinPath = (targetPath: JoinPath) => {
      const getShortestJoin = i === 1 && path[0] === "**";
      const joinInfo = viewHandler.getJoins(prevTable, [targetPath], { allowMultiOrJoin, getShortestJoin });
      
      joinInfo.paths.forEach(path => {
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

  return result;
}