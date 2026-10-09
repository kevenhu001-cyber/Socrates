function isRetryable(error) {
  return !!error && (
    error.status === 0
    || error.status === 408
    || error.status === 429
    || (error.status >= 500 && error.status < 600)
  );
}

function retryDelay(backoffMs, attempt) {
  /* Jitter spreads retries from parallel requests across a wider window. */
  return backoffMs * attempt + Math.floor(Math.random() * backoffMs);
}

/** Bind the configurable retry policy to the single JSON API client. */
export function createRetryApiFetch(fetchJson) {
  return async function retryApiFetch(path, opts, retryOpts) {
    const options = retryOpts || {};
    const retries = typeof options.retries === 'number' ? options.retries : 2;
    const backoffMs = typeof options.backoffMs === 'number' ? options.backoffMs : 400;
    const userSignal = opts && opts.signal;
    let attempt = 0;

    while (true) {
      try {
        return await fetchJson(path, opts);
      } catch (error) {
        error.retried = attempt;
        if (!isRetryable(error) || attempt >= retries || (userSignal && userSignal.aborted)) throw error;
        attempt += 1;
        error.retried = attempt;
        await new Promise((resolve) => setTimeout(resolve, retryDelay(backoffMs, attempt)));
      }
    }
  };
}
