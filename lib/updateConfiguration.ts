import { getKeys, includes, isEqual, pickKeys } from "prostgles-types";
import { validateJobControlBindings } from "./Jobs/getJobControlBinding";
import type { OnReadyCallbackBasic, UpdatableOptions } from "./initProstgles";
import type { Prostgles } from "./Prostgles";
import { validateServerFunctions } from "./PublishParser/validateServerFunctions";

export const updateConfiguration = async (
  prgl: Prostgles,
  onReady: OnReadyCallbackBasic,
  newOpts: UpdatableOptions<void, any, any>,
  force?: true,
) => {
  prgl.checkNotDestroyed();
  const optionsThatChanged = getKeys(newOpts).filter(
    /* eslint-disable-next-line @typescript-eslint/unbound-method -- callbacks are compared by reference */
    (key) => force || !isEqual(prgl.opts[key], newOpts[key]),
  );
  if (!optionsThatChanged.length) {
    await prgl.schemaReady;
    console.warn("No options changed");
    return;
  }

  const changedOptions = pickKeys(newOpts, optionsThatChanged, false);
  if ("functions" in changedOptions) {
    validateServerFunctions(changedOptions.functions);
  }
  if ("functions" in changedOptions || "jobs" in changedOptions) {
    validateJobControlBindings({ ...prgl.opts, ...changedOptions });
  }
  if ("functions" in changedOptions) {
    prgl.dboBuilder.functionTsDefinitions = undefined;
  }
  if ("jobs" in changedOptions) {
    await prgl.jobs.stop();
  }
  Object.assign(prgl.opts, changedOptions);
  prgl.invalidateMergedTableConfig();

  // Clear old sockets before either update path initializes the replacement IO.
  if (includes(optionsThatChanged, "io")) {
    prgl.connectedSockets.forEach((socket) => {
      socket.disconnect();
    });
  }

  const onlyUpdatesHooks = optionsThatChanged.every((updatedKey) =>
    nonOnReadyUpdateKeys.some((key) => key === updatedKey),
  );
  const onlyUpdatesClients = optionsThatChanged.every((updatedKey) =>
    clientOnlyUpdateKeys.some((key) => key === updatedKey),
  );
  if (!onlyUpdatesHooks && !onlyUpdatesClients) {
    await prgl.init(onReady, { type: "prgl.update", newOpts });
    return;
  }

  if (includes(optionsThatChanged, "restApi")) {
    prgl.initRestApi();
  }
  if (includes(optionsThatChanged, "schema")) {
    await prgl.refreshDBO();
  }
  if (includes(optionsThatChanged, "publish")) {
    prgl.initPublishParser();
  }
  if (includes(optionsThatChanged, "auth")) {
    prgl.initAuthHandler();
  }
  if (
    includes(optionsThatChanged, "publish") ||
    includes(optionsThatChanged, "tsGeneratedTypesDir") ||
    includes(optionsThatChanged, "tsGeneratedTypesFunctionsPath")
  ) {
    await prgl.writeDBSchema();
  }

  /**
   * Some of these changes require clients to reconnect
   * While others also affect the server and onReady should be called
   */
  if (onlyUpdatesHooks || onlyUpdatesClients) {
    if (includes(optionsThatChanged, "tableHooks") || includes(optionsThatChanged, "publish")) {
      if (!prgl.tableConfigurator) throw new Error("Table configurator is not initialized");
      await prgl.tableConfigurator.sync();
    }
    if (onlyUpdatesClients) prgl.setupSocketIO();
    return;
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
  "modifyClientFunctionSchema",
] as const satisfies (keyof UpdatableOptions)[];

const nonOnReadyUpdateKeys = ["tableHooks"] as const satisfies (keyof UpdatableOptions)[];
