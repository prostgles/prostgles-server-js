import type { Request, Response } from "express";
import { AuthFailure, AuthResponse } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { AuthRegistrationConfig } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import e from "express";

export function setConfirmEmailRequestHandler(
  this: AuthHandler,
  emailAuthConfig: Extract<
    Required<AuthRegistrationConfig<void>>["email"],
    { signupType: "withPassword" }
  >,
  app: e.Express
) {
  const requestHandler = async (
    req: Request,
    res: Response<AuthFailure | AuthResponse.AuthSuccess>
  ) => {
    const { id } = req.params;
    try {
      if (!id || typeof id !== "string") {
        return res.send({ success: false, code: "something-went-wrong", message: "Invalid code" });
      }
      const { httpReq, ...clientInfo } = getClientRequestIPsInfo({ httpReq: req, res });
      const response = await this.throttledFunc(async () =>
        emailAuthConfig.onEmailConfirmation({
          confirmationCode: id,
          clientInfo,
          req: httpReq,
        })
      );
      if (typeof response === "string") {
        return res
          .status(HTTP_FAIL_CODES.BAD_REQUEST)
          .json({ success: false, code: "something-went-wrong" });
      }
      if (response.redirect_to) {
        return res.redirect(response.redirect_to);
      }
      res.json(response);
    } catch (_e) {
      res
        .status(HTTP_FAIL_CODES.BAD_REQUEST)
        .json({ success: false, code: "server-error", message: "Failed to confirm email" });
    }
  };

  app.get(AUTH_ROUTES_AND_PARAMS.confirmEmailExpressRoute, requestHandler);
}
