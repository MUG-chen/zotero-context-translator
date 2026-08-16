import test from "node:test";
import assert from "node:assert/strict";
import {
  FLOATING_WINDOW_CSS,
  FloatingView,
} from "../addon/content/modules/floating-view.mjs";
import { FakeDocument, event } from "./helpers/fake-dom.mjs";

function mountDetachedCard({
  doc = new FakeDocument(),
  height = 260,
  state = null,
} = {}) {
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {},
  });
  const titlebar = root.querySelector(".zct-titlebar");
  root.mockRect = { left: 80, top: 90, width: 380, height };
  if (state) view.render(state);
  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 101,
    clientX: 100,
    clientY: 110,
    target: titlebar,
  }));
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 101,
    clientX: 110,
    clientY: 122,
  }));
  doc.defaultView.dispatchEvent(event("pointerup", { pointerId: 101 }));
  return { doc, root, titlebar, view };
}

test("mounts one floating dialog and selection overlay without any sidebar", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  view.mount({
    doc,
    anchorRects: [
      { left: 100, top: 120, right: 180, bottom: 140 },
      { left: 100, top: 145, right: 220, bottom: 165 },
    ],
    handlers: {},
  });

  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(doc.querySelectorAll(".zct-selection-rect").length, 2);
  assert.equal(doc.querySelectorAll("aside").length, 0);
  assert.ok(doc.querySelector(".zct-result-scroll"));
});

test("persistent active card starts anchored without an overlay or translate action", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mountActive({
    doc,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 140 },
    handlers: {},
  });

  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(doc.querySelectorAll(".zct-selection-overlay").length, 0);
  assert.equal(root.querySelector(".zct-actions").hidden, true);
  assert.equal(root.querySelector(".zct-actions").style.display, "none");
  assert.match(root.style.height, /px$/);
  assert.equal(root.style.left, "100px");
  assert.equal(root.style.top, "152px");

  view.render({
    status: "result",
    selection: { text: "source" },
    translation: "译文",
  });
  assert.equal(root.style.height, "auto");
  assert.match(root.className, /zct-floating-window--auto-fit/);
});

test("new translation resets auto-fit height but preserves a user-set height", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mountActive({
    doc,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 140 },
    handlers: {},
  });
  const initialHeight = root.style.height;
  const initialLeft = root.style.left;
  const initialTop = root.style.top;

  view.render({ status: "result", translation: "first translation" });
  view.prepareForTranslation();

  assert.equal(root.style.height, initialHeight);
  assert.equal(root.style.left, initialLeft);
  assert.equal(root.style.top, initialTop);
  assert.doesNotMatch(root.className, /zct-floating-window--auto-fit/);

  view.render({ status: "result", translation: "second translation" });
  root.mockRect = { width: 380, height: 400 };
  const rect = root.getBoundingClientRect();
  root.dispatchEvent(event("pointerdown", {
    pointerId: 19,
    clientX: rect.right - 1,
    clientY: rect.bottom - 1,
    target: root,
  }));
  root.style.height = "310px";
  view.prepareForTranslation();

  assert.equal(root.style.height, "310px");
});

test("renders one explicit translate action without mode choices", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    handlers: { translate: (mode) => calls.push(mode) },
  });

  const action = root.querySelector(".zct-translate");
  assert.ok(action);
  assert.equal(action.textContent, "翻译");
  assert.equal(root.querySelectorAll("[data-mode]").length, 0);
  assert.equal(root.querySelectorAll(".zct-translate").length, 1);
  action.dispatchEvent(event("click"));
  assert.deepEqual(calls, ["sentence"]);
});

test("visually removes the ready status row and its obsolete prompt", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, handlers: {} });
  const statusRow = root.querySelector(".zct-status-row");
  const statusText = root.querySelector(".zct-status");

  assert.equal(statusRow.hidden, true);
  assert.equal(statusRow.style.display, "none");
  assert.equal(statusText.textContent, "");

  for (const status of ["loading", "result", "error"]) {
    view.render({ status });
    assert.equal(statusRow.hidden, false, `${status} status row should be visible`);
    assert.equal(statusRow.style.display, "", `${status} should restore CSS layout`);
  }
});

