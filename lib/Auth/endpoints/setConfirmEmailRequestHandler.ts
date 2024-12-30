import type { Request, Response } from "express";
import e from "express";
import { AuthResponse } from "prostgles-types";
import { AUTH_ROUTES_AND_PARAMS, AuthHandler, HTTP_FAIL_CODES } from "../AuthHandler";
import { SignupWithEmailAndPassword } from "../AuthTypes";
import { getClientRequestIPsInfo } from "../utils/getClientRequestIPsInfo";
import { throttledReject } from "../utils/throttledReject";

export function setConfirmEmailRequestHandler(
  this: AuthHandler,
  emailAuthConfig: SignupWithEmailAndPassword,
  app: e.Express
) {
  const requestHandler = async (
    req: Request,
    res: Response<AuthResponse.AuthFailure | AuthResponse.AuthSuccess>
  ) => {
    const { id } = req.params;
    try {
      if (!id || typeof id !== "string") {
        return res.send({ success: false, code: "something-went-wrong", message: "Invalid code" });
      }
      const { httpReq, ...clientInfo } = getClientRequestIPsInfo({ httpReq: req, res });
      const response = await throttledReject(async () =>
        emailAuthConfig.onEmailConfirmation({
          confirmationCode: id,
          clientInfo,
          req: httpReq,
        })
      );
      if (!response.success) {
        return res.status(HTTP_FAIL_CODES.BAD_REQUEST).json(response);
      }

      /**
       * This approach requires correct handling in setCatchAllRequestHandler to not redirect user.type=public res.redirect("/");
       */
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