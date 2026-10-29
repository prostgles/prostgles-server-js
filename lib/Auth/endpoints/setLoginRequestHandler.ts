import type e from "express";
import type { Response } from "express";
import type { AuthOutput } from "prostgles-types";
import type { AuthHandler } from "../AuthHandler";
import { createAuthRequestHandler } from "../utils/createAuthRequestHandler";

export type LoginResponse = AuthOutput<"login">;
export type LoginResponseHandler = Response<LoginResponse>;

export function setLoginRequestHandler(this: AuthHandler, app: e.Express) {
  app.post(
    this.authRoutes.login,
    createAuthRequestHandler("login", async (loginData, req, res) => {
      await this.login(req, res, { ...loginData, type: "username" });
    }),
  );
}