test("pointer interaction preserves the PDF selection and buttons invoke handlers", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [{ left: 100, top: 120, right: 180, bottom: 140 }],
    handlers: { translate: (mode) => calls.push(mode) },
  });
  const pointer = event("pointerdown");
  root.dispatchEvent(pointer);
  root.querySelector(".zct-translate").dispatchEvent(event("click"));

  assert.equal(pointer.defaultPrevented, true);
  assert.equal(pointer.propagationStopped, true);
  assert.deepEqual(calls, ["sentence"]);
});

test("stays inside Zotero's native selection popup after translation starts", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: { translate: (mode) => calls.push(mode) },
  });

  assert.equal(root.parentNode, host);
  assert.match(root.className, /zct-floating-window--embedded/);
  root.querySelector(".zct-translate").dispatchEvent(event("click"));

  assert.deepEqual(calls, ["sentence"]);
  assert.equal(root.parentNode, host);
  assert.match(root.className, /zct-floating-window--embedded/);
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
});

test("first close click in the native popup closes without detaching the dialog", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: { close: () => calls.push("close") },
  });
  const close = root.querySelector(".zct-close");

  root.dispatchEvent(event("pointerdown", { pointerId: 1, target: close }));
  assert.equal(root.parentNode, host);
  close.dispatchEvent(event("click"));

  assert.deepEqual(calls, ["close"]);
});

test("close button does not let the draggable titlebar capture its pointer", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => doc.body.append(node),
    handlers: { close: () => calls.push("close") },
  });
  const titlebar = root.querySelector(".zct-titlebar");
  const close = root.querySelector(".zct-close");
  close.closest = (selector) => selector.includes("button") ? close : null;
  let captures = 0;
  titlebar.setPointerCapture = () => captures += 1;

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    target: close,
  }));
  close.dispatchEvent(event("click"));

  assert.equal(captures, 0);
  assert.deepEqual(calls, ["close"]);
});

test("the translate action fires once while the same dialog remains embedded", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const order = [];
  const view = new FloatingView();
  let root;
  root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {
      translate: () =>
        order.push(
          root.parentNode === host ? "translate-embedded" : "translate-detached",
        ),
    },
  });
  const translate = root.querySelector(".zct-translate");

  root.dispatchEvent(event("pointerdown", { pointerId: 1, target: translate }));
  translate.dispatchEvent(event("click"));

  assert.deepEqual(order, ["translate-embedded"]);
  assert.equal(root.parentNode, host);
  assert.match(root.className, /zct-floating-window--embedded/);
});

test("closes on the first click in 20 fresh embedded dialogs", () => {
  let closes = 0;
  for (let index = 0; index < 20; index += 1) {
    const doc = new FakeDocument();
    const host = doc.createElement("div");
    doc.body.append(host);
    const view = new FloatingView();
    const root = view.mount({
      doc,
      append: (node) => host.append(node),
      handlers: {
        close: () => {
          closes += 1;
          view.destroy();
        },
      },
    });
    const close = root.querySelector(".zct-close");
    root.dispatchEvent(event("pointerdown", { pointerId: 1, target: close }));
    assert.equal(root.parentNode, host);
    close.dispatchEvent(event("click"));
    assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
  }
  assert.equal(closes, 20);
});

test("a sub-threshold title movement does not detach the embedded dialog", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {},
  });
  const titlebar = root.querySelector(".zct-titlebar");

  titlebar.dispatchEvent(
    event("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 }),
  );
  doc.defaultView.dispatchEvent(
    event("pointermove", { pointerId: 1, clientX: 102, clientY: 102 }),
  );

  assert.equal(root.parentNode, host);
});

