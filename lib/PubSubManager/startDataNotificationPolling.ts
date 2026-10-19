import type { PubSubManager } from "./PubSubManager";

export const startDataNotificationPolling = (manager: PubSubManager) => {
  const batchSize = 1000;
  let polling = Promise.resolve();
  let timeout: NodeJS.Timeout | undefined;
  let stopped = false;
  const isStopped = () => stopped || manager.destroyed;
  let refreshPending = false;
  const listener = manager.postgresNotifListenManager;
  if (listener) {
    listener.onReconnect = () => {
      refreshPending = true;
    };
  }
  const poll = () => {
    let delay = 50;
    const onError = (error: unknown) => {
      delay = 1000;
      console.error("Error polling subscription data notifications", error);
    };
    polling = manager.db
      .any<{ id: string; payload: string }>(
        `
          SELECT id, payload FROM prostgles.data_notifications
          WHERE app_id = $1
          ORDER BY id
          LIMIT $2
        `,
        [manager.appId, batchSize],
      )
      .then(async (notifications) => {
        if (isStopped()) return;
        if (refreshPending) {
          refreshPending = false;
          try {
            await manager.refreshTriggers();
            await Promise.all([
              ...manager.subs
                .filter((sub) => sub.is_ready)
                .map((sub) => manager.pushSubData(sub)),
              // Reconcile with the client instead of trusting the cached last synced row.
              ...manager.syncs.map((sync) => manager.syncData(sync, {}, "trigger")),
            ]);
          } catch (error) {
            refreshPending = true;
            throw error;
          }
        }
        if (notifications.length === batchSize) delay = 0;
        const deliveredPayloads = new Set<string>();
        for (const payload of new Set(notifications.map((notification) => notification.payload))) {
          if (isStopped()) return;
          try {
            await manager.notifListener({ payload });
            deliveredPayloads.add(payload);
          } catch (error) {
            onError(error);
          }
        }
        // Acknowledge only delivered rows; lower sequence IDs may still be uncommitted.
        const deliveredIds = notifications
          .filter(({ payload }) => deliveredPayloads.has(payload))
          .map(({ id }) => id);
        if (deliveredIds.length) {
          await manager.db.none(
            "DELETE FROM prostgles.data_notifications WHERE app_id = $1 AND id = ANY($2::bigint[])",
            [manager.appId, deliveredIds],
          );
        }
      })
      .catch(onError)
      .finally(() => {
        if (!stopped && !manager.destroyed) timeout = setTimeout(poll, delay);
      });
  };
  poll();
  return async () => {
    stopped = true;
    if (listener) listener.onReconnect = undefined;
    clearTimeout(timeout);
    await polling;
  };
};
