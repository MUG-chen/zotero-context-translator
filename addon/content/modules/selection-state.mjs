const EMPTY_STATE = Object.freeze({
  status: "idle",
  selection: null,
  attachmentID: null,
  translation: "",
  explanation: "",
  error: null,
  mode: null,
  progress: null,
  requestID: null,
});

export class SelectionState {
  #nextRequestID = 1;
  #state = { ...EMPTY_STATE };

  get current() {
    return this.#state;
  }

  select(snapshot) {
    validateSnapshot(snapshot);
    this.#state = {
      ...EMPTY_STATE,
      status: "ready",
      selection: snapshot,
      attachmentID: snapshot.attachmentID,
    };
    return this.#state;
  }

  startRequest(mode = "sentence") {
    if (!this.#state.selection) {
      throw new Error("A PDF selection is required before translation");
    }
    const requestID = this.#nextRequestID;
    this.#nextRequestID += 1;
    this.#state = {
      ...this.#state,
      status: "loading",
      translation: "",
      explanation: "",
      error: null,
      mode,
      progress: null,
      requestID,
    };
    return requestID;
  }

  updateProgress(requestID, progress = {}) {
    if (!this.#isCurrent(requestID)) return false;
    this.#state = {
      ...this.#state,
      progress: {
        phase: String(progress.phase ?? "waiting"),
        attempt: finiteNumber(progress.attempt),
        maxAttempts: finiteNumber(progress.maxAttempts),
        status: finiteNumber(progress.status),
      },
    };
    return true;
  }

  updatePartial(requestID, translation) {
    if (!this.#isCurrent(requestID)) return false;
    this.#state = {
      ...this.#state,
      translation: String(translation ?? ""),
    };
    return true;
  }

  complete(requestID, result = {}) {
    if (!this.#isCurrent(requestID)) return false;
    this.#state = {
      ...this.#state,
      status: "result",
      translation: result.translation ?? "",
      explanation: result.explanation ?? "",
      error: null,
      requestID: null,
    };
    return true;
  }

  fail(requestID, error) {
    if (!this.#isCurrent(requestID)) return false;
    this.#state = {
      ...this.#state,
      status: "error",
      error: error instanceof Error ? error : new Error(String(error)),
      requestID: null,
    };
    return true;
  }

  close() {
    this.#state = { ...EMPTY_STATE };
    return this.#state;
  }

  #isCurrent(requestID) {
    return (
      this.#state.status === "loading" &&
      this.#state.requestID === requestID &&
      requestID !== null
    );
  }
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("Selection snapshot is required");
  }
  if (typeof snapshot.text !== "string" || !snapshot.text.trim()) {
    throw new TypeError("Selection text is required");
  }
  if (snapshot.attachmentID === null || snapshot.attachmentID === undefined) {
    throw new TypeError("Selection attachment ID is required");
  }
}