test("detaches only after an intentional titlebar drag", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {},
  });
  const titlebar = root.querySelector(".zct-titlebar");
  root.mockRect = { left: 80, top: 90, width: 380, height: 420 };

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 7,
    clientX: 100,
    clientY: 100,
    target: titlebar,
  }));
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 7,
    clientX: 110,
    clientY: 112,
  }));

  assert.equal(root.parentNode, doc.body);
  assert.doesNotMatch(root.className, /zct-floating-window--embedded/);
  assert.equal(root.style.width, "380px");
  assert.equal(root.style.height, "420px");
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
});

test("keeps the pointerdown grab point when Zotero repositions the host before drag", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {},
  });
  const titlebar = root.querySelector(".zct-titlebar");
  root.mockRect = { width: 380, height: 420 };
  root.style.left = "80px";
  root.style.top = "90px";

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 8,
    clientX: 100,
    clientY: 110,
    target: titlebar,
  }));

  // Zotero's transformed ViewPopup may recalculate after card content changes.
  root.style.left = "900px";
  root.style.top = "300px";
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 8,
    clientX: 110,
    clientY: 122,
  }));

  assert.equal(root.parentNode, doc.body);
  assert.equal(root.style.left, "90px");
  assert.equal(root.style.top, "102px");
  assert.equal(root.style.width, "380px");
  assert.equal(root.style.height, "420px");
});

test("auto-fits the detached card when the first streamed translation arrives", () => {
  const { root, view } = mountDetachedCard({
    state: { status: "loading", selection: { text: "source" } },
  });

  assert.equal(root.style.height, "260px");
  const detachedLeft = root.style.left;
  const detachedTop = root.style.top;
  view.render({
    status: "loading",
    selection: { text: "source" },
    translation: "流式返回的第一行译文",
  });

  assert.equal(root.style.height, "auto");
  assert.equal(root.style.minHeight, "260px");
  assert.equal(root.style.width, "380px");
  assert.equal(root.style.left, detachedLeft);
  assert.equal(root.style.top, detachedTop);
  assert.match(root.className, /zct-floating-window--auto-fit/);
});

test("streaming auto-fit keeps the reader-chosen position when content grows", () => {
  const { root, view } = mountDetachedCard({
    state: { status: "loading", selection: { text: "source" } },
  });
  view.render({ status: "loading", translation: "第一行" });

  root.mockRect = { width: 380, height: 500 };
  root.style.left = "100px";
  root.style.top = "300px";
  view.render({ status: "loading", translation: "第一行\n第二行" });

  assert.equal(root.style.left, "100px");
  assert.equal(root.style.top, "300px");
});

test("auto-fit remembers its peak height when visible content becomes shorter", () => {
  const doc = new FakeDocument();
  let resizeCallback = null;
  doc.defaultView.ResizeObserver = class {
    constructor(callback) {
      resizeCallback = callback;
    }

    observe() {}
    disconnect() {}
  };
  const { root, view } = mountDetachedCard({ doc });
  view.render({ status: "loading", translation: "第一行" });

  root.mockRect = { width: 380, height: 430 };
  resizeCallback();
  assert.equal(root.style.minHeight, "430px");

  root.mockRect = { width: 380, height: 300 };
  resizeCallback();
  assert.equal(root.style.minHeight, "430px");
});

test("auto-fit height is capped at 520px and the current viewport limit", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerHeight = 900;
  let resizeCallback = null;
  doc.defaultView.ResizeObserver = class {
    constructor(callback) {
      resizeCallback = callback;
    }

    observe() {}
    disconnect() {}
  };
  const { root, view } = mountDetachedCard({ doc });
  view.render({ status: "result", translation: "长译文" });
  root.mockRect = { width: 380, height: 700 };
  resizeCallback();
  assert.equal(root.style.minHeight, "520px");

  doc.defaultView.innerHeight = 400;
  doc.defaultView.dispatchEvent(event("resize"));
  assert.equal(root.style.minHeight, "376px");
});

