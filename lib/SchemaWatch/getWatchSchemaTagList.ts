import { getKeys, isObject } from "prostgles-types";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import { ProstglesInitOptions } from "../Prostgles";

export const getWatchSchemaTagList = (watchSchema: ProstglesInitOptions["watchSchema"]) => {
  if(!watchSchema) return undefined;

  if(watchSchema === "*"){
    return EVENT_TRIGGER_TAGS.slice(0);
  } 
  if (isObject(watchSchema) && typeof watchSchema !== "function"){
    const watchSchemaKeys = getKeys(watchSchema);
    const isInclusive = Object.values(watchSchema).every(v => v);
    return EVENT_TRIGGER_TAGS
      .slice(0)
      .filter(v => {
        const matches = watchSchemaKeys.includes(v);
        return isInclusive? matches : !matches;
      });
  }

  const coreTags: typeof EVENT_TRIGGER_TAGS[number][] = [
    'COMMENT', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 
    'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE POLICY'
  ];
  return coreTags;
}