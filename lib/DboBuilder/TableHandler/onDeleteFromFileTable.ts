import { AnyObject, asName } from "prostgles-types";
import { LocalParams, type Media } from "../DboBuilder";
import { pickKeys } from "../../PubSubManager/PubSubManager";
import { TableHandler } from "./TableHandler";

type OnDeleteFromFileTableArgs = {
  localParams: LocalParams | undefined;
  queryType: "one" | "none" | "many" | "any";
  returningQuery: undefined | string;
  filterOpts: {
    where: string;
    filter: AnyObject;
  };
};
export async function onDeleteFromFileTable(
  this: TableHandler,
  { localParams, queryType, returningQuery, filterOpts }: OnDeleteFromFileTableArgs
) {
  if (!this.dboBuilder.prostgles.fileManager) throw new Error("fileManager missing");
  if (this.dboBuilder.prostgles.opts.fileTable?.delayedDelete) {
    return this.dbHandler[queryType]<void>(
      `UPDATE ${asName(this.name)} SET deleted = now() ${filterOpts.where} ${returningQuery ?? ""};`
    );
  } else {
    const txDelete = async (tbl: TableHandler) => {
      if (!tbl.tx) throw new Error("Missing transaction object tx");
      let files: { id: string; name: string }[] = [];
      const totalFiles = await tbl.count(filterOpts.filter);
      do {
        const batch = (await tbl.find(filterOpts.filter, {
          limit: 100,
          offset: files.length,
        })) as Required<Media>[];
        files = [...files, ...batch];
      } while (files.length < totalFiles);

      const fileManager = tbl.dboBuilder.prostgles.fileManager;
      if (!fileManager) throw new Error("fileManager missing");

      for (const file of files) {
        await tbl.tx.t.any(`DELETE FROM ${asName(this.name)} WHERE id = \${id}`, file);
      }
      /** If any table delete fails then do not delete files */
      for (const file of files) {
        await fileManager.deleteFile(file.name);
        /** TODO: Keep track of deleted files in case of failure */
        // await tbl.t?.any(`UPDATE ${asName(this.name)} SET deleted = NOW(), deleted_from_storage = NOW()  WHERE id = ` + "${id}", file);
      }

      if (returningQuery) {
        return files.map((f) => pickKeys(f, ["id", "name"]));
      }

      return undefined;
    };

    if (localParams?.tx?.dbTX) {
      return txDelete(localParams.tx.dbTX[this.name] as TableHandler);
    } else if (this.tx) {
      return txDelete(this);
    } else {
      return this.dboBuilder.getTX((tx) => {
        return txDelete(tx[this.name] as TableHandler);
      });
    }
  }
}
