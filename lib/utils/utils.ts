export { get } from "prostgles-types";
export const clone = <T extends any[] | Record<string, any>>(obj: T): T => {
  if (typeof structuredClone !== "undefined") {
    return structuredClone(obj);
  }

  return JSON.parse(JSON.stringify(obj)) as T;
};

export const sleep = function (ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const escapeTSNames = (str: string, capitalize = false) => {
  let res = str;
  res = (capitalize ? str[0]?.toUpperCase() : str[0]) + str.slice(1);
  if (canBeUsedAsIsInTypescript(res)) return res;
  return JSON.stringify(res);
};
const canBeUsedAsIsInTypescript = (str: string): boolean => {
  if (!str) return false;
  const isAlphaNumericOrUnderline = str.match(/^[a-z0-9_]+$/i);
  const startsWithCharOrUnderscore = str[0]?.match(/^[a-z_]+$/i);
  return Boolean(isAlphaNumericOrUnderline && startsWithCharOrUnderscore);
};
