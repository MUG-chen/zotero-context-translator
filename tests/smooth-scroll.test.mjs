import test from "node:test";
import assert from "node:assert/strict";
import { WHEEL_LINE_PX, attachSmoothScroll } from "../addon/content/modules/smooth-scroll.mjs";
import { FakeDocument, event } from "./helpers/fake-dom.mjs";

function scrollHost({ clientHeight = 100, scrollHeight = 400 } = {}) {
  const doc = new FakeDocument();
  const element = doc.createElement("div");
  element.clientHeight = clientHeight;
  element.scrollHeight = scrollHeight;
  element.scrollTop = 0;
  doc.body.append(element);
  const frames = [];
  doc.defaultView.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  const release = attachSmoothScroll(element, { view: doc.defaultView });
  return { element, frames, release };
}

test("a mouse-wheel notch scrolls one line before any animation frame", () => {
  const { element, frames } = scrollHost();
  element.dispatchEvent(event("wheel", { deltaY: 3, deltaMode: 1 }));

  assert.equal(element.scrollTop, WHEEL_LINE_PX);
  assert.equal(frames.length, 0);
});

test("a large pixel notch is also limited to one line", () => {
  const { element } = scrollHost();
  element.dispatchEvent(event("wheel", { deltaY: 120, deltaMode: 0 }));
  assert.equal(element.scrollTop, WHEEL_LINE_PX);
});

test("fine pixel motion from a trackpad is not collapsed to a notch", () => {
  const { element } = scrollHost();
  element.dispatchEvent(event("wheel", { deltaY: 12, deltaMode: 0 }));
  assert.equal(element.scrollTop, 12);
});

test("repeated notches still move when the reader never delivers a frame", () => {
  const { element } = scrollHost();
  element.dispatchEvent(event("wheel", { deltaY: 3, deltaMode: 1 }));
  element.dispatchEvent(event("wheel", { deltaY: 3, deltaMode: 1 }));
  element.dispatchEvent(event("wheel", { deltaY: 3, deltaMode: 1 }));
  assert.equal(element.scrollTop, WHEEL_LINE_PX * 3);
});

test("arrow and page keys move the focused pane by native-sized steps", () => {
  const { element } = scrollHost({ clientHeight: 200, scrollHeight: 800 });
  element.dispatchEvent(event("keydown", { key: "ArrowDown" }));
  assert.equal(element.scrollTop, 40);

  element.dispatchEvent(event("keydown", { key: "PageDown" }));
  assert.equal(element.scrollTop, 40 + 200 * 0.85);
});

test("does not steal scrolling when the pane cannot overflow", () => {
  const { element } = scrollHost({ clientHeight: 200, scrollHeight: 200 });
  const wheel = event("wheel", { deltaY: 80, deltaMode: 0 });
  element.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, undefined);
  assert.equal(element.scrollTop, 0);
});
