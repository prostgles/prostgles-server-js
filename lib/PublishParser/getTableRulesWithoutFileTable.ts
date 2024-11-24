import { getKeys, isObject } from "prostgles-types";
import { AuthResult } from "../Auth/AuthTypes";
import { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import { DEFAULT_SYNC_BATCH_SIZE } from "../PubSubManager/PubSubManager";
import { PublishParser } from "./PublishParser";
import {
  DboTable, ParsedPublishTable, PublishObject, PublishTableRule,
  PublishViewRule, RULE_TO_METHODS, SubscribeRule
} from "./publishTypesAndUtils";

export async function getTableRulesWithoutFileTable(this: PublishParser, { tableName, localParams }: DboTable, clientInfo?: AuthResult, overridenPublish?: PublishObject): Promise<ParsedPublishTable | undefined> {

  if (!localParams || !tableName) throw { stack: ["getTableRules()"], message: "publish OR socket OR dbo OR tableName are missing" };

  const _publish = overridenPublish ?? await this.getPublish(localParams, clientInfo);

  const raw_table_rules = _publish[tableName];
  if (!raw_table_rules || isObject(raw_table_rules) && Object.values(raw_table_rules).every(v => !v)) {
    return undefined;
  }

  let parsed_table: ParsedPublishTable = {};

  /* Get view or table specific rules */
  const tHandler = (this.dbo[tableName] as TableHandler | ViewHandler);
  const is_view = tHandler.is_view;
  /**
   * Allow subscribing to a view if it has primary key columns from other tables
   */
  const canSubscribe = (!is_view || tHandler.columns.some(c => c.references));
  if (!tHandler) {
    throw { stack: ["getTableRules()"], message: `${tableName} could not be found in dbo` };
  }
  
  const MY_RULES = RULE_TO_METHODS.filter(r => {

    /** Check PG User privileges */
    const pgUserIsAllowedThis = tHandler.tableOrViewInfo.privileges[r.sqlRule];
    let result = (!is_view || !r.table_only) && pgUserIsAllowedThis;

    if (!pgUserIsAllowedThis && isObject(raw_table_rules) && (raw_table_rules as PublishTableRule)[r.sqlRule]) {
      throw `Your postgres user is not allowed ${r.sqlRule} on table ${tableName}`;
    }

    // TODO: Implement comprehensive canSubscribe check
    // if ((r.rule === "subscribe" || r.rule === "sync") && !this.prostgles.isSuperUser) {
    //   result = false;
    //   if (isObject(raw_table_rules) && (raw_table_rules as PublishTableRule)[r.rule]) {
    //     throw `Cannot publish realtime rule ${tableName}.${r.rule}. Superuser is required for this`
    //   }
    // }

    if(r.rule === "subscribe" && !canSubscribe){
      result = false;
    }

    return result;
  });



  /* All methods allowed. Add no limits for table rules */
  if ([true, "*"].includes(raw_table_rules as any)) {
    parsed_table = {};
    MY_RULES.filter(r => r.no_limits).forEach(r => {
      parsed_table[r.rule] = { ...r.no_limits as object } as any;
    });

    /** Specific rules allowed */
  } else if (isObject(raw_table_rules) && getKeys(raw_table_rules).length) {
    const allRuleKeys: (keyof PublishViewRule | keyof PublishTableRule)[] = getKeys(raw_table_rules);
    const dissallowedRuleKeys = allRuleKeys.filter(m => !(raw_table_rules as PublishTableRule)[m])

    MY_RULES.map(r => {
      /** Unless specifically disabled these are allowed */
      if (["getInfo", "getColumns"].includes(r.rule) && !dissallowedRuleKeys.includes(r.rule as any)) {
        parsed_table[r.rule] = r.no_limits as any;
        return;
      }

      /** Add no_limit values for implied/ fully allowed methods */
      if ([true, "*"].includes((raw_table_rules as PublishTableRule)[r.rule] as any) && r.no_limits) {
        parsed_table[r.rule] = Object.assign({}, r.no_limits) as any;

        /** Carry over detailed config */
      } else if (isObject((raw_table_rules as any)[r.rule])) {
        parsed_table[r.rule] = (raw_table_rules as any)[r.rule]
      }
    });

    allRuleKeys.filter(m => parsed_table[m])
      .forEach((method) => {
        const rule = parsed_table[method];
        
        const rm = MY_RULES.find(r => r.rule === method || (r.methods as readonly string[]).includes(method));
        if (!rm) {
          let extraInfo = "";
          if (is_view && RULE_TO_METHODS.find(r => !is_view && r.rule === method || (r.methods as any).includes(method))) {
            extraInfo = "You've specified table rules to a view\n";
          }
          throw `Invalid rule in publish.${tableName} -> ${method} \n${extraInfo}Expecting any of: ${MY_RULES.flatMap(r => [r.rule, ...r.methods]).join(", ")}`;
        }

        /* Check RULES for invalid params */
        /* Methods do not have params -> They use them from rules */
        if (method === rm.rule && isObject(rule)) {
          const method_params = Object.keys(rule);
          const allowed_params = Object.keys(rm?.allowed_params)
          const iparam = method_params.find(p => !allowed_params.includes(p));
          if (iparam) {
            throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${allowed_params.join(", ")}`;
          }
        }

        /* Add default params (if missing) */
        if (method === "sync") {

          if ([true, "*"].includes(parsed_table[method] as any)) {
            throw "Invalid sync rule. Expecting { id_fields: string[], synced_field: string } ";
          }

          if (typeof parsed_table[method]?.throttle !== "number") {
            parsed_table[method]!.throttle = 100;
          }
          if (typeof parsed_table[method]?.batch_size !== "number") {
            parsed_table[method]!.batch_size = DEFAULT_SYNC_BATCH_SIZE;
          }
        }

        /* Enable subscribe if not explicitly disabled OR if VIEW with referenced tables */
        const subKey = "subscribe" as const;

        if (method === "select" && !dissallowedRuleKeys.includes(subKey)) {
          const sr = MY_RULES.find(r => r.rule === subKey);
          if (sr && canSubscribe) {
            parsed_table[subKey] = { ...sr.no_limits as SubscribeRule };
            parsed_table.subscribeOne = { ...sr.no_limits as SubscribeRule };
          }
        }
      });

  } else {
    throw "Unexpected publish"
  }

  const getImpliedMethods = (tableRules: ParsedPublishTable): ParsedPublishTable => {
    const res = { ...tableRules };

    /* Add implied methods if not specifically dissallowed */
    MY_RULES.map(r => {

      /** THIS IS A MESS -> some methods cannot be dissallowed (unsync, unsubscribe...) */
      r.methods.forEach(method => {
        const isAllowed = tableRules[r.rule] && (tableRules as any)[method] === undefined;
        if (isAllowed) {

          if (method === "updateBatch" && (!tableRules.update || tableRules.update.checkFilter || tableRules.update.postValidate)) {
            // not allowed

          } else if (method === "upsert" && (!tableRules.update || !tableRules.insert)) {
            // not allowed

          } else {
            (res as any)[method] ??= true;
          }
        }
      });
    });

    return res;
  }

  parsed_table = getImpliedMethods(parsed_table);

  return parsed_table; 
}