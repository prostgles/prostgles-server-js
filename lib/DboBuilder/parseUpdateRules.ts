import {
  AnyObject,
  FieldFilter,
  isDefined,
  UpdateParams,
} from "prostgles-types";
import { Filter, LocalParams } from "./DboBuilder";
import {
  TableRule,
  UpdateRule,
  ValidateRowBasic,
  ValidateUpdateRowBasic,
} from "../PublishParser/PublishParser";
import { TableHandler } from "./TableHandler/TableHandler";
import { prepareNewData } from "./TableHandler/DataValidator";

/**
 * 1) Check if publish is valid
 * 2) Retrieve allowed update cols for a specific request
 */
export async function parseUpdateRules(
  this: TableHandler,
  filter: Filter,
  params?: UpdateParams,
  tableRules?: TableRule,
  localParams?: LocalParams,
): Promise<{
  fields: string[];
  validateRow?: ValidateRowBasic;
  finalUpdateFilter: AnyObject;
  forcedData?: AnyObject;
  forcedFilter?: AnyObject;
  returningFields: FieldFilter;
  filterFields?: FieldFilter;
}> {
  const { testRule = false } = localParams ?? {};
  if (!testRule) {
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
    ({ forcedFilter, forcedData, fields, filterFields, validate } =
      tableRules.update);

    returningFields =
      tableRules.update.returningFields ?? tableRules.select?.fields ?? "";

    if (!returningFields && params?.returning) {
      throw "You are not allowed to return any fields from the update";
    }

    if (!fields) {
      throw ` Invalid update rule fo r ${this.name}. fields missing `;
    }
    finalUpdateFilter = (
      await this.prepareWhere({
        select: undefined,
        filter,
        forcedFilter,
        filterFields,
        localParams,
        tableRule: tableRules,
      })
    ).filter;
    if (tableRules.update.dynamicFields?.length) {
      /**
       * dynamicFields.fields used to allow a custom list of fields for specific records
       * dynamicFields.filter cannot overlap each other
       * updates must target records from a specific dynamicFields.filter or not match any dynamicFields.filter
       */
      if (testRule) {
        for await (const [
          dfIndex,
          dfRule,
        ] of tableRules.update.dynamicFields.entries()) {
          /**
           * Validated filter and fields
           */
          const condition = await this.prepareWhere({
            select: undefined,
            filterFields: this.column_names,
            filter: dfRule.filter,
            localParams,
            tableRule: tableRules,
          });
          if (!condition.where) {
            throw (
              "dynamicFields.filter cannot be empty: " + JSON.stringify(dfRule)
            );
          }
          await this.validateViewRules({
            fields: dfRule.fields,
            filterFields,
            returningFields,
            forcedFilter,
            dynamicFields: tableRules.update.dynamicFields,
            rule: "update",
          });

          await this.find(dfRule.filter, { limit: 0 });

          /** Ensure dynamicFields filters do not overlap */
          for await (const [
            _dfIndex,
            _dfRule,
          ] of tableRules.update.dynamicFields.entries()) {
            if (dfIndex !== _dfIndex) {
              if (
                await this.findOne(
                  { $and: [dfRule.filter, _dfRule.filter] },
                  { select: "" },
                )
              ) {
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
      let matchedRule:
        | Required<UpdateRule>["dynamicFields"][number]
        | undefined;
      for await (const dfRule of tableRules.update.dynamicFields) {
        const match = await this.findOne({
          $and: ([finalUpdateFilter, dfRule.filter] as AnyObject[]).filter(
            isDefined,
          ),
        });

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
      await this.validateViewRules({
        fields,
        filterFields,
        returningFields,
        forcedFilter,
        dynamicFields: tableRules.update.dynamicFields,
        rule: "update",
      });
      if (forcedData) {
        try {
          const { data, allowedCols } = await prepareNewData({
            row: forcedData,
            forcedData: undefined,
            allowedFields: "*",
            tableRules,
            removeDisallowedFields: false,
            tableConfigurator: this.dboBuilder.prostgles.tableConfigurator,
            tableHandler: this,
          });
          let updateValidate: ValidateRowBasic | undefined;
          if (validate) {
            if (!localParams) throw "localParams missing";
            updateValidate = (args) =>
              validate!({
                update: args.row,
                filter: {},
                dbx: this.getFinalDbo(localParams),
                localParams,
              });
          }
          const updateQ = (
            await this.dataValidator.parse({
              command: "update",
              rows: [data],
              allowedCols,
              dbTx: this.tx?.dbTX || this.dboBuilder.dbo,
              validationOptions: {
                validate: updateValidate,
                localParams,
              },
            })
          ).getQuery();
          const query = updateQ + " WHERE FALSE ";
          await this.db.any("EXPLAIN " + query);
        } catch (e) {
          throw (
            " issue with forcedData: \nVALUE: " +
            JSON.stringify(forcedData, null, 2) +
            "\nERROR: " +
            e
          );
        }
      }

      return true as unknown as any;
    }
  }

  /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
  const _fields = this.parseFieldFilter(fields);

  let validateRow: ValidateRowBasic | undefined;
  if (validate) {
    if (!localParams) throw "localParams missing";
    validateRow = ({ row }) =>
      validate!({
        update: row,
        filter: finalUpdateFilter,
        localParams,
        dbx: this.getFinalDbo(localParams),
      });
  }

  return {
    fields: _fields,
    validateRow,
    finalUpdateFilter,
    forcedData,
    forcedFilter,
    returningFields,
    filterFields,
  };
}
