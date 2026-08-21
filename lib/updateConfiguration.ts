import { getKeys, includes, isDefined, isEmpty, isEqual } from "prostgles-types";
import type { OnReadyCallbackBasic, UpdatableOptions } from "./initProstgles";
import type { Prostgles } from "./Prostgles";

export const updateConfiguration = async (
  prgl: Prostgles,
  onReady: OnReadyCallbackBasic,
  newOpts: UpdatableOptions<void, any, any>,
  force?: true,
) => {
  const optionsThatChanged = getKeys(newOpts)
    .map((k) => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      if (force || !isEqual(prgl.opts[k], newOpts[k])) {
        //@ts-ignore
        prgl.opts[k] = newOpts[k];
        return k;
      }
      return;
    })
    .filter(isDefined);
  if (!optionsThatChanged.length) {
    console.warn("No options changed");
    return;
  }

  if (includes(optionsThatChanged, "restApi")) {
    prgl.initRestApi();
  }
  if (includes(optionsThatChanged, "tableConfig")) {
    await prgl.initTableConfig({
      type: "prgl.update",
      newOpts,
    });
  }
  if (includes(optionsThatChanged, "schema")) {
    await prgl.refreshDBO();
  }
  if (includes(optionsThatChanged, "auth")) {
    prgl.initAuthHandler();
  }
  if (includes(optionsThatChanged, "io")) {
    prgl.connectedSockets.forEach((socket) => {
      socket.disconnect();
    });
  }

  if (
    includes(optionsThatChanged, "tsGeneratedTypesDir") ||
    includes(optionsThatChanged, "tsGeneratedTypesFunctionsPath")
  ) {
    prgl.writeDBSchema();
  }

  if (isEmpty(newOpts)) return;

  if (
    optionsThatChanged.every((updatedKey) => nonOnReadyUpdateKeys.some((key) => key === updatedKey))
  ) {
    return;
  }

  /**
   * Some of these changes require clients to reconnect
   * While others also affect the server and onReady should be called
   */
  if (
    optionsThatChanged.every((updatedKey) => clientOnlyUpdateKeys.some((key) => key === updatedKey))
  ) {
    prgl.setupSocketIO();
  } else {
    await prgl.init(onReady, {
      type: "prgl.update",
      newOpts,
    });
  }
};

/**
 * Changes that do not affect the server so onReady does not need to be called again
 */
export const clientOnlyUpdateKeys = [
  "io",
  "auth",
  "publish",
  "functions",
  "publishRawSQL",
  "modifyClientSchema",
] as const satisfies (keyof UpdatableOptions)[];

const nonOnReadyUpdateKeys = ["tableHooks"] as const satisfies (keyof UpdatableOptions)[];
