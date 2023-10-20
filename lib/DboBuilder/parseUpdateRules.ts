import { AnyObject, FieldFilter, isDefined, UpdateParams } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule, UpdateRule, ValidateRow, ValidateUpdateRowBasic } from "../PublishParser";
import { TableHandler } from "./TableHandler/TableHandler";

/**
 * 1) Check if publish is valid
 * 2) Retrieve allowed update cols for a specific request
 */
export async function parseUpdateRules(
  this: TableHandler,
  filter: Filter,
  newData: AnyObject,
  params?: UpdateParams,
  tableRules?: TableRule,
  localParams?: LocalParams
): Promise<{
  fields: string[];
  validateRow?: ValidateRow;
  finalUpdateFilter: AnyObject;
  forcedData?: AnyObject;
  forcedFilter?: AnyObject;
  returningFields: FieldFilter;
  filterFields?: FieldFilter;
}> {
  const { testRule = false } = localParams ?? {};
  if (!testRule) {
    if (!newData || !Object.keys(newData).length) {
      throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
    }
    this.checkFilter(filter);
  }

  let forcedFilter: AnyObject | undefined = {},
    forcedData: AnyObject | undefined = {},
    validate: ValidateUpdateRowBasic | undefined,
    returningFields: FieldFilter = "*",
    filterFields: FieldFilter | undefined = "*",
    fields: FieldFilter = "*";

  let finalUpdateFilter = { ...filter };

  if (tableRules) {
    if (!tableRules.update) throw "update rules missing for " + this.name;
    ({ forcedFilter, forcedData, fields, filterFields, validate } = tableRules.update);

    returningFields = tableRules.update.returningFields ?? tableRules?.select?.fields ?? "";

    if (!returningFields && params?.returning) {
      throw "You are not allowed to return any fields from the update"
    }

    if (!fields) {
      throw ` Invalid update rule fo r ${this.name}. fields missing `;
    }
    finalUpdateFilter = (await this.prepareWhere({ filter, forcedFilter, filterFields, localParams, tableRule: tableRules })).filter;
    if (forcedFilter) {
      const match = await this.findOne(finalUpdateFilter);
      const requiredItem = await this.findOne(filter);
      if (!match && requiredItem) {
        fields = [];
      }
    }
    if (tableRules.update.dynamicFields?.length) {

      /**
       * dynamicFields.fields used to allow a custom list of fields for specific records
       * dynamicFields.filter cannot overlap each other
       * updates must target records from a specific dynamicFields.filter or not match any dynamicFields.filter
       */
      if (testRule) {
        for await (const [dfIndex, dfRule] of tableRules.update.dynamicFields.entries()) {

          /**
           * Validated filter and fields
           */
          const condition = await this.prepareWhere({ filterFields: this.column_names, filter: dfRule.filter, localParams, tableRule: tableRules }); 
          if (!condition.where) throw "dynamicFields.filter cannot be empty: " + JSON.stringify(dfRule);
          await this.validateViewRules({ fields: dfRule.fields, filterFields, returningFields, forcedFilter, dynamicFields: tableRules.update.dynamicFields, rule: "update" });


          await this.find(dfRule.filter, { limit: 0 });

          /** Ensure dynamicFields filters do not overlap */
          for await (const [_dfIndex, _dfRule] of tableRules.update.dynamicFields.entries()) {
            if (dfIndex !== _dfIndex) {
              if (await this.findOne({ $and: [dfRule.filter, _dfRule.filter] }, { select: "" })) {
                throw `dynamicFields.filter cannot overlap each other. \n
                                Overlapping dynamicFields rules:
                                    ${JSON.stringify(dfRule)} 
                                    AND
                                    ${JSON.stringify(_dfRule)} 
                                `;
              }
            }
          }
        }
      }

      /** Pick dynamicFields.fields if matching filter */
      let matchedRule: Required<UpdateRule>["dynamicFields"][number] | undefined;
      for await (const dfRule of tableRules.update.dynamicFields) {
        const match = await this.findOne({ $and: ([finalUpdateFilter, dfRule.filter]  as AnyObject[]).filter(isDefined) });

        if (match) {

          /** Ensure it doesn't overlap with other dynamicFields.filter */
          if (matchedRule && !testRule) {
            throw "Your update is targeting multiple tableRules.update.dynamicFields. Restrict update filter to only target one rule";
          }

          matchedRule = dfRule;
          fields = dfRule.fields;
        }
      }
    }

    /* Safely test publish rules */
    if (testRule) {
      await this.validateViewRules({ fields, filterFields, returningFields, forcedFilter, dynamicFields: tableRules.update.dynamicFields, rule: "update" });
      if (forcedData) {
        try {
          const { data, allowedCols } = this.validateNewData({ row: forcedData, forcedData: undefined, allowedFields: "*", tableRules, fixIssues: false });
          const updateQ = await this.colSet.getUpdateQuery(
            data,
            allowedCols,
            this.tx?.dbTX || this.dboBuilder.dbo,
            validate ? ((row) => validate!({ update: row, filter: {} }, this.tx?.dbTX || this.dboBuilder.dbo)) : undefined
          );
          const query = updateQ + " WHERE FALSE ";
          await this.db.any("EXPLAIN " + query);
        } catch (e) {
          throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
        }
      }

      return true as unknown as any;
    }
  }

  /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
  const _fields = this.parseFieldFilter(fields);

  const validateRow: ValidateRow | undefined = validate ? (row) => validate!({ update: row, filter: finalUpdateFilter }, this.tx?.dbTX || this.dboBuilder.dbo) : undefined

  return {
    fields: _fields,
    validateRow,
    finalUpdateFilter,
    forcedData,
    forcedFilter,
    returningFields,
    filterFields,
  }
}