test("native resize switches the detached card to user-sized mode", () => {
  const { root, view } = mountDetachedCard();
  view.render({ status: "result", translation: "译文" });

  root.mockRect = { width: 380, height: 400 };
  root.style.left = "100px";
  root.style.top = "100px";
  const resizePointer = event("pointerdown", {
    pointerId: 12,
    clientX: 479,
    clientY: 499,
    target: root,
  });
  root.dispatchEvent(resizePointer);

  assert.equal(resizePointer.defaultPrevented, undefined);
  assert.doesNotMatch(root.className, /zct-floating-window--auto-fit/);
  assert.equal(root.style.minHeight, "");
  root.style.height = "300px";
  view.render({ status: "result", translation: "更多译文" });
  assert.equal(root.style.height, "300px");
});

test("resizing before the first result preserves the user's chosen height", () => {
  const { root, view } = mountDetachedCard();
  root.mockRect = { width: 380, height: 260 };
  root.dispatchEvent(event("pointerdown", {
    pointerId: 14,
    clientX: 469,
    clientY: 361,
    target: root,
  }));
  root.style.height = "310px";

  view.render({ status: "result", translation: "译文" });

  assert.equal(root.style.height, "310px");
  assert.doesNotMatch(root.className, /zct-floating-window--auto-fit/);
});

test("loading alone stays fixed while explanation and error are visible results", () => {
  for (const visibleResult of [
    { status: "loading", explanation: "术语说明" },
    { status: "error", error: new Error("failed") },
  ]) {
    const { root, view } = mountDetachedCard({
      state: { status: "loading", selection: { text: "source" } },
    });

    view.render({ status: "loading", selection: { text: "source" } });
    assert.equal(root.style.height, "260px");
    view.render(visibleResult);
    assert.equal(root.style.height, "auto");
  }
});

test("viewport changes keep an auto-fit titlebar reachable without pulling up its bottom", () => {
  const doc = new FakeDocument();
  const { root, view } = mountDetachedCard({ doc });
  view.render({ status: "result", translation: "译文" });
  root.mockRect = { width: 380, height: 500 };
  root.style.left = "100px";
  root.style.top = "300px";

  doc.defaultView.innerHeight = 600;
  doc.defaultView.dispatchEvent(event("resize"));

  assert.equal(root.style.left, "100px");
  assert.equal(root.style.top, "300px");
});

test("dragging an auto-fit card starts from its visible position", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerHeight = 600;
  const { root, titlebar, view } = mountDetachedCard({ doc });
  view.render({ status: "result", translation: "译文" });
  root.mockRect = { width: 380, height: 500 };
  root.style.left = "100px";
  root.style.top = "300px";

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 18,
    clientX: 120,
    clientY: 320,
    target: titlebar,
  }));
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 18,
    clientX: 130,
    clientY: 330,
  }));

  assert.equal(root.style.left, "110px");
  assert.equal(root.style.top, "310px");
});

test("Escape closes and destroy removes overlays and every listener", () => {
  const doc = new FakeDocument();
  let closes = 0;
  const view = new FloatingView();
  view.mount({
    doc,
    anchorRects: [{ left: 100, top: 120, right: 180, bottom: 140 }],
    handlers: { close: () => closes += 1 },
  });
  doc.dispatchEvent(event("keydown", { key: "Escape" }));
  assert.equal(closes, 1);

  view.destroy();
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
  assert.equal(doc.querySelectorAll(".zct-selection-overlay").length, 0);
  assert.equal(doc.listenerCount(), 0);
  assert.equal(doc.defaultView.listenerCount(), 0);
});

test("reader pagehide closes the floating window and releases listeners", () => {
  const doc = new FakeDocument();
  let closes = 0;
  const view = new FloatingView();
  view.mount({
    doc,
    anchorRects: [{ left: 100, top: 120, right: 180, bottom: 140 }],
    handlers: {
      close: () => {
        closes += 1;
        view.destroy();
      },
    },
  });

  doc.defaultView.dispatchEvent(event("pagehide"));

  assert.equal(closes, 1);
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
  assert.equal(doc.listenerCount(), 0);
  assert.equal(doc.defaultView.listenerCount(), 0);
});

