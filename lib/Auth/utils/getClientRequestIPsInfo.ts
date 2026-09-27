import type { ClientSocketWithCachedData } from "../../DboBuilder/DboBuilderTypes";
import type { ExpressReq, LoginClientInfo } from "../AuthTypes";
import type { ServerSideRequest } from "./serverSideRequest";
type ClientReq =
  | { socket: ClientSocketWithCachedData; httpReq?: undefined }
  | { httpReq: ExpressReq; socket?: undefined }
  | ServerSideRequest;
export const getClientRequestIPsInfo = <T extends ClientReq>(req: T): LoginClientInfo => {
  if (req.httpReq) {
    const ip_address = req.httpReq.ip;
    if (!ip_address) throw new Error("ip_address missing from req.httpReq");
    const user_agent = req.httpReq.headers["user-agent"];
    return {
      ip_address,
      ip_address_remote: req.httpReq.connection.remoteAddress,
      x_real_ip: req.httpReq.headers["x-real-ip"] as string | undefined,
      user_agent,
    };
  } else if (req.socket) {
    const ip_address = req.socket.handshake.address;
    if (!ip_address) throw new Error("ip_address missing from req.socket.handshake");
    return {
      ip_address,
      ip_address_remote: req.socket.request.connection.remoteAddress,
      x_real_ip: req.socket.handshake.headers["x-real-ip"] as string | undefined,
      user_agent: req.socket.handshake.headers["user-agent"],
    };
  }
  // Server-side user requests have no network metadata.
  return {
    ip_address: "",
    ip_address_remote: undefined,
    x_real_ip: undefined,
    user_agent: undefined,
  };
};
