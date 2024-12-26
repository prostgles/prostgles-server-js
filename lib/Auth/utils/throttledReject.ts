/**
 * Given an async function, this function will throttle the response time if errored to prevent timing attacks
 */
export const throttledReject = <T>(func: () => Promise<T>, throttle = 500): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    let result: T,
      error: any,
      finished = false;

    /**
     * Throttle reject response times to prevent timing attacks
     */
    const interval = setInterval(() => {
      if (finished) {
        clearInterval(interval);
        if (error) {
          reject(error);
        }
      }
    }, throttle);

    try {
      result = await func();
      resolve(result);
      clearInterval(interval);
    } catch (err) {
      console.log(err);
      error = err;
    }

    finished = true;
  });
};
