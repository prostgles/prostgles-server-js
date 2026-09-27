import type { AuthClientRequest } from "../AuthTypes";
import type { Prostgles } from "../../Prostgles";

/** This capability cannot be supplied through JSON, HTTP or socket payloads. */
const serverSideUser = Symbol("serverSideUser");

export type ServerSideRequest = {
  readonly [serverSideUser]: { readonly prostgles: Prostgles; readonly userId: string };
  socket?: undefined;
  httpReq?: undefined;
  res?: undefined;
};

export const createServerSideRequest = (prostgles: Prostgles, userId: string): ServerSideRequest => {
  if (typeof userId !== "string" || !userId.length) {
    throw new Error("userId must be a non-empty string");
  }
  return Object.freeze({
    [serverSideUser]: Object.freeze({ prostgles, userId }),
  });
};

export const getServerSideUserId = (prostgles: Prostgles, request: AuthClientRequest) =>
  !request.socket && !request.httpReq &&
  serverSideUser in request && request[serverSideUser].prostgles === prostgles ?
    request[serverSideUser].userId
  : undefined;
