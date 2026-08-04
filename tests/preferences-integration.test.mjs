import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

class EventTargetDouble {
  constructor(values = {}) {
    Object.assign(this, values);
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type, event = {}) {
    const results = [];
    for (const listener of this.listeners.get(type) ?? []) {
      results.push(listener({ type, target: event.target ?? this }));
    }
    await Promise.all(results);
  }
}

test("preference fragment initializes on Zotero's showing event and binds each action once", async () => {
  const source = await readFile(
    new URL("../addon/content/preferences.js", import.meta.url),
    "utf8",
  );
  const ids = [
    "zct-base-url",
    "zct-api-key",
    "zct-model",
    "zct-target-language",
    "zct-save-settings",
    "zct-test-connection",
    "zct-clear-key",
    "zct-reanalyze",
    "zct-clear-cache",
    "zct-preference-status",
  ];
  const elements = new Map(ids.map((id) => [id, new EventTargetDouble({ id, value: "" })]));
  const document = new EventTargetDouble({
    getElementById: (id) => elements.get(id) ?? null,
  });
  const saved = [];
  let connectionTests = 0;
  const bridge = {
    getSettings: async () => ({
      baseURL: "https://api.example.com/v1",
      apiKey: "stored-key",
      model: "compatible-model",
      targetLanguage: "zh-CN",
    }),
    saveSettings: async (settings) => saved.push(settings),
    testConnection: async () => {
      connectionTests += 1;
      return { ok: true, latencyMs: 7 };
    },
    clearAPIKey: async () => {},
    reanalyze: async () => {},
    clearCache: async () => {},
  };
  const errors = [];
  const context = {
    document,
    Zotero: {
      ZoteroContextTranslator: { preferences: bridge },
      logError: (error) => errors.push(error),
    },
  };
  vm.runInNewContext(source, context);

  const pane = { id: "zct-preferences" };
  await document.dispatch("showing", { target: pane });
  await document.dispatch("showing", { target: pane });
  await elements.get("zct-save-settings").dispatch("click");
  await elements.get("zct-test-connection").dispatch("click");

  assert.equal(errors.length, 0);
  assert.equal(saved.length, 2);
  assert.equal(connectionTests, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0])), {
    baseURL: "https://api.example.com/v1",
    apiKey: "stored-key",
    model: "compatible-model",
    targetLanguage: "zh-CN",
  });
  assert.match(elements.get("zct-preference-status").textContent, /7 ms/);
});
