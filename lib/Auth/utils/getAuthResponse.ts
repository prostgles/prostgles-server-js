import {
  authContract,
  getJSONBSchemaValidationError,
  type AuthOperation,
  type AuthOutput,
  type CommonAuthFailure,
} from "prostgles-types";

export const getAuthResponse = <Operation extends AuthOperation>(
  operation: Operation,
  response: unknown,
): AuthOutput<Operation> | CommonAuthFailure => {
  const validation = getJSONBSchemaValidationError<(typeof authContract)[Operation]["response"]>(
    authContract[operation].response,
    response,
    { allowExtraProperties: true },
  );
  if (validation.error !== undefined) {
    console.error(`Invalid ${operation} authentication callback response: `, validation.error);
    return { success: false, code: "server-error" };
  }
  return validation.data;
};
