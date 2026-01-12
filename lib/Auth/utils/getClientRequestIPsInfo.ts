import type { PRGLIOSocket } from "../../DboBuilder/DboBuilderTypes";
import type { ExpressReq, LoginClientInfo } from "../AuthTypes";
type ClientReq =
  | { socket: PRGLIOSocket; httpReq?: undefined }
  | { httpReq: ExpressReq; socket?: undefined };
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
  } else {
    const ip_address = req.socket.handshake.address;
    if (!ip_address) throw new Error("ip_address missing from req.socket.handshake");
    return {
      ip_address,
      ip_address_remote: req.socket.request.connection.remoteAddress,
      x_real_ip: req.socket.handshake.headers?.["x-real-ip"] as string | undefined,
      user_agent: req.socket.handshake.headers?.["user-agent"] as string | undefined,
    };
  }
};
