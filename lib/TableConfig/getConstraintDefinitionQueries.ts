import { asName } from "prostgles-types";
import type { TableConfig } from "./TableConfig";

type Args = {
  tableName: string;
  tableConf: TableConfig[string];
  // tableConf: BaseTableDefinition<LANG_IDS> & (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>)
};

export type ConstraintDef = {
  /**
   * Named constraints are used to show a relevant error message
   */
  name?: string;
  content: string;
  alterQuery: string;
};
export const getConstraintDefinitionQueries = ({
  tableConf,
  tableName,
}: Args): ConstraintDef[] | undefined => {
  if ("constraints" in tableConf && tableConf.constraints) {
    const { constraints } = tableConf;

    if (Array.isArray(constraints)) {
      return constraints.map((c) => ({
        content: c,
        alterQuery: `ALTER TABLE ${asName(tableName)} ADD ${c}`,
      }));
    } else {
      const constraintNames = Object.keys(constraints);
      return constraintNames.map((constraintName) => {
        const _cnstr = constraints[constraintName]!;
        const constraintDef =
          typeof _cnstr === "string" ? _cnstr : `${_cnstr.type} (${_cnstr.content})`;

        /** Drop constraints with the same name */
        // const existingConstraint = constraints.some(c => c.conname === constraintName);
        // if(existingConstraint){
        //   if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
        // }

        const alterQuery = `ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(constraintName)} ${constraintDef};`;

        return { name: constraintName, alterQuery, content: constraintDef };
      });
    }
  }
};
