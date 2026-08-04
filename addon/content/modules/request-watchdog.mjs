export function createRequestWatchdog({
  parentSignal,
  firstEventMs,
  idleMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const controller = new AbortController();
  let timer = null;
  let phase = "waiting";
  let timeoutKind = null;

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener?.("abort", abortFromParent, { once: true });

  const arm = (kind, milliseconds) => {
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timeoutKind = kind;
      timer = null;
      controller.abort();
    }, milliseconds);
  };

  arm("FIRST_EVENT_TIMEOUT", firstEventMs);

  return {
    signal: controller.signal,
    get phase() {
      return phase;
    },
    get timedOut() {
      return timeoutKind !== null;
    },
    get timeoutKind() {
      return timeoutKind;
    },
    noteNetworkActivity() {
      if (phase === "streaming") arm("IDLE_TIMEOUT", idleMs);
    },
    noteModelEvent() {
      phase = "streaming";
      arm("IDLE_TIMEOUT", idleMs);
    },
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      parentSignal?.removeEventListener?.("abort", abortFromParent);
    },
  };
}
