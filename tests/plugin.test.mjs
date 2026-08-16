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

function selection(text = "selected sentence") {
  return {
    ok: true,
    attachmentID: 11,
    text,
    pageIndex: 0,
    rects: [[10, 20, 90, 35]],
    doc: { id: "reader-doc" },
    reader: { itemID: 11 },
  };
}

function makeDeps(overrides = {}) {
  const trigger = {
    destroyed: 0,
    mountOptions: null,
    mount(options) {
      this.mountOptions = options;
    },
    destroy() {
      this.destroyed += 1;
    },
  };
  const view = {
    states: [],
    destroyed: 0,
    mountOptions: null,
    mount(options) {
      this.mountOptions = options;
    },
    mountActive(options) {
      this.mountOptions = options;
    },
    render(state) {
      this.states.push({ ...state });
    },
    destroy() {
      this.destroyed += 1;
    },
    prepareForTranslation() {},
  };
  const calls = {
    api: [],
    indexBegin: [],
    indexUpdate: [],
    register: 0,
    unregister: 0,
    preferenceRegister: 0,
    preferenceUnregister: 0,
  };
  const deps = {
    readerAdapter: {
      register(handler) {
        calls.register += 1;
        this.handler = handler;
      },
      unregister() {
        calls.unregister += 1;
      },
      extractSelection: (event) => event,
    },
    triggerViewFactory: () => trigger,
    viewFactory: () => view,
    injectStyles: () => {},
    contextIndex: {
      begin(snapshot) {
        calls.indexBegin.push(snapshot);
        return Promise.resolve();
      },
      async resolve(snapshot) {
        return {
          selection: snapshot.text,
          currentParagraph: "surrounding paragraph",
          nearParagraphs: [],
          distantChunks: [],
          metadata: { title: "Paper", abstract: "Abstract" },
          sectionPath: ["3 Method"],
          confirmedTerms: [],
          paperProfile: null,
        };
      },
      async update(attachmentID, result) {
        calls.indexUpdate.push([attachmentID, result]);
      },
      async reanalyze() {},
      async clear() {},
      dispose() {},
    },
    api: {
      async streamTranslation(request, callbacks) {
        calls.api.push(request);
        callbacks?.onDelta?.("<<<TRANSLATION>>>\n译");
        return {
          translation: "译文",
          explanation: "解释",
          terms: [{ source: "alignment", translation: "对齐" }],
          paperProfile: { field: "NLP" },
        };
      },
      async testConnection() {
        return { ok: true, latencyMs: 5 };
      },
    },
    getSettings: async () => ({
      baseURL: "https://api.example.com/v1",
      model: "compatible-model",
      targetLanguage: "zh-CN",
    }),
    saveSettings: async () => {},
    credentialStore: {
      getAPIKey: async () => "secret",
      setAPIKey: async () => {},
      clearAPIKey: async () => {},
    },
    registerPreferences: async () => {
      calls.preferenceRegister += 1;
      return "pane-id";
    },
    unregisterPreferences: () => {
      calls.preferenceUnregister += 1;
    },
    logger: { error() {} },
    ...overrides,
  };
  return { deps, trigger, view, calls };
}

async function activate(plugin, trigger, selected = selection()) {
  await plugin.handleSelection(selected);
  return trigger.mountOptions.onTranslate({
    selection: selected,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });
}

test("shows a trigger before indexing and never calls API until activation", async () => {
  const pending = deferred();
  const { deps, trigger, view, calls } = makeDeps({
    contextIndex: {
      begin(snapshot) {
        calls.indexBegin.push(snapshot);
        return pending.promise;
      },
      async resolve(snapshot) {
        return { selection: snapshot.text, metadata: {}, sectionPath: [] };
      },
      async update() {},
      dispose() {},
    },
  });
  const plugin = createPlugin(deps);

  await plugin.handleSelection(selection());

  assert.ok(trigger.mountOptions);
  assert.equal(view.states.length, 0);
  assert.equal(plugin.state.current.status, "idle");
  assert.equal(calls.api.length, 0);
  assert.equal(calls.indexBegin.length, 1);
  pending.resolve();
});

test("selection trigger starts the single sentence mode and calls API once", async () => {
  const { deps, trigger, calls } = makeDeps();
  const plugin = createPlugin(deps);

  const selected = selection();
  await plugin.handleSelection(selected);
  assert.equal(calls.api.length, 0);

  await trigger.mountOptions.onTranslate({
    selection: selected,
    anchorRect: { left: 100, top: 120, right: 180, bottom: 152 },
  });

  assert.equal(calls.api.length, 1);
  assert.equal(plugin.state.current.mode, "sentence");
});

test("clicking translate uses context, streams in the same view, and caches metadata", async () => {
  const { deps, trigger, view, calls } = makeDeps();
  const plugin = createPlugin(deps);

  const result = await activate(plugin, trigger);

  assert.equal(result.translation, "译文");
  assert.equal(calls.api.length, 1);
  assert.equal(calls.api[0].apiKey, "secret");
  assert.match(calls.api[0].messages[1].content, /3 Method/);
  assert.equal(view.states.at(-1).status, "result");
  assert.deepEqual(calls.indexUpdate[0][1].paperProfile, { field: "NLP" });
});

