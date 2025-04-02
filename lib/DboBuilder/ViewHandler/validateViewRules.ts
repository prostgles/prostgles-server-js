import { AnyObject, FieldFilter } from "prostgles-types/dist";
import { UpdateRule } from "../../PublishParser/PublishParser";
import { ViewHandler } from "./ViewHandler";

export async function validateViewRules(
  this: ViewHandler,
  args: {
    fields?: FieldFilter;
    filterFields?: FieldFilter;
    returningFields?: FieldFilter;
    forcedFilter?: AnyObject;
    dynamicFields?: UpdateRule["dynamicFields"];
    rule: "update" | "select" | "insert" | "delete";
  }
) {
  const { fields, filterFields, returningFields, forcedFilter, dynamicFields, rule } = args;

  /* Safely test publish rules */
  if (fields) {
    try {
      const _fields = this.parseFieldFilter(fields);
      if (this.is_media && rule === "insert" && !_fields.includes("id")) {
        throw "Must allow id insert for media table";
      }
    } catch (e) {
      throw (
        ` issue with publish.${this.name}.${rule}.fields: \nVALUE: ` +
        JSON.stringify(fields, null, 2) +
        "\nERROR: " +
        JSON.stringify(e, null, 2)
      );
    }
  }
  if (filterFields) {
    try {
      this.parseFieldFilter(filterFields);
    } catch (e) {
      throw (
        ` issue with publish.${this.name}.${rule}.filterFields: \nVALUE: ` +
        JSON.stringify(filterFields, null, 2) +
        "\nERROR: " +
        JSON.stringify(e, null, 2)
      );
    }
  }
  if (returningFields) {
    try {
      this.parseFieldFilter(returningFields);
    } catch (e) {
      throw (
        ` issue with publish.${this.name}.${rule}.returningFields: \nVALUE: ` +
        JSON.stringify(returningFields, null, 2) +
        "\nERROR: " +
        JSON.stringify(e, null, 2)
      );
    }
  }
  if (forcedFilter) {
    try {
      await this.find(forcedFilter, { limit: 0 });
    } catch (e) {
      throw (
        ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` +
        JSON.stringify(forcedFilter, null, 2) +
        "\nERROR: " +
        JSON.stringify(e, null, 2)
      );
    }
  }
  if (dynamicFields) {
    for (const dfieldRule of dynamicFields) {
      try {
        const { fields, filter } = dfieldRule;
        this.parseFieldFilter(fields);
        await this.find(filter, { limit: 0 });
      } catch (e) {
        throw (
          ` issue with publish.${this.name}.${rule}.dynamicFields: \nVALUE: ` +
          JSON.stringify(dfieldRule, null, 2) +
          "\nERROR: " +
          JSON.stringify(e, null, 2)
        );
      }
    }
  }

  return true;
}
