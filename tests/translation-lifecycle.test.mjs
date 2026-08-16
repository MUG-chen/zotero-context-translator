import test from "node:test";
import assert from "node:assert/strict";
import { createPlugin } from "../addon/content/modules/plugin.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function snapshot(text = "selected sentence", attachmentID = 11) {
  return {
    ok: true,
    attachmentID,
    text,
    pageIndex: 0,
    rects: [[10, 20, 90, 35]],
    doc: { id: `reader-${attachmentID}` },
    reader: { itemID: attachmentID },
    append() {},
  };
}

function harness(overrides = {}) {
  const triggers = [];
  const cards = [];
  const apiCalls = [];
  const deps = {
    readerAdapter: {
      register() {},
      unregister() {},
      extractSelection: (event) => event,
    },
    triggerViewFactory() {
      const trigger = {
        destroyed: 0,
        mountOptions: null,
        mount(options) { this.mountOptions = options; },
        destroy() { this.destroyed += 1; },
      };
      triggers.push(trigger);
      return trigger;
    },
    viewFactory() {
      const card = {
        activeMount: false,
        destroyed: 0,
        states: [],
        mountOptions: null,
        prepareCalls: 0,
        mount(options) { this.mountOptions = options; },
        mountActive(options) {
          this.activeMount = true;
          this.mountOptions = options;
        },
        render(state) { this.states.push({ ...state }); },
        prepareForTranslation() { this.prepareCalls += 1; },
        destroy() { this.destroyed += 1; },
      };
      cards.push(card);
      return card;
    },
    injectStyles() {},
    contextIndex: {
      begin: () => Promise.resolve(),
      resolve: async (selection) => ({
        selection: selection.text,
        metadata: {},
        sectionPath: [],
      }),
      update: async () => {},
      reanalyze: async () => {},
      clear: async () => {},
      dispose() {},
    },
    api: {
      async streamTranslation(request) {
        apiCalls.push(request);
        return { translation: "译文" };
      },
      testConnection: async () => ({ ok: true }),
    },
    getSettings: async () => ({
      baseURL: "https://api.example/v1",
      model: "model",
      targetLanguage: "zh-CN",
    }),
    saveSettings: async () => {},
    credentialStore: {
      getAPIKey: async () => "key",
      clearAPIKey: async () => {},
    },
    logger: { error() {} },
    ...overrides,
  };
  return { plugin: createPlugin(deps), triggers, cards, apiCalls };
}

test("selection only mounts an ephemeral trigger; clicking it starts one active card", async () => {
  const { plugin, triggers, cards, apiCalls } = harness();
  const selected = snapshot();

  await plugin.handleSelection(selected);

  assert.equal(triggers.length, 1);
  assert.equal(cards.length, 0);
  assert.equal(apiCalls.length, 0);
  assert.equal(plugin.state.current.status, "idle");

  await triggers[0].mountOptions.onTranslate({
    selection: selected,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].activeMount, true);
  assert.deepEqual(cards[0].mountOptions.anchorRect, {
    left: 100,
    top: 120,
    right: 180,
    bottom: 152,
  });
  assert.equal(apiCalls.length, 1);
  assert.equal(plugin.state.current.status, "result");
});

test("a later selection in the same paper leaves the active card and request untouched", async () => {
  const request = deferred();
  let activeSignal = null;
  const { plugin, triggers, cards } = harness({
    api: {
      streamTranslation(options) {
        activeSignal = options.signal;
        return request.promise;
      },
      testConnection: async () => ({ ok: true }),
    },
  });
  const first = snapshot("first sentence");
  await plugin.handleSelection(first);
  const translation = triggers[0].mountOptions.onTranslate({
    selection: first,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });
  await Promise.resolve();
  await Promise.resolve();

  const second = snapshot("annotation-only selection");
  second.doc = first.doc;
  await plugin.handleSelection(second);

  assert.equal(triggers.length, 2);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].destroyed, 0);
  assert.equal(activeSignal.aborted, false);
  assert.equal(plugin.state.current.selection.text, "first sentence");

  request.resolve({ translation: "first translation" });
  await translation;
  assert.equal(plugin.state.current.translation, "first translation");
});

test("clicking a new trigger cancels the old request and reuses the active card", async () => {
  const signals = [];
  let call = 0;
  const { plugin, triggers, cards } = harness({
    api: {
      streamTranslation(options) {
        call += 1;
        signals.push(options.signal);
        if (call === 2) return Promise.resolve({ translation: "second translation" });
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
        });
      },
      testConnection: async () => ({ ok: true }),
    },
  });
  const first = snapshot("first sentence");
  await plugin.handleSelection(first);
  const firstTranslation = triggers[0].mountOptions.onTranslate({
    selection: first,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });
  await Promise.resolve();
  await Promise.resolve();

  const second = snapshot("second sentence");
  second.doc = first.doc;
  await plugin.handleSelection(second);
  await triggers[1].mountOptions.onTranslate({
    selection: second,
    anchorRect: { left: 220, top: 240, right: 300, bottom: 272 },
  });
  await firstTranslation;

  assert.equal(signals[0].aborted, true);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].destroyed, 0);
  assert.equal(cards[0].prepareCalls, 1);
  assert.equal(plugin.state.current.selection.text, "second sentence");
  assert.equal(plugin.state.current.translation, "second translation");
});

test("a selection in another paper closes the previous active card", async () => {
  const { plugin, triggers, cards, apiCalls } = harness();
  const first = snapshot("first paper", 11);
  await plugin.handleSelection(first);
  await triggers[0].mountOptions.onTranslate({
    selection: first,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });

  await plugin.handleSelection(snapshot("second paper selection", 22));

  assert.equal(cards[0].destroyed, 1);
  assert.equal(plugin.state.current.status, "idle");
  assert.equal(triggers.length, 2);
  assert.equal(apiCalls.length, 1);
});

test("a duplicate event for the active selection does not recreate a trigger", async () => {
  const { plugin, triggers } = harness();
  const selected = snapshot("same sentence");
  await plugin.handleSelection(selected);
  await triggers[0].mountOptions.onTranslate({
    selection: selected,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });

  await plugin.handleSelection({ ...selected });

  assert.equal(triggers.length, 1);
});

test("closing an active card also clears a later ephemeral trigger", async () => {
  const { plugin, triggers, cards } = harness();
  const first = snapshot("translated sentence");
  await plugin.handleSelection(first);
  await triggers[0].mountOptions.onTranslate({
    selection: first,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });
  const second = snapshot("annotation selection");
  second.doc = first.doc;
  await plugin.handleSelection(second);

  cards[0].mountOptions.handlers.close();

  assert.equal(triggers[1].destroyed, 1);
  assert.equal(plugin.state.current.status, "idle");
});
