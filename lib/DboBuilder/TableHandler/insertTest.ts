import { AnyObject, asName, FieldFilter, FullFilter } from "prostgles-types";
import { LocalParams, pgp } from "../DboBuilder";
import { ParsedTableRule } from "../../PublishParser/PublishParser";
import { asValue } from "../../PubSubManager/PubSubManagerUtils";
import { TableHandler } from "./TableHandler";

type InsertTestArgs = {
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
};
export async function insertTest(this: TableHandler, { localParams, tableRules }: InsertTestArgs) {
  const { testRule } = localParams || {};

  const ACTION = "insert";

  let returningFields: FieldFilter | undefined;
  let forcedData: AnyObject | undefined;
  let fields: FieldFilter | undefined;
  let checkFilter: FullFilter<AnyObject, void> | undefined;
  let testOnly = false;

  if (tableRules) {
    if (!tableRules[ACTION]) throw `${ACTION} rules missing for ${this.name}`;
    returningFields = tableRules[ACTION].returningFields;
    forcedData = tableRules[ACTION].forcedData;
    checkFilter = tableRules[ACTION].checkFilter;
    fields = tableRules[ACTION].fields;

    /* If no returning fields specified then take select fields as returning or the allowed insert fields */
    if (!returningFields) returningFields = tableRules.select?.fields || tableRules.insert.fields;

    if (!fields) throw ` invalid insert rule for ${this.name} -> fields missing `;

    /* Safely test publish rules */
    if (testRule) {
      await this.validateViewRules({
        fields,
        returningFields,
        forcedFilter: forcedData,
        rule: "insert",
      });
      if (checkFilter) {
        try {
          await this.find(checkFilter, { limit: 0 });
        } catch (e) {
          throw `Invalid checkFilter provided for ${this.name}. Error: ${JSON.stringify(e)}`;
        }
      }
      if (forcedData) {
        const keys = Object.keys(forcedData);
        if (keys.length) {
          const dataCols = keys.filter((k) => this.column_names.includes(k));
          const nestedInsertCols = keys.filter(
            (k) => !this.column_names.includes(k) && this.dboBuilder.dbo[k]?.insert
          );
          if (nestedInsertCols.length) {
            throw `Nested insert not supported for forcedData rule: ${nestedInsertCols}`;
          }
          const badCols = keys.filter(
            (k) => !dataCols.includes(k) && !nestedInsertCols.includes(k)
          );
          if (badCols.length) {
            throw `Invalid columns found in forced filter: ${badCols.join(", ")}`;
          }
          try {
            const values =
                "(" +
                dataCols
                  .map(
                    (k) =>
                      asValue(forcedData![k]) +
                      "::" +
                      this.columns.find((c) => c.name === k)!.udt_name
                  )
                  .join(", ") +
                ")",
              colNames = dataCols.map((k) => asName(k)).join(",");
            const query = pgp.as.format(
              "EXPLAIN INSERT INTO " +
                this.escapedName +
                " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;",
              { colNames, values }
            );
            await this.db.any(query);
          } catch (e: any) {
            throw (
              "\nissue with forcedData: \nVALUE: " +
              JSON.stringify(forcedData, null, 2) +
              "\nERROR: " +
              e
            );
          }
        }
      }

      testOnly = true;
    }
  }

  return {
    returningFields,
    fields,
    forcedData,
    checkFilter,
    testOnly,
  };
}
