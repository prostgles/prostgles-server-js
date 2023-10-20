import pgPromise from "pg-promise";
import { AnyObject, asName, DeleteParams, FieldFilter } from "prostgles-types";
import { Filter, LocalParams, parseError, withUserRLS } from "../DboBuilder";
import { DeleteRule, TableRule } from "../PublishParser";
import { pickKeys } from "../PubSubManager/PubSubManager";
import { TableHandler } from "./TableHandler/TableHandler";
import { runQueryReturnType } from "./find";

export async function _delete(this: TableHandler, filter?: Filter, params?: DeleteParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {
  try {
    await this._log({ command: "delete", localParams, data: { filter, params } });
    const { returning } = params || {};
    filter = filter || {};
    this.checkFilter(filter);

    let forcedFilter: AnyObject | undefined = {},
      filterFields: FieldFilter | undefined = "*",
      returningFields: FieldFilter | undefined = "*",
      validate: DeleteRule["validate"];

    const { testRule = false, returnQuery = false } = localParams || {};
    if (table_rules) {
      if (!table_rules.delete) throw "delete rules missing";
      forcedFilter = table_rules.delete.forcedFilter;
      filterFields = table_rules.delete.filterFields;
      returningFields = table_rules.delete.returningFields;
      validate = table_rules.delete.validate;

      if (!returningFields) returningFields = table_rules?.select?.fields;
      if (!returningFields) returningFields = table_rules?.delete?.filterFields;

      if (!filterFields) throw ` Invalid delete rule for ${this.name}. filterFields missing `;

      /* Safely test publish rules */
      if (testRule) {
        await this.validateViewRules({ filterFields, returningFields, forcedFilter, rule: "delete" });
        return true;
      }
    }


    if (params) {
      const good_paramsObj: Record<keyof DeleteParams, 1> = { returning: 1, returnType: 1 };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    let queryType: keyof pgPromise.ITask<{}> = 'none';
    let _query = `DELETE FROM ${this.escapedName} `;
    const filterOpts = (await this.prepareWhere({
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: table_rules
    }))
    _query += filterOpts.where;
    if (validate) {
      const _filter = filterOpts.filter;
      await validate(_filter);
    }

    let returningQuery = "";
    if (returning) {
      queryType = "any";
      if (!returningFields) {
        throw "Returning dissallowed";
      }
      returningQuery = this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
      _query += returningQuery
    }

    _query = withUserRLS(localParams, _query);
    if (returnQuery) return _query;

    /**
     * Delete file
     */
    if (this.is_media) {
      if (!this.dboBuilder.prostgles.fileManager) throw new Error("fileManager missing")
      if (this.dboBuilder.prostgles.opts.fileTable?.delayedDelete) {
        return this.dbHandler[queryType](`UPDATE ${asName(this.name)} SET deleted = now() ${filterOpts.where} ${returningQuery};`)
      } else {

        const txDelete = async (tbl: TableHandler) => {
          if (!tbl.tx) throw new Error("Missing transaction object tx");
          let files: { id: string; name: string }[] = [];
          const totalFiles = await tbl.count(filterOpts.filter);
          do {
            const batch = await tbl.find(filterOpts.filter, { limit: 100, offset: files.length });
            files = files.concat(batch);
          } while(files.length < totalFiles)
          
          const fileManager = tbl.dboBuilder.prostgles.fileManager
          if (!fileManager) throw new Error("fileManager missing");

          for await (const file of files) {
            await tbl.tx.t.any(`DELETE FROM ${asName(this.name)} WHERE id = \${id}`, file);
          }
          /** If any table delete fails then do not delete files */
          for await (const file of files) {
            await fileManager.deleteFile(file.name);
            /** TODO: Keep track of deleted files in case of failure */
            // await tbl.t?.any(`UPDATE ${asName(this.name)} SET deleted = NOW(), deleted_from_storage = NOW()  WHERE id = ` + "${id}", file);
          }

          if (returning) {
            return files.map(f => pickKeys(f, ["id", "name"]));
          }

          return undefined;
        }

        if (localParams?.tx?.dbTX) {
          return txDelete(localParams.tx.dbTX[this.name] as TableHandler)
        } else if (this.tx) {
          return txDelete(this)
        } else {

          return this.dboBuilder.getTX(tx => {
            return txDelete(tx[this.name] as TableHandler)
          })
        }
      }
    }

    return runQueryReturnType(_query, params?.returnType, this, localParams);

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.delete(${JSON.stringify(filter || {}, null, 2)}, ${JSON.stringify(params || {}, null, 2)})`);
  }
} 