test("dragging the title moves the floating window", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [{ left: 100, top: 120, right: 180, bottom: 140 }],
    handlers: {},
  });
  const title = root.querySelector(".zct-titlebar");
  const oldLeft = Number.parseFloat(root.style.left);
  title.dispatchEvent(event("pointerdown", { pointerId: 1, clientX: 300, clientY: 200 }));
  doc.defaultView.dispatchEvent(event("pointermove", { pointerId: 1, clientX: 340, clientY: 225 }));
  doc.defaultView.dispatchEvent(event("pointerup", { pointerId: 1 }));

  assert.equal(Number.parseFloat(root.style.left), oldLeft + 40);
});

test("render updates the same floating window for loading, result, and error", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });

  view.render({ status: "loading", selection: { text: "source" } });
  assert.match(root.querySelector(".zct-status").textContent, /连接模型/);
  view.render({ status: "result", translation: "译文", explanation: "解释" });
  assert.match(root.querySelector(".zct-translation").textContent, /译文/);
  view.render({ status: "error", error: new Error("failed") });
  assert.match(root.querySelector(".zct-error-title").textContent, /失败/);
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
});

test("renders a structured academic card instead of one undifferentiated result block", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });

  view.render({
    status: "result",
    mode: "sentence",
    selection: { text: "A long academic source sentence" },
    translation: "主要译文",
    explanation: "语境说明",
  });

  assert.equal(root.querySelector(".zct-translation").textContent, "主要译文");
  assert.equal(root.querySelector(".zct-explanation").textContent, "语境说明");
  assert.equal(root.querySelectorAll("[data-mode]").length, 0);
  assert.equal(root.querySelectorAll(".zct-translate").length, 1);
  assert.ok(root.querySelector(".zct-source-toggle"));
  assert.ok(root.querySelector(".zct-copy"));
  assert.ok(root.querySelector(".zct-context-note"));
  assert.ok(root.querySelector(".zct-close").querySelector("svg"));
});

test("source preview expands and collapses without replacing the dialog", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });
  view.render({
    status: "ready",
    selection: { text: "long source ".repeat(30) },
  });
  const toggle = root.querySelector(".zct-source-toggle");
  const preview = root.querySelector(".zct-source-preview");

  toggle.dispatchEvent(event("click"));
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.match(preview.className, /expanded/);
  toggle.dispatchEvent(event("click"));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.doesNotMatch(preview.className, /expanded/);
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
});

test("error card retries and reports sanitized HTTP metadata", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [],
    handlers: { retry: () => calls.push("retry") },
  });

  view.render({
    status: "error",
    mode: "paragraph",
    error: Object.assign(
      new Error("The API service is temporarily unavailable"),
      { status: 503, attempt: 3, maxAttempts: 3 },
    ),
  });

  assert.match(root.querySelector(".zct-error-title").textContent, /服务暂时繁忙/);
  assert.match(root.querySelector(".zct-error-detail").textContent, /HTTP 503.*3/);
  assert.doesNotMatch(root.textContent, /apiKey|Bearer|selected_text/);
  root.querySelector(".zct-retry").dispatchEvent(event("click"));
  assert.deepEqual(calls, ["retry"]);
});

test("copy action receives only the visible translation", async () => {
  const doc = new FakeDocument();
  const copied = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [],
    handlers: { copy: (text) => copied.push(text) },
  });
  view.render({
    status: "result",
    selection: { text: "private source" },
    translation: "可以复制的译文",
    explanation: "private explanation",
  });

  root.querySelector(".zct-copy").dispatchEvent(event("click"));
  await Promise.resolve();

  assert.deepEqual(copied, ["可以复制的译文"]);
});

test("renders reasoning and retry progress as distinct Chinese states", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });

  view.render({
    status: "loading",
    progress: { phase: "reasoning", attempt: 1, maxAttempts: 3 },
  });
  assert.match(root.querySelector(".zct-status").textContent, /分析论文上下文/);

  view.render({
    status: "loading",
    progress: { phase: "retrying", attempt: 2, maxAttempts: 3, status: 503 },
  });
  assert.match(root.querySelector(".zct-status").textContent, /第 2 次尝试/);
});

