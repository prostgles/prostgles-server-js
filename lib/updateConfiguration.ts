import { getKeys, includes, isDefined, isEmpty, isEqual } from "prostgles-types";
import type { SessionUser } from "./Auth/AuthTypes";
import type { OnReadyCallbackBasic, UpdateableOptions } from "./initProstgles";
import type { Prostgles } from "./Prostgles";

export const updateConfiguration = async <DBSchema, UserSchema extends SessionUser>(
  prgl: Prostgles,
  onReady: OnReadyCallbackBasic,
  newOpts: UpdateableOptions<DBSchema, UserSchema>,
  force?: true,
) => {
  const optionsThatChanged = getKeys(newOpts)
    .map((k) => {
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

  if (includes(optionsThatChanged, "fileTable")) {
    await prgl.initFileTable();
  }
  if (includes(optionsThatChanged, "restApi")) {
    prgl.initRestApi();
  }
  if (includes(optionsThatChanged, "tableConfig")) {
    await prgl.initTableConfig({ type: "prgl.update", newOpts });
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

  if (isEmpty(newOpts)) return;

  /**
   * Some of these changes require clients to reconnect
   * While others also affect the server and onReady should be called
   */
  if (
    optionsThatChanged.every((updatedKey) => clientOnlyUpdateKeys.some((key) => key === updatedKey))
  ) {
    prgl.setupSocketIO();
  } else {
    await prgl.init(onReady, { type: "prgl.update", newOpts });
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
] as const satisfies (keyof UpdateableOptions)[];
