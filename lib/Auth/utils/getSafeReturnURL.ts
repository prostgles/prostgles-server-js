export const getSafeReturnURL = (
  returnURL: string,
  returnUrlParamName: string,
  quiet = false,
) => {
  /** Dissalow redirect to other domains */
  if (returnURL) {
    const allowedOrigin = "https://localhost";
    const { origin, pathname, search, searchParams } = new URL(
      returnURL,
      allowedOrigin,
    );
    if (
      origin !== allowedOrigin ||
      returnURL !== `${pathname}${search}` ||
      searchParams.get(returnUrlParamName)
    ) {
      if (!quiet) {
        console.error(`Unsafe returnUrl: ${returnURL}. Redirecting to /`);
      }
      return "/";
    }

    return returnURL;
  }
};

const issue = (
  [
    ["https://localhost", "/"],
    ["//localhost.bad.com", "/"],
    ["//localhost.com", "/"],
    ["/localhost/com", "/localhost/com"],
    ["/localhost/com?here=there", "/localhost/com?here=there"],
    ["/localhost/com?returnUrl=there", "/"],
    ["//http://localhost.com", "/"],
    ["//abc.com", "/"],
    ["///abc.com", "/"],
  ] as const
).find(
  ([returnURL, expected]) =>
    getSafeReturnURL(returnURL, "returnUrl", true) !== expected,
);

if (issue) {
  throw new Error(
    `getSafeReturnURL failed for ${issue[0]}. Expected: ${issue[1]}`,
  );
}
