import type { ClientSocketWithCachedData } from "../DboBuilder/DboBuilderTypes";
import type { BasicSession } from "./AuthTypes";
import type { GetUserOrRedirected } from "./utils/handleGetUser";

/** Owned by one AuthHandler; pending lookups are invalidated alongside cached results. */
export class SocketSessionCache {
  private readonly sessions = new Map<ClientSocketWithCachedData, SocketSession>();
  private destroyed = false;

  get = async (
    socket: ClientSocketWithCachedData,
    sid: string | undefined,
    lookup: () => Promise<GetUserOrRedirected>,
    onExpire: (session: BasicSession) => void,
  ): Promise<GetUserOrRedirected> => {
    if (this.destroyed || !socket.connected || socket.conn.readyState !== "open")
      throw new Error("Socket authentication was invalidated");
    const cached = this.sessions.get(socket);
    if (cached) {
      cached.checkExpiry();
      return cached.result;
    }

    let session: BasicSession | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      socket.off("disconnect", clear);
      this.sessions.delete(socket);
    };
    const checkExpiry = () => {
      if (session && session.expires <= Date.now()) {
        clear();
        onExpire(session);
        throw new Error("Session has expired");
      }
    };
    const scheduleExpiry = () => {
      if (!session || session.expires === Infinity) return;
      const remaining = session.expires - Date.now();
      if (remaining <= 0) {
        clear();
        onExpire(session);
        return;
      }
      // Node timers overflow after ~25 days. Recheck long-lived sessions in chunks.
      timer = setTimeout(scheduleExpiry, Math.min(remaining, 2 ** 31 - 1));
      timer.unref();
    };
    const entry: SocketSession = {
      clear,
      checkExpiry,
      result: Promise.resolve().then(async () => {
        try {
          const result = await lookup();
          if (
            this.sessions.get(socket) !== entry ||
            !socket.connected ||
            socket.conn.readyState !== "open"
          ) {
            throw new Error("Socket authentication was invalidated");
          }
          if (typeof result === "string" || !result.user || !result.session || !sid) {
            clear();
            return result;
          }
          session = result.session;
          if (
            session.sid !== sid ||
            typeof session.expires !== "number" ||
            Number.isNaN(session.expires)
          ) {
            throw new Error("Invalid session metadata returned by auth.getUser");
          }
          checkExpiry();
          scheduleExpiry();
          return result;
        } catch (error) {
          // A replaced entry belongs to a newer lookup.
          if (this.sessions.get(socket) === entry) clear();
          throw error;
        }
      }),
    };
    this.sessions.set(socket, entry);
    socket.once("disconnect", clear);
    return entry.result;
  };

  delete = (socket: ClientSocketWithCachedData) => {
    this.sessions.get(socket)?.clear();
  };

  destroy = () => {
    this.destroyed = true;
    this.sessions.forEach((session) => session.clear());
  };
}

type SocketSession = {
  result: Promise<GetUserOrRedirected>;
  checkExpiry: () => void;
  clear: () => void;
};
