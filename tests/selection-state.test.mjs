import test from "node:test";
import assert from "node:assert/strict";
import { SelectionState } from "../addon/content/modules/selection-state.mjs";

function snapshot(text, attachmentID = 1) {
  return {
    attachmentID,
    text,
    pageIndex: 0,
    rects: [[10, 20, 40, 32]],
  };
}

test("ignores a response for an older selection", () => {
  const state = new SelectionState();
  state.select(snapshot("first"));
  const oldID = state.startRequest();
  state.select(snapshot("second"));
  state.complete(oldID, { translation: "wrong target" });

  assert.equal(state.current.selection.text, "second");
  assert.equal(state.current.translation, "");
  assert.equal(state.current.status, "ready");
});

test("moves through ready, loading, result, error, and idle states", () => {
  const state = new SelectionState();
  assert.equal(state.current.status, "idle");

  state.select(snapshot("selected"));
  assert.equal(state.current.status, "ready");
  const completedID = state.startRequest();
  assert.equal(state.current.status, "loading");
  state.complete(completedID, { translation: "译文", explanation: "说明" });
  assert.equal(state.current.status, "result");
  assert.equal(state.current.translation, "译文");

  const failedID = state.startRequest();
  state.fail(failedID, new Error("network"));
  assert.equal(state.current.status, "error");
  assert.equal(state.current.error.message, "network");

  state.close();
  assert.equal(state.current.status, "idle");
  assert.equal(state.current.selection, null);
});

test("new attachment invalidates an in-flight request", () => {
  const state = new SelectionState();
  state.select(snapshot("paper one", 1));
  const requestID = state.startRequest();
  state.select(snapshot("paper two", 2));

  assert.equal(state.complete(requestID, { translation: "late" }), false);
  assert.equal(state.current.attachmentID, 2);
  assert.equal(state.current.translation, "");
});

test("preserves partial translation and safe progress when a stream fails", () => {
  const state = new SelectionState();
  state.select(snapshot("selected sentence"));
  const requestID = state.startRequest("sentence");
  state.updateProgress(requestID, {
    phase: "streaming",
    attempt: 1,
    maxAttempts: 3,
  });
  state.updatePartial(requestID, "已经收到的译文");

  state.fail(
    requestID,
    Object.assign(new Error("流式响应中断"), { status: 200, attempt: 1 }),
  );

  assert.equal(state.current.status, "error");
  assert.equal(state.current.mode, "sentence");
  assert.equal(state.current.translation, "已经收到的译文");
  assert.equal(state.current.progress.phase, "streaming");
});

test("ignores progress and partial output from an obsolete request", () => {
  const state = new SelectionState();
  state.select(snapshot("first"));
  const requestID = state.startRequest("paragraph");
  state.select(snapshot("second"));

  assert.equal(
    state.updateProgress(requestID, { phase: "retrying", attempt: 2 }),
    false,
  );
  assert.equal(state.updatePartial(requestID, "wrong document"), false);
  assert.equal(state.current.selection.text, "second");
  assert.equal(state.current.translation, "");
});
