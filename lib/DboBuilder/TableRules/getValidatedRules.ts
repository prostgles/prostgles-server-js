import { isEmpty, type FieldFilter } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/publishTypesAndUtils";
import type { LocalParams, ValidatedTableRules } from "../DboBuilderTypes";
import type { FieldSpec } from "../QueryBuilder/Functions/Functions";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { COMPUTED_FIELDS } from "../QueryBuilder/Functions/COMPUTED_FIELDS";
import { asNameAlias } from "../../utils/asNameAlias";

export function getValidatedRules(
  this: ViewHandler,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): ValidatedTableRules {
  if (localParams?.clientReq?.socket && !tableRules) {
    throw "INTERNAL ERROR: Unexpected case -> localParams && !tableRules";
  }

  /* Computed fields are allowed only if select is allowed */
  const allColumns: FieldSpec[] = this.column_names
    .slice(0)
    .map(
      (fieldName) =>
        ({
          type: "column",
          name: fieldName,
          getQuery: ({ tableAliasRaw: tableAlias }) => asNameAlias(fieldName, tableAlias),
          selected: false,
        }) as FieldSpec,
    )
    .concat(
      COMPUTED_FIELDS.map((c) => ({
        type: c.type,
        name: c.name,
        getQuery: ({ tableAliasRaw: tableAlias, allowedFields }) =>
          c.getQuery({
            allowedFields,
            ctidField: undefined,
            allColumns: this.columns,

            /* CTID not available in AFTER trigger */
            // ctidField: this.is_view? undefined : "ctid",
            tableAliasRaw: tableAlias,
          }),
        selected: false,
      })),
    );

  if (tableRules) {
    if (isEmpty(tableRules))
      throw "INTERNAL ERROR: Unexpected case -> Empty table rules for " + this.name;
    const throwFieldsErr = (
        command: "select" | "update" | "delete" | "insert",
        fieldType = "fields",
      ) => {
        throw `Invalid publish.${this.name}.${command} rule -> ${fieldType} setting is missing.\nPlease specify allowed ${fieldType} in this format: "*" | { col_name: false } | { col1: true, col2: true }`;
      },
      parseFirstSpecifiedFieldFilter = (...fieldParams: (FieldFilter | undefined)[]): string[] => {
        const firstValid = fieldParams.find((fp) => fp !== undefined);
        return this.parseFieldFilter(firstValid);
      };

    const res: ValidatedTableRules = {
      allColumns,
      getColumns: tableRules.getColumns ?? true,
      getInfo: tableRules.getColumns ?? true,
    };

    if (tableRules.select) {
      if (!tableRules.select.fields) return throwFieldsErr("select");

      let maxLimit: number | null = null;
      if (
        !localParams?.bypassLimit &&
        tableRules.select.maxLimit !== undefined &&
        tableRules.select.maxLimit !== maxLimit
      ) {
        const ml = tableRules.select.maxLimit;
        if (!Number.isInteger(ml) || ml < 0)
          throw (
            ` Invalid publish.${this.name}.select.maxLimit -> expecting   a positive integer OR null    but got ` +
            ml
          );
        maxLimit = ml;
      }

      const fields = this.parseFieldFilter(tableRules.select.fields);
      res.select = {
        fields,
        orderByFields:
          tableRules.select.orderByFields ?
            this.parseFieldFilter(tableRules.select.orderByFields)
          : fields,
        forcedFilter: { ...tableRules.select.forcedFilter },
        filterFields: this.parseFieldFilter(tableRules.select.filterFields),
        maxLimit,
      };
    }

    if (tableRules.update) {
      if (!tableRules.update.fields) return throwFieldsErr("update");

      res.update = {
        fields: this.parseFieldFilter(tableRules.update.fields),
        forcedData: { ...tableRules.update.forcedData },
        forcedFilter: { ...tableRules.update.forcedFilter },
        returningFields: parseFirstSpecifiedFieldFilter(
          tableRules.update.returningFields,
          tableRules.select?.fields,
          tableRules.update.fields,
        ),
        filterFields: this.parseFieldFilter(tableRules.update.filterFields),
      };
    }

    if (tableRules.insert) {
      if (!tableRules.insert.fields) return throwFieldsErr("insert");

      res.insert = {
        fields: this.parseFieldFilter(tableRules.insert.fields),
        forcedData: { ...tableRules.insert.forcedData },
        returningFields: parseFirstSpecifiedFieldFilter(
          tableRules.insert.returningFields,
          tableRules.select?.fields,
          tableRules.insert.fields,
        ),
      };
    }

    if (tableRules.delete) {
      if (!tableRules.delete.filterFields) return throwFieldsErr("delete", "filterFields");

      res.delete = {
        forcedFilter: { ...tableRules.delete.forcedFilter },
        filterFields: this.parseFieldFilter(tableRules.delete.filterFields),
        returningFields: parseFirstSpecifiedFieldFilter(tableRules.delete.returningFields),
      };
    }

    if (!tableRules.select && !tableRules.update && !tableRules.delete && !tableRules.insert) {
      if ([null, false].includes(tableRules.getInfo as any)) res.getInfo = false;
      if ([null, false].includes(tableRules.getColumns as any)) res.getColumns = false;
    }

    return res;
  } else {
    const allCols = this.column_names.slice(0);
    return {
      allColumns,
      getColumns: true,
      getInfo: true,
      select: {
        fields: allCols,
        filterFields: allCols,
        orderByFields: allCols,
        forcedFilter: {},
        maxLimit: null,
      },
      update: {
        fields: allCols,
        filterFields: allCols,
        forcedFilter: {},
        forcedData: {},
        returningFields: allCols,
      },
      insert: {
        fields: allCols,
        forcedData: {},
        returningFields: allCols,
      },
      delete: {
        filterFields: allCols,
        forcedFilter: {},
        returningFields: allCols,
      },
    };
  }
}
