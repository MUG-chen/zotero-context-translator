import test from "node:test";
import assert from "node:assert/strict";
import {
  SelectionTriggerView,
} from "../addon/content/modules/selection-trigger-view.mjs";
import { FakeDocument, event } from "./helpers/fake-dom.mjs";

test("selection translation trigger preserves selection and activates once", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const selection = { attachmentID: 11, text: "selected sentence" };
  const activations = [];
  const view = new SelectionTriggerView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    selection,
    onTranslate: (activation) => activations.push(activation),
  });
  root.mockRect = { left: 120, top: 180, width: 112, height: 32 };
  root.style.left = "120px";
  root.style.top = "180px";

  const pointer = event("pointerdown");
  root.dispatchEvent(pointer);
  const button = root.querySelector(".zct-selection-trigger-button");
  button.dispatchEvent(event("click"));
  button.dispatchEvent(event("click"));

  assert.equal(pointer.defaultPrevented, true);
  assert.equal(pointer.propagationStopped, true);
  assert.equal(root.querySelector(".zct-selection-trigger-mark").textContent, "译");
  assert.equal(root.querySelector(".zct-selection-trigger-label").textContent, "翻译");
  assert.equal(activations.length, 1);
  assert.equal(activations[0].selection, selection);
  assert.deepEqual(activations[0].anchorRect, {
    left: 120,
    top: 180,
    right: 232,
    bottom: 212,
  });
  assert.equal(root.parentNode, null);
});

test("mount replaces the previous ephemeral trigger and destroy is idempotent", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new SelectionTriggerView();
  const mount = (text) => view.mount({
    doc,
    append: (node) => host.append(node),
    selection: { attachmentID: 11, text },
    onTranslate() {},
  });

  mount("first");
  mount("second");

  assert.equal(host.querySelectorAll(".zct-selection-trigger").length, 1);
  view.destroy();
  view.destroy();
  assert.equal(host.querySelectorAll(".zct-selection-trigger").length, 0);
});

test("reader unload dismisses an unactivated trigger and releases listeners", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  let dismissed = 0;
  const view = new SelectionTriggerView();
  view.mount({
    doc,
    append: (node) => host.append(node),
    selection: { attachmentID: 11, text: "selected sentence" },
    onTranslate() {},
    onReaderClose: () => dismissed += 1,
  });

  doc.defaultView.dispatchEvent(event("pagehide"));

  assert.equal(dismissed, 1);
  assert.equal(host.querySelectorAll(".zct-selection-trigger").length, 0);
  assert.equal(doc.defaultView.listenerCount(), 0);
});
