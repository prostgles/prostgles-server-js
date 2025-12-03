import { getKeys, isObject } from "prostgles-types";
import type { AuthResultWithSID } from "../Auth/AuthTypes";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import { DEFAULT_SYNC_BATCH_SIZE } from "../PubSubManager/PubSubManagerUtils";
import type { PublishParser } from "./PublishParser";
import type {
  DboTable,
  ParsedPublishTable,
  PublishTableRule,
  PublishViewRule,
  SubscribeRule} from "./publishTypesAndUtils";
import {
  type PublishObject,
  RULE_TO_METHODS
} from "./publishTypesAndUtils";

export async function getTableRulesWithoutFileTable(
  this: PublishParser,
  { tableName, clientReq }: DboTable,
  clientInfo: AuthResultWithSID | undefined,
  overridenPublish?: PublishObject
): Promise<ParsedPublishTable | undefined> {
  if (!tableName) throw new Error("publish OR socket OR dbo OR tableName are missing");

  const publish =
    overridenPublish ?? (clientReq && (await this.getPublishAsObject(clientReq, clientInfo)));

  const rawTableRule = publish?.[tableName];
  if (!rawTableRule || (isObject(rawTableRule) && Object.values(rawTableRule).every((v) => !v))) {
    return undefined;
  }

  let parsedTableRule: ParsedPublishTable = {};

  /* Get view or table specific rules */
  const tHandler = this.dbo[tableName] as TableHandler | ViewHandler | undefined;
  if (!tHandler) {
    throw {
      stack: ["getTableRules()"],
      message: `${tableName} could not be found in dbo`,
    };
  }
  const is_view = tHandler.is_view;
  /**
   * Allow subscribing to a view if it has primary key columns from other tables
   */
  const canSubscribe = !is_view || tHandler.columns.some((c) => c.references);

  const MY_RULES = RULE_TO_METHODS.filter((r) => {
    /** Check PG User privileges */
    const pgUserIsAllowedThis = tHandler.tableOrViewInfo.privileges[r.sqlRule];
    let result = (!is_view || !r.table_only) && pgUserIsAllowedThis;

    if (
      !pgUserIsAllowedThis &&
      isObject(rawTableRule) &&
      (rawTableRule as PublishTableRule)[r.sqlRule]
    ) {
      throw `Your postgres user is not allowed ${r.sqlRule} on table ${tableName}`;
    }

    // TODO: Implement comprehensive canSubscribe check
    // if ((r.rule === "subscribe" || r.rule === "sync") && !this.prostgles.isSuperUser) {
    //   result = false;
    //   if (isObject(raw_table_rules) && (raw_table_rules as PublishTableRule)[r.rule]) {
    //     throw `Cannot publish realtime rule ${tableName}.${r.rule}. Superuser is required for this`
    //   }
    // }

    if (r.rule === "subscribe" && !canSubscribe) {
      result = false;
    }

    return result;
  });

  /* All methods allowed. Add no limits for table rules */
  if ([true, "*"].includes(rawTableRule as any)) {
    parsedTableRule = {};
    MY_RULES.filter((r) => r.no_limits).forEach((r) => {
      parsedTableRule[r.rule] = { ...(r.no_limits as object) } as any;
    });

    /** Specific rules allowed */
  } else if (isObject(rawTableRule) && getKeys(rawTableRule).length) {
    const allRuleKeys: (keyof PublishViewRule | keyof PublishTableRule)[] = getKeys(rawTableRule);
    const dissallowedRuleKeys = allRuleKeys.filter((m) => !(rawTableRule as PublishTableRule)[m]);

    MY_RULES.map((r) => {
      /** Unless specifically disabled these are allowed */
      if (
        ["getInfo", "getColumns"].includes(r.rule) &&
        !dissallowedRuleKeys.includes(r.rule as any)
      ) {
        parsedTableRule[r.rule] = r.no_limits as any;
        return;
      }

      /** Add no_limit values for implied/ fully allowed methods */
      if ([true, "*"].includes((rawTableRule as PublishTableRule)[r.rule] as any) && r.no_limits) {
        parsedTableRule[r.rule] = Object.assign({}, r.no_limits) as any;

        /** Carry over detailed config */
      } else if (isObject((rawTableRule as any)[r.rule])) {
        parsedTableRule[r.rule] = (rawTableRule as any)[r.rule];
      }
    });

    allRuleKeys
      .filter((m) => parsedTableRule[m])
      .forEach((method) => {
        const rule = parsedTableRule[method];

        const ruleInfo = MY_RULES.find(
          (r) => r.rule === method || (r.methods as readonly string[]).includes(method)
        );
        if (!ruleInfo) {
          let extraInfo = "";
          if (
            is_view &&
            RULE_TO_METHODS.find(
              (r) =>
                r.table_only &&
                (r.rule === method || (r.methods as readonly string[]).includes(method))
            )
          ) {
            extraInfo = "You've specified table rules to a view\n";
          }
          throw `Invalid rule in publish.${tableName} -> ${method} \n${extraInfo}Expecting any of: ${MY_RULES.flatMap((r) => [r.rule, ...r.methods]).join(", ")}`;
        }

        /* Check RULES for invalid params */
        /* Methods do not have params -> They use them from rules */
        if (method === ruleInfo.rule && isObject(rule)) {
          const method_params = Object.keys(rule);
          const allowed_params = Object.keys(ruleInfo.allowed_params);
          const iparam = method_params.find((p) => !allowed_params.includes(p));
          if (iparam) {
            throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${allowed_params.join(", ")}`;
          }
        }

        /* Add default params (if missing) */
        if (method === "sync") {
          if ([true, "*"].includes(parsedTableRule[method] as any)) {
            throw "Invalid sync rule. Expecting { id_fields: string[], synced_field: string } ";
          }

          if (typeof parsedTableRule[method]?.throttle !== "number") {
            parsedTableRule[method]!.throttle = 100;
          }
          if (typeof parsedTableRule[method]?.batch_size !== "number") {
            parsedTableRule[method]!.batch_size = DEFAULT_SYNC_BATCH_SIZE;
          }
        }

        /* Enable subscribe if not explicitly disabled OR if VIEW with referenced tables */
        const subKey = "subscribe";

        if (method === "select" && !dissallowedRuleKeys.includes(subKey)) {
          const sr = MY_RULES.find((r) => r.rule === subKey);
          if (sr && canSubscribe) {
            parsedTableRule[subKey] = { ...(sr.no_limits as SubscribeRule) };
            parsedTableRule.subscribeOne = { ...(sr.no_limits as SubscribeRule) };
          }
        }
      });
  } else {
    throw "Unexpected publish";
  }

  const getImpliedMethods = (tableRules: ParsedPublishTable): ParsedPublishTable => {
    const res = { ...tableRules };

    /* Add implied methods if not specifically dissallowed */
    MY_RULES.map((r) => {
      /** THIS IS A MESS -> some methods cannot be dissallowed (unsync, unsubscribe...) */
      r.methods.forEach((method) => {
        const isAllowed = tableRules[r.rule] && (tableRules as any)[method] === undefined;
        if (isAllowed) {
          if (
            method === "updateBatch" &&
            (!tableRules.update || tableRules.update.checkFilter || tableRules.update.postValidate)
          ) {
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
  };

  parsedTableRule = getImpliedMethods(parsedTableRule);

  return parsedTableRule;
}