test("floating close cancels work and destroys the selection overlay", async () => {
  const request = deferred();
  const { deps, trigger, view } = makeDeps({
    api: {
      streamTranslation: () => request.promise,
      testConnection: async () => ({ ok: true }),
    },
  });
  const plugin = createPlugin(deps);
  const translation = activate(plugin, trigger);
  await Promise.resolve();
  await Promise.resolve();

  view.mountOptions.handlers.close();
  request.resolve({ translation: "late" });
  await translation;

  assert.ok(view.destroyed >= 1);
  assert.equal(plugin.state.current.status, "idle");
});

test("startup and shutdown are idempotent and leave no registered hooks", async () => {
  const { deps, calls } = makeDeps();
  const plugin = createPlugin(deps);
  await plugin.startup();
  await plugin.startup();
  await plugin.shutdown();
  await plugin.shutdown();

  assert.equal(calls.register, 1);
  assert.equal(calls.unregister, 1);
  assert.equal(calls.preferenceRegister, 1);
  assert.equal(calls.preferenceUnregister, 1);
});

test("startup rolls back the reader hook when preference registration fails", async () => {
  const failure = new Error("preference pane failed");
  const { deps, trigger, calls } = makeDeps({
    registerPreferences: async () => {
      calls.preferenceRegister += 1;
      throw failure;
    },
  });
  const plugin = createPlugin(deps);

  await assert.rejects(plugin.startup(), failure);

  assert.equal(plugin.started, false);
  assert.equal(calls.register, 1);
  assert.equal(calls.unregister, 1);
});

test("translation waits for the context index before calling the API", async () => {
  const context = deferred();
  const { deps, trigger, calls } = makeDeps({
    contextIndex: {
      begin() {
        return context.promise;
      },
      resolve(_snapshot, { signal }) {
        assert.equal(signal instanceof AbortSignal, true);
        return context.promise;
      },
      async update() {},
      dispose() {},
    },
  });
  const plugin = createPlugin(deps);

  const translation = activate(plugin, trigger);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.api.length, 0);

  context.resolve({
    selection: "selected sentence",
    currentParagraph: "complete paragraph",
    nearParagraphs: [],
    distantChunks: [],
    metadata: { title: "Paper", abstract: "Abstract" },
    sectionPath: ["Method"],
  });
  await translation;
  assert.equal(calls.api.length, 1);
});

test("a failed context index blocks the API request", async () => {
  const failure = new Error("PDF extraction failed");
  const { deps, trigger, calls, view } = makeDeps({
    contextIndex: {
      begin: async () => {
        throw failure;
      },
      resolve: async () => {
        throw failure;
      },
      async update() {},
      dispose() {},
    },
  });
  const plugin = createPlugin(deps);

  const result = await activate(plugin, trigger);

  assert.equal(result, null);
  assert.equal(calls.api.length, 0);
  assert.equal(view.states.at(-1).status, "error");
});

test("preference connection test is an explicit one-token API action", async () => {
  const { deps, calls } = makeDeps();
  deps.api.testConnection = async (config) => {
    calls.api.push(config);
    return { ok: true, latencyMs: 7 };
  };
  const plugin = createPlugin(deps);

  assert.equal(calls.api.length, 0);
  const result = await plugin.testConnection();
  assert.equal(result.ok, true);
  assert.equal(calls.api.length, 1);
});

test("manual retry reuses the triggered selection and last translation mode", async () => {
  let attempts = 0;
  const { deps, trigger, view } = makeDeps({
    api: {
      async streamTranslation() {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return { translation: "重试译文" };
      },
      async testConnection() {
        return { ok: true };
      },
    },
  });
  const plugin = createPlugin(deps);
  await activate(plugin, trigger);

  await view.mountOptions.handlers.retry();

  assert.equal(attempts, 2);
  assert.equal(plugin.state.current.mode, "sentence");
  assert.equal(plugin.state.current.translation, "重试译文");
});

test("renders API retry progress without replacing the floating window", async () => {
  const { deps, trigger, view } = makeDeps({
    api: {
      async streamTranslation(request, callbacks) {
        callbacks.onProgress?.({
          phase: "retrying",
          attempt: 2,
          maxAttempts: 3,
          status: 503,
        });
        return { translation: "译文" };
      },
      async testConnection() {
        return { ok: true };
      },
    },
  });
  let viewsCreated = 0;
  deps.viewFactory = () => {
    viewsCreated += 1;
    return view;
  };
  const plugin = createPlugin(deps);

  await activate(plugin, trigger);

  assert.equal(viewsCreated, 1);
  assert.ok(
    view.states.some((state) => state.progress?.phase === "retrying"),
  );
});

test("keeps streamed translation visible when the active request fails", async () => {
  const { deps, trigger, view } = makeDeps({
    api: {
      async streamTranslation(request, callbacks) {
        callbacks.onDelta?.("<<<TRANSLATION>>>\n部分译文");
        throw Object.assign(new Error("stream interrupted"), {
          status: 200,
          attempt: 1,
          maxAttempts: 3,
        });
      },
      async testConnection() {
        return { ok: true };
      },
    },
  });
  const plugin = createPlugin(deps);

  await activate(plugin, trigger);

  assert.equal(plugin.state.current.status, "error");
  assert.equal(plugin.state.current.translation, "部分译文");
  assert.equal(view.states.at(-1).translation, "部分译文");
});

test("copy handler fails explicitly when no clipboard implementation exists", async () => {
  const { deps, trigger, view } = makeDeps();
  const plugin = createPlugin(deps);
  await activate(plugin, trigger);

  assert.throws(
    () => view.mountOptions.handlers.copy("译文"),
    /clipboard/i,
  );
});
