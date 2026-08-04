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

test("100 selections, 50 translations, and five documents leave one view and no hooks", async () => {
  let activeViews = 0;
  let peakViews = 0;
  let registered = 0;
  let apiCalls = 0;
  const indexBegins = new Map();
  const plugin = createPlugin({
    readerAdapter: {
      register() { registered += 1; },
      unregister() { registered -= 1; },
      extractSelection: (value) => value,
    },
    viewFactory: () => {
      let destroyed = false;
      activeViews += 1;
      peakViews = Math.max(peakViews, activeViews);
      return {
        mount() {},
        render() {},
        destroy() {
          if (!destroyed) {
            destroyed = true;
            activeViews -= 1;
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
    await plugin.handleSelection(snapshot(index));
    if (index < 50) await plugin.translate("sentence");
  }
  assert.equal(peakViews, 1);
  assert.equal(activeViews, 1);
  assert.equal(apiCalls, 50);
  assert.equal(indexBegins.size, 5);

  await plugin.shutdown();
  assert.equal(activeViews, 0);
  assert.equal(registered, 0);
});

test("cancellation settles within one second and a late result cannot revive the view", async () => {
  let destroyed = 0;
  const plugin = createPlugin({
    readerAdapter: { register() {}, unregister() {}, extractSelection: (value) => value },
    viewFactory: () => ({ mount() {}, render() {}, destroy() { destroyed += 1; } }),
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
  await plugin.handleSelection(snapshot(1));
  const request = plugin.translate("sentence");
  await Promise.resolve();
  const started = performance.now();
  plugin.close();
  await request;

  assert.ok(performance.now() - started < 1000);
  assert.equal(plugin.state.current.status, "idle");
  assert.ok(destroyed >= 1);
});
