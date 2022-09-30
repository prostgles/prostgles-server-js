export { get } from "prostgles-types";
export const clone = <T extends any[] | Record<string, any>>(obj: T): T => {
  if(structuredClone !== undefined){
    return structuredClone(obj);
  }
  
  return JSON.parse(JSON.stringify(obj));
}