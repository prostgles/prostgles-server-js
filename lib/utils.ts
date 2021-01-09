

/* Get nested property from an object */
export function get(obj: any, propertyPath: string | string[]): any{

  let p = propertyPath,
      o = obj;

  if(!obj) return obj;
  if(typeof p === "string") p = p.split(".");
  return p.reduce((xs, x) =>{ 
      if(xs && xs[x]) { 
          return xs[x] 
      } else {
          return undefined; 
      } 
  }, o);
}