import { parseModelEnvelope } from "./response-parser.mjs";
import { createRequestWatchdog } from "./request-watchdog.mjs";
import { SSEDecoder } from "./sse.mjs";
import { normalizeChatCompletionsURL } from "./url.mjs";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_FIRST_EVENT_TIMEOUT_MS = 90_000;
const DEFAULT_IDLE_TIMEOUT_MS = 45_000;
const MAX_RATE_LIMIT_DELAY_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const TRANSIENT_BACKOFF_MS = [800, 2_000];

export class APIRequestError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
      attempt = null,
      maxAttempts = null,
      cause,
    } = {},
  ) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
  }
}

export class AuthenticationError extends APIRequestError {}
export class ModelNotFoundError extends APIRequestError {}
export class RateLimitError extends APIRequestError {}
export class ContextLengthError extends APIRequestError {}
export class TransportError extends APIRequestError {}
export class ResponseParseError extends APIRequestError {}

export class OpenAICompatibleClient {
  constructor({
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    firstEventTimeoutMs = DEFAULT_FIRST_EVENT_TIMEOUT_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("A fetch implementation is required");
    }
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.firstEventTimeoutMs = firstEventTimeoutMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.maxAttempts = maxAttempts;
    this.sleep = sleep;
  }

  async testConnection({ baseURL, apiKey, model, signal }) {
    const startedAt = Date.now();
    const transport = await this.#post(
      { baseURL, apiKey, signal },
      {
        model: requireString(model, "Model name"),
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      },
    );

    try {
      const { response } = transport;
      if (!response.ok) throw await classifyHTTPError(response);
      await response.json();
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      if (error instanceof APIRequestError) throw error;
      throw new ResponseParseError("The API returned invalid JSON", {
        status: transport.response.status,
        cause: error,
      });
    } finally {
      transport.timeout.dispose();
    }
  }

  async streamTranslation(request, callbacks = {}) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      throwIfCancelled(request.signal);
      callbacks.onProgress?.({
        phase: "waiting",
        attempt,
        maxAttempts: this.maxAttempts,
      });
      let transport;
      try {
        transport = await this.#post(
          request,
          {
            model: requireString(request.model, "Model name"),
            messages: Array.isArray(request.messages) ? request.messages : [],
            temperature: request.temperature ?? 0.2,
            stream: true,
          },
          { streaming: true },
        );
      } catch (error) {
        if (!(error instanceof APIRequestError)) throw error;
        error.attempt = attempt;
        error.maxAttempts = this.maxAttempts;
        if (attempt < this.maxAttempts && isPreResponseNetworkError(error)) {
          throwIfCancelled(request.signal);
          callbacks.onProgress?.({
            phase: "retrying",
            attempt: attempt + 1,
            maxAttempts: this.maxAttempts,
            status: null,
          });
          await waitForRetry(
            this.sleep,
            transientBackoff(attempt),
            request.signal,
          );
          continue;
        }
        throw error;
      }

      const { response, timeout } = transport;
      if (!response.ok) {
        const error = await classifyHTTPError(response).finally(() =>
          timeout.dispose(),
        );
        error.attempt = attempt;
        error.maxAttempts = this.maxAttempts;
        const delay = retryDelayFor(error, response, attempt);
        if (attempt < this.maxAttempts && delay !== null) {
          throwIfCancelled(request.signal);
          callbacks.onProgress?.({
            phase: "retrying",
            attempt: attempt + 1,
            maxAttempts: this.maxAttempts,
            status: response.status,
          });
          await waitForRetry(this.sleep, delay, request.signal);
          continue;
        }
        throw error;
      }

      try {
        return await readTranslationStream(response, callbacks, timeout, {
          attempt,
          maxAttempts: this.maxAttempts,
        });
      } catch (error) {
        if (error instanceof APIRequestError) {
          error.attempt ??= attempt;
          error.maxAttempts ??= this.maxAttempts;
        }
        throw error;
      } finally {
        timeout.dispose();
      }
    }
    throw new TransportError("The API request could not be completed");
  }

  async #post({ baseURL, apiKey, signal }, body, { streaming = false } = {}) {
    const url = normalizeChatCompletionsURL(baseURL);
    const key = requireString(apiKey, "API key");
    const timeout = streaming
      ? createRequestWatchdog({
          parentSignal: signal,
          firstEventMs: this.firstEventTimeoutMs,
          idleMs: this.idleTimeoutMs,
        })
      : createTimeoutSignal(signal, this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
      return { response, timeout };
    } catch (error) {
      if (error instanceof APIRequestError) throw error;
      const message = timeout.timedOut
        ? timeoutMessage(timeout.timeoutKind)
        : error?.name === "AbortError"
          ? "The API request was cancelled"
          : "Could not connect to the API";
      timeout.dispose();
      throw new TransportError(message, {
        code: timeout.timeoutKind,
        cause: error,
      });
    }
  }
}

async function readTranslationStream(
  response,
  { onDelta, onProgress } = {},
  timeout,
  requestProgress = {},
) {
  if (!response.body?.getReader) {
    throw new ResponseParseError("The API response did not contain a stream", {
      status: response.status,
    });
  }

  const decoder = new SSEDecoder();
  const reader = response.body.getReader();
  let raw = "";
  let progressPhase = null;
  const reportProgress = (phase) => {
    if (phase === progressPhase) return;
    progressPhase = phase;
    onProgress?.({ phase, ...requestProgress });
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      timeout?.noteNetworkActivity?.();
      for (const event of decoder.push(value)) {
        timeout?.noteModelEvent?.();
        raw += consumeEvent(event, onDelta, reportProgress);
      }
    }
    for (const event of decoder.finish()) {
      timeout?.noteModelEvent?.();
      raw += consumeEvent(event, onDelta, reportProgress);
    }
  } catch (error) {
    if (error instanceof ResponseParseError) throw error;
    if (timeout?.signal.aborted) {
      throw new TransportError(
        timeout.timedOut
          ? timeoutMessage(timeout.timeoutKind)
          : "The API request was cancelled",
        {
          status: response.status,
          code: timeout.timeoutKind,
          cause: error,
        },
      );
    }
    throw new ResponseParseError("Could not parse the streamed API response", {
      status: response.status,
      cause: error,
    });
  } finally {
    reader.releaseLock?.();
  }
  return parseModelEnvelope(raw);
}

function consumeEvent(event, onDelta, reportProgress) {
  if (event.done) return "";
  const delta = event?.choices?.[0]?.delta;
  if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
    reportProgress?.("reasoning");
  }
  const content = delta?.content;
  if (typeof content !== "string" || !content) return "";
  reportProgress?.("streaming");
  onDelta?.(content);
  return content;
}

async function classifyHTTPError(response) {
  const payload = await readErrorPayload(response);
  const message = payload.message;
  const details = { status: response.status, code: payload.code };

  if (response.status === 401 || response.status === 403) {
    return new AuthenticationError("API authentication failed", details);
  }
  if (response.status === 404) {
    return new ModelNotFoundError("The API endpoint or model was not found", details);
  }
  if (response.status === 429) {
    return new RateLimitError("The API rate limit was reached", details);
  }
  if (
    response.status === 400 &&
    /context|token|length|maximum/i.test(`${payload.code ?? ""} ${message}`)
  ) {
    return new ContextLengthError("The request exceeds the model context limit", details);
  }
  if (response.status >= 500) {
    return new TransportError("The API service is temporarily unavailable", details);
  }
  return new APIRequestError(
    `The API rejected the request (HTTP ${response.status})`,
    details,
  );
}

async function readErrorPayload(response) {
  try {
    const value = await response.json();
    return {
      message: String(value?.error?.message ?? value?.message ?? ""),
      code: value?.error?.code ?? value?.code ?? null,
    };
  } catch {
    return { message: "", code: null };
  }
}

function retryDelayFor(error, response, attempt) {
  if (error instanceof RateLimitError) {
    const milliseconds = parseRetryAfter(response.headers.get("retry-after"));
    return milliseconds !== null && milliseconds <= MAX_RATE_LIMIT_DELAY_MS
      ? milliseconds
      : null;
  }
  if (
    error instanceof TransportError &&
    [502, 503, 504].includes(response.status)
  ) {
    return transientBackoff(attempt);
  }
  return null;
}

function transientBackoff(attempt) {
  return TRANSIENT_BACKOFF_MS[
    Math.min(attempt - 1, TRANSIENT_BACKOFF_MS.length - 1)
  ];
}

function isPreResponseNetworkError(error) {
  return (
    error instanceof TransportError &&
    error.code === null &&
    error.cause?.name !== "AbortError"
  );
}

async function waitForRetry(sleep, milliseconds, signal) {
  throwIfCancelled(signal);
  if (!signal) {
    await sleep(milliseconds);
    return;
  }
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(cancellationError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([Promise.resolve().then(() => sleep(milliseconds)), cancelled]);
    throwIfCancelled(signal);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancellationError(signal);
}

function cancellationError(signal) {
  const cause = signal?.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error("The API request was cancelled"), {
        name: "AbortError",
      });
  return new TransportError("The API request was cancelled", { cause });
}

function parseRetryAfter(raw) {
  if (raw === null || raw.trim() === "") return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - Date.now());
}

function createTimeoutSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} is required`);
  }
  return value.trim();
}

function timeoutMessage(kind) {
  if (kind === "FIRST_EVENT_TIMEOUT") {
    return "The API did not start a model response before the deadline";
  }
  if (kind === "IDLE_TIMEOUT") {
    return "The API response stream became inactive";
  }
  return "The API request timed out";
}
