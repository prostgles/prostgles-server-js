export { get } from "prostgles-types";


export function isObject(obj: any): obj is Record<string, any> {
    return Boolean(obj && typeof obj === "object" && !Array.isArray(obj) );
}
export const isDefined = <T>(v: T | undefined | void): v is T => v !== undefined && v !== null