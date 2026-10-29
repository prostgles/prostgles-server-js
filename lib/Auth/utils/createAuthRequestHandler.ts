import type { NextFunction, Request, Response } from "express";
import {
  authContract,
  getJSONBSchemaValidationError,
  type AuthInput,
  type AuthOperation,
  type AuthOutput,
  type CommonAuthFailure,
  type MaybePromise,
} from "prostgles-types";
import { HTTP_FAIL_CODES, HTTP_SUCCESS_CODES } from "../AuthHandler";
import { getAuthResponse } from "./getAuthResponse";

export const createAuthRequestHandler = <Operation extends AuthOperation>(
  operation: Operation,
  handler: (
    data: AuthInput<Operation>,
    req: Request,
    res: Response<AuthOutput<Operation> | CommonAuthFailure>,
  ) => MaybePromise<AuthOutput<Operation> | void>,
  options?: {
    allowExtraProperties?: boolean;
    dataSource?: "body" | "params" | "query";
    failureStatusCode?: number;
    onError?: (error: unknown) => CommonAuthFailure;
  },
) => {
  return async (
    req: Request,
    res: Response<AuthOutput<Operation> | CommonAuthFailure>,
    next: NextFunction,
  ) => {
    const sendResponse = (
      response: unknown,
      failureStatusCode: number = HTTP_FAIL_CODES.BAD_REQUEST,
    ) => {
      const validatedResponse = getAuthResponse(operation, response);
      res
        .status(validatedResponse.success ? HTTP_SUCCESS_CODES.OK : failureStatusCode)
        .json(validatedResponse);
    };
    try {
      const validation = getJSONBSchemaValidationError<(typeof authContract)[Operation]["request"]>(
        authContract[operation].request,
        req[options?.dataSource ?? "body"],
        {
          allowExtraProperties: options?.allowExtraProperties,
        },
      );
      if (validation.error !== undefined) {
        sendResponse({
          success: false,
          code: "something-went-wrong",
          message: validation.error,
        });
        return;
      }
      const response = await handler(validation.data, req, res);
      /* Session handlers send their own cookies and redirects. */
      if (!res.headersSent) {
        sendResponse(response, options?.failureStatusCode);
      }
    } catch (error) {
      if (res.headersSent) {
        return next(error);
      }

      const errorResponse = options?.onError?.(error) ?? {
        success: false,
        code: "server-error",
      };
      sendResponse(errorResponse);
    }
  };
};
