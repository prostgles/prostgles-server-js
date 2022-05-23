export { get } from "prostgles-types";


export function isObject(obj: any){
    return Boolean(obj && typeof obj === "object" && !Array.isArray(obj) );
}