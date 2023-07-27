import { AnyObject } from "prostgles-types";

export { get } from "prostgles-types";
export const clone = <T extends any[] | Record<string, any>>(obj: T): T => {
  if(typeof structuredClone !== "undefined"){
    return structuredClone(obj);
  }
  
  return JSON.parse(JSON.stringify(obj));
}

export const tryCatch = async <T extends AnyObject>(func: () => T | Promise<T>): 
  Promise<T & { error?: undefined; duration: number; } | Partial<Record<keyof T, undefined>> & { error: unknown; duration: number; }> => {
  const startTime = Date.now();
  try {
    const res = await func();
    return {
      ...res,
      duration: Date.now() - startTime,
    }
  } catch(error){
    return { 
      error,
      duration: Date.now() - startTime, 
    } as any;
  }
}