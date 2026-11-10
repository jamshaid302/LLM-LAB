const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status) {
  return RETRYABLE_STATUS.has(status);
}

/** One pause, then the same call again. A caller abort is not retried. */
export async function retryOllama(run, { retries = 1, sleep = wait } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      if (!err?.retryable || attempt === retries) {
        if (err?.retryable && attempt > 0) {
          err.message = `${err.message}. Tried ${attempt + 1} times.`;
        }
        throw err;
      }
      await sleep();
    }
  }
}

function wait() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

/** The caller signal stops the attempt. The timer stops a hung call. */
export function openAttemptSignal(caller, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (caller) {
    if (caller.aborted) controller.abort();
    else caller.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    callerStopped: () => Boolean(caller?.aborted),
    timedOut: () => controller.signal.aborted && !caller?.aborted,
    clear() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onAbort);
    },
  };
}

export function failureFromFetch(cause, { caller, attempt, timeoutMs, baseUrl }) {
  if (attempt.callerStopped()) {
    if (cause?.name === "AbortError") return cause;
    return Object.assign(new Error("The reply was stopped"), { name: "AbortError" });
  }
  if (attempt.timedOut() || cause?.name === "AbortError" || cause?.name === "TimeoutError") {
    return Object.assign(new Error(`Ollama timed out after ${timeoutMs}ms`), { retryable: true });
  }
  return Object.assign(new Error(`Cannot reach Ollama at ${baseUrl} (${cause.message})`), { retryable: true });
}
