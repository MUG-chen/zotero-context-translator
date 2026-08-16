import test from "node:test";
import assert from "node:assert/strict";
import { createPlugin } from "../addon/content/modules/plugin.mjs";

function snapshot(index) {
  return {
    ok: true,
    attachmentID: (index % 5) + 1,
    text: `selection ${index}`,
    pageIndex: 0,
    rects: [[10, 20, 80, 32]],
    doc: {},
    reader: {},
  };
}

test("100 selections, 50 translations, and five documents leave at most one card and trigger", async () => {
  let activeCards = 0;
  let peakCards = 0;
  let activeTriggers = 0;
  let peakTriggers = 0;
  let latestTrigger = null;
  let registered = 0;
  let apiCalls = 0;
  const indexBegins = new Map();
  const plugin = createPlugin({
    readerAdapter: {
      register() { registered += 1; },
      unregister() { registered -= 1; },
      extractSelection: (value) => value,
    },
    triggerViewFactory: () => {
      let destroyed = false;
      const trigger = {
        mountOptions: null,
        mount(options) { this.mountOptions = options; },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          activeTriggers -= 1;
        },
      };
      activeTriggers += 1;
      peakTriggers = Math.max(peakTriggers, activeTriggers);
      latestTrigger = trigger;
      return trigger;
    },
    viewFactory: () => {
      let destroyed = false;
      activeCards += 1;
      peakCards = Math.max(peakCards, activeCards);
      return {
        mount() {},
        mountActive() {},
        render() {},
        prepareForTranslation() {},
        destroy() {
          if (!destroyed) {
            destroyed = true;
            activeCards -= 1;
          }
        },
      };
    },
    injectStyles() {},
    contextIndex: {
      begin(value) {
        indexBegins.set(value.attachmentID, (indexBegins.get(value.attachmentID) ?? 0) + 1);
        return Promise.resolve();
      },
      async resolve(value) {
        return { selection: value.text, metadata: {}, sectionPath: [] };
      },
      async update() {},
      dispose() {},
    },
    api: {
      async streamTranslation() {
        apiCalls += 1;
        return { translation: "译文", terms: [], paperProfile: null };
      },
      async testConnection() { return { ok: true }; },
    },
    getSettings: async () => ({ baseURL: "https://api.example/v1", model: "m", targetLanguage: "zh-CN" }),
    saveSettings: async () => {},
    credentialStore: {
      getAPIKey: async () => "key",
      setAPIKey: async () => {},
      clearAPIKey: async () => {},
    },
    registerPreferences: async () => "pane",
    unregisterPreferences() {},
    logger: { error() {} },
  });

  await plugin.startup();
  for (let index = 0; index < 100; index += 1) {
    const selected = snapshot(index);
    await plugin.handleSelection(selected);
    if (index < 50) {
      await latestTrigger.mountOptions.onTranslate({
        selection: selected,
        anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
      });
    }
  }
  assert.equal(peakCards, 1);
  assert.equal(peakTriggers, 1);
  assert.equal(activeCards, 0);
  assert.equal(activeTriggers, 1);
  assert.equal(apiCalls, 50);
  assert.equal(indexBegins.size, 5);

  await plugin.shutdown();
  assert.equal(activeCards, 0);
  assert.equal(activeTriggers, 0);
  assert.equal(registered, 0);
});

test("cancellation settles within one second and a late result cannot revive the view", async () => {
  let destroyed = 0;
  let trigger = null;
  const plugin = createPlugin({
    readerAdapter: { register() {}, unregister() {}, extractSelection: (value) => value },
    triggerViewFactory: () => {
      trigger = {
        mountOptions: null,
        mount(options) { this.mountOptions = options; },
        destroy() {},
      };
      return trigger;
    },
    viewFactory: () => ({
      mount() {},
      mountActive() {},
      render() {},
      prepareForTranslation() {},
      destroy() { destroyed += 1; },
    }),
    injectStyles() {},
    contextIndex: {
      begin: () => Promise.resolve(),
      resolve: async (value) => ({ selection: value.text, metadata: {} }),
      update: async () => {},
      dispose() {},
    },
    api: {
      streamTranslation(request) {
        return new Promise((resolve, reject) => {
          if (request.signal.aborted) {
            reject(new Error("cancelled"));
            return;
          }
          request.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        });
      },
      testConnection: async () => ({ ok: true }),
    },
    getSettings: async () => ({ baseURL: "https://api.example/v1", model: "m" }),
    saveSettings: async () => {},
    credentialStore: { getAPIKey: async () => "key", clearAPIKey: async () => {} },
    logger: { error() {} },
  });
  const selected = snapshot(1);
  await plugin.handleSelection(selected);
  const request = trigger.mountOptions.onTranslate({
    selection: selected,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });
  await Promise.resolve();
  const started = performance.now();
  plugin.close();
  await request;

  assert.ok(performance.now() - started < 1000);
  assert.equal(plugin.state.current.status, "idle");
  assert.ok(destroyed >= 1);
});