test("keeps a tall result card inside a short viewport after rendering", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerWidth = 760;
  doc.defaultView.innerHeight = 500;
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [{ left: 300, top: 445, right: 360, bottom: 465 }],
    handlers: {},
  });
  root.mockRect = { width: 440, height: 476 };

  view.render({
    status: "result",
    selection: { text: "source ".repeat(100) },
    translation: "长译文".repeat(500),
    explanation: "长说明".repeat(200),
  });

  const rect = root.getBoundingClientRect();
  assert.ok(rect.left >= 12);
  assert.ok(rect.top >= 12);
  assert.ok(rect.left + rect.width <= doc.defaultView.innerWidth - 12);
  assert.ok(rect.top + rect.height <= doc.defaultView.innerHeight - 12);
});

test("reclamps the detached card after source expansion and viewport resize", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerHeight = 700;
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [{ left: 500, top: 550, right: 560, bottom: 575 }],
    handlers: {},
  });
  root.mockRect = { width: 440, height: 620 };
  view.render({ status: "ready", selection: { text: "source ".repeat(100) } });
  root.querySelector(".zct-source-toggle").dispatchEvent(event("click"));
  doc.defaultView.innerHeight = 640;
  root.mockRect = { width: 440, height: 616 };
  doc.defaultView.dispatchEvent(event("resize"));

  const rect = root.getBoundingClientRect();
  assert.equal(rect.top, 12);
  assert.ok(rect.top + rect.height <= doc.defaultView.innerHeight - 12);
});

test("reclamps a manually resized detached card and disconnects its observer", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerWidth = 500;
  doc.defaultView.innerHeight = 420;
  let resizeCallback = null;
  let observed = null;
  let disconnected = false;
  doc.defaultView.ResizeObserver = class {
    constructor(callback) {
      resizeCallback = callback;
    }

    observe(node) {
      observed = node;
    }

    disconnect() {
      disconnected = true;
    }
  };

  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });
  root.mockRect = { width: 320, height: 240 };
  root.style.left = "350px";
  root.style.top = "300px";

  assert.equal(observed, root);
  resizeCallback();
  assert.equal(root.style.left, "168px");
  assert.equal(root.style.top, "168px");

  view.destroy();
  assert.equal(disconnected, true);
});

test("reports copy failure when no clipboard handler is available", async () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });
  view.render({ status: "result", translation: "待复制译文" });

  root.querySelector(".zct-copy").dispatchEvent(event("click"));
  await Promise.resolve();

  assert.equal(root.querySelector(".zct-copy").textContent, "复制失败");
});

test("all card buttons expose at least a 36px minimum hit target", () => {
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-source-toggle,\s*\.zct-copy\s*\{[^}]*min-height:\s*36px/s,
  );
  assert.match(FLOATING_WINDOW_CSS, /\.zct-translate\s*\{[^}]*min-height:\s*40px/s);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-retry\s*\{[^}]*min-height:\s*36px/s);
});

test("uses the approved compact card dimensions and typography", () => {
  assert.match(FLOATING_WINDOW_CSS, /width:\s*min\(380px,/);
  assert.match(FLOATING_WINDOW_CSS, /max-height:\s*min\(520px,/);
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-floating-window--auto-fit\s*\{[^}]*max-height:\s*min\(520px,\s*calc\(100vh - 24px\)\)/s,
  );
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-content-scroll\s*\{[^}]*overflow:\s*auto/s,
  );
  assert.match(FLOATING_WINDOW_CSS, /font:\s*12px\/1\.5/);
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-translation\s*\{[^}]*font-size:\s*14px/s,
  );
});

test("allows bounded resizing only for the detached card", () => {
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-floating-window\s*\{[^}]*min-width:\s*min\(320px,\s*calc\(100vw - 24px\)\)[^}]*min-height:\s*min\(240px,\s*calc\(100vh - 24px\)\)[^}]*resize:\s*both/s,
  );
  assert.match(
    FLOATING_WINDOW_CSS,
    /\.zct-floating-window--embedded\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0[^}]*resize:\s*none/s,
  );
});
