import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

test("bootstrap delegates startup and shutdown exactly once", async () => {
  const source = await readFile(
    new URL("../addon/bootstrap.js", import.meta.url),
    "utf8",
  );
  const calls = [];
  const chromeHandle = { destruct: () => calls.push(["destruct"]) };
  const plugin = {
    startup: async (context) => calls.push(["startup", context.rootURI]),
    shutdown: async () => calls.push(["shutdown"]),
  };
  const preferences = {};
  const context = {
    Services: {
      io: { newURI: (value) => value },
      scriptloader: {
        loadSubScript(specifier, scope) {
          assert.equal(
            specifier,
            "chrome://zotero-context-translator/content/plugin-bundle.js",
          );
          for (const name of [
            "AbortController",
            "URL",
            "TextDecoder",
            "Uint8Array",
            "crypto",
          ]) {
            assert.equal(scope[name], context[name], `${name} must be injected`);
          }
          for (const name of ["fetch", "setTimeout", "clearTimeout"]) {
            assert.equal(typeof scope[name], "function", `${name} must be injected`);
          }
          scope.ZoteroContextTranslator = { plugin, preferences };
        },
      },
    },
    ChromeUtils: {},
    Cu: {},
    Cc: {
      "@mozilla.org/addons/addon-manager-startup;1": {
        getService: () => ({ registerChrome: () => chromeHandle }),
      },
    },
    Ci: { amIAddonManagerStartup: {} },
    Zotero: { initializationPromise: Promise.resolve() },
    IOUtils: {},
    PathUtils: {},
    fetch() {},
    AbortController: class AbortController {},
    URL: class URL {},
    setTimeout() {},
    clearTimeout() {},
    TextDecoder: class TextDecoder {},
    Uint8Array: class Uint8Array {},
    crypto: {},
  };
  context.Services.wm = { getMostRecentWindow: () => context };

  vm.runInNewContext(source, context);
  await context.startup({ rootURI: "file:///plugin/" }, 0);
  assert.equal(context.Zotero.ZoteroContextTranslator.preferences, preferences);
  await context.shutdown({}, 0);
  assert.equal(context.Zotero.ZoteroContextTranslator, undefined);

  assert.deepEqual(calls, [
    ["startup", "file:///plugin/"],
    ["shutdown"],
    ["destruct"],
  ]);
});

test("bootstrap asks the plugin to roll back when startup rejects", async () => {
  const source = await readFile(
    new URL("../addon/bootstrap.js", import.meta.url),
    "utf8",
  );
  const calls = [];
  const chromeHandle = { destruct: () => calls.push("destruct") };
  const plugin = {
    startup: async () => {
      calls.push("startup");
      throw new Error("startup failed");
    },
    shutdown: async () => calls.push("shutdown"),
  };
  const context = {
    Services: {
      io: { newURI: (value) => value },
      wm: { getMostRecentWindow: () => context },
      scriptloader: {
        loadSubScript(_specifier, scope) {
          scope.ZoteroContextTranslator = { plugin, preferences: {} };
        },
      },
    },
    Cc: {
      "@mozilla.org/addons/addon-manager-startup;1": {
        getService: () => ({ registerChrome: () => chromeHandle }),
      },
    },
    Ci: { amIAddonManagerStartup: {} },
    Cu: {},
    ChromeUtils: {},
    Zotero: { initializationPromise: Promise.resolve(), logError() {} },
    IOUtils: {},
    PathUtils: {},
    fetch() {},
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    TextDecoder,
    Uint8Array,
    crypto: {},
  };

  vm.runInNewContext(source, context);
  await assert.rejects(
    context.startup({ rootURI: "file:///plugin/" }, 0),
    /startup failed/,
  );

  assert.deepEqual(calls, ["startup", "shutdown", "destruct"]);
  assert.equal(context.Zotero.ZoteroContextTranslator, undefined);
});

test("bootstrap cleans owned state when plugin shutdown rejects", async () => {
  const calls = [];
  const plugin = {
    startup: async () => calls.push("startup"),
    shutdown: async () => {
      calls.push("shutdown");
      throw new Error("plugin shutdown failed");
    },
  };
  const context = await loadBootstrap(plugin, {
    destruct: () => calls.push("destruct"),
  });
  await context.startup({ rootURI: "file:///plugin/" }, 0);

  await assert.rejects(context.shutdown({}, 0), /plugin shutdown failed/);

  assert.equal(context.Zotero.ZoteroContextTranslator, undefined);
  assert.deepEqual(calls, ["startup", "shutdown", "destruct"]);
  await context.shutdown({}, 0);
  assert.deepEqual(calls, ["startup", "shutdown", "destruct"]);
});

test("bootstrap surfaces cleanup failure once after resetting owned state", async () => {
  const calls = [];
  const plugin = {
    startup: async () => calls.push("startup"),
    shutdown: async () => calls.push("shutdown"),
  };
  const context = await loadBootstrap(plugin, {
    destruct() {
      calls.push("destruct");
      throw new Error("chrome destruction failed");
    },
  });
  await context.startup({ rootURI: "file:///plugin/" }, 0);

  await assert.rejects(context.shutdown({}, 0), /chrome destruction failed/);

  assert.equal(context.Zotero.ZoteroContextTranslator, undefined);
  assert.deepEqual(calls, ["startup", "shutdown", "destruct"]);
  await context.shutdown({}, 0);
  assert.deepEqual(calls, ["startup", "shutdown", "destruct"]);
});

async function loadBootstrap(plugin, chromeHandle) {
  const source = await readFile(
    new URL("../addon/bootstrap.js", import.meta.url),
    "utf8",
  );
  const context = {
    Services: {
      io: { newURI: (value) => value },
      scriptloader: {
        loadSubScript(_specifier, scope) {
          scope.ZoteroContextTranslator = { plugin, preferences: {} };
        },
      },
    },
    ChromeUtils: {},
    Cu: {},
    Cc: {
      "@mozilla.org/addons/addon-manager-startup;1": {
        getService: () => ({ registerChrome: () => chromeHandle }),
      },
    },
    Ci: { amIAddonManagerStartup: {} },
    Zotero: { initializationPromise: Promise.resolve(), logError() {} },
    IOUtils: {},
    PathUtils: {},
    fetch() {},
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    TextDecoder,
    Uint8Array,
    crypto: {},
  };
  context.Services.wm = { getMostRecentWindow: () => context };
  vm.runInNewContext(source, context);
  return context;
}
