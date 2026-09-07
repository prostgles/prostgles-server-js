import type { DB } from "./initProstgles";

/** Keep the original connection available for schema SQL; defer application calls. */
export const deferDbQueries = (
  db: DB,
  getSchemaReady: () => Promise<void>,
): DB =>
  new Proxy(db, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      // Connection metadata and lifecycle methods remain unchanged.
      if (
        !Object.hasOwn(target, key) ||
        typeof value !== "function" ||
        String(key).startsWith("$")
      )
        return value;
      return async (...args: unknown[]) => {
        let ready: Promise<void>;
        do {
          ready = getSchemaReady();
          await ready;
        } while (ready !== getSchemaReady());
        return Reflect.apply(value, target, args) as unknown;
      };
    },
  });
