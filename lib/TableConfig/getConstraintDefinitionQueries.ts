import { asName, getKeys } from "prostgles-types";
import { TableConfig } from "./TableConfig";

type Args = {
  tableName: string;
  tableConf: TableConfig[string]
  // tableConf: BaseTableDefinition<LANG_IDS> & (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>)
};

export const getConstraintDefinitionQueries = ({ tableConf, tableName }: Args): string[] | undefined => {

  if ("constraints" in tableConf && tableConf.constraints) {
    const { constraints } = tableConf;
    if(!constraints){
      return undefined;
    }
    const queries: string[] = [];
    if(Array.isArray(constraints)){
      return constraints.map(c => `ALTER TABLE ${asName(tableName)} ADD ${c}`);
    } else {
      const constraintNames = getKeys(tableConf.constraints);
      constraintNames.map(constraintName => {
        const _cnstr = constraints[constraintName];
        const constraintDef = typeof _cnstr === "string"? _cnstr : `${_cnstr.type} (${_cnstr.content})`;
        
        /** Drop constraints with the same name */
        // const existingConstraint = constraints.some(c => c.conname === constraintName);
        // if(existingConstraint){
        //   if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
        // }
        
        queries.push(`ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(constraintName)} ${constraintDef} ;`);
      });
      return queries;
    }
  }
}