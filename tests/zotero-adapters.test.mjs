import test from "node:test";
import assert from "node:assert/strict";
import { CredentialStore } from "../addon/content/modules/credential-store.mjs";
import {
  createLoginBackend,
  createPreferenceBackend,
  createZoteroFileAdapter,
  readPaperMetadata,
} from "../addon/content/modules/zotero-adapters.mjs";

test("maps parent-item academic metadata without touching the database", () => {
  const parent = {
    getField: (name) => ({
      title: "Context Paper",
      abstractNote: "An abstract",
      publicationTitle: "Journal",
      date: "2026",
    })[name] ?? "",
    getCreators: () => [
      { firstName: "Ada", lastName: "Lovelace", creatorType: "author" },
    ],
  };
  const attachment = { parentItemID: 9 };
  const zotero = { Items: { get: (id) => (id === 9 ? parent : attachment) } };

  assert.deepEqual(readPaperMetadata(zotero, 4), {
    title: "Context Paper",
    abstract: "An abstract",
    publicationTitle: "Journal",
    date: "2026",
    creators: ["Ada Lovelace"],
  });
});

test("uses namespaced preference keys", () => {
  const calls = [];
  const backend = createPreferenceBackend({
    get: (key) => (calls.push(["get", key]), "value"),
    set: (key, value) => calls.push(["set", key, value]),
    clear: (key) => calls.push(["clear", key]),
  });
  assert.equal(backend.get("baseURL"), "value");
  backend.set("model", "gpt-compatible");
  backend.clear("targetLanguage");

  assert.deepEqual(calls, [
    ["get", "extensions.zotero-context-translator.baseURL"],
    ["set", "extensions.zotero-context-translator.model", "gpt-compatible"],
    ["clear", "extensions.zotero-context-translator.targetLanguage"],
  ]);
});

test("stores and replaces API keys in the dedicated Login Manager realm", async () => {
  const logins = [];
  const manager = {
    findLogins: (origin, formActionOrigin, realm) =>
      logins.filter((item) => item.origin === origin && item.httpRealm === realm),
    addLoginAsync: async (login) => logins.push(login),
    removeLogin: async (login) => logins.splice(logins.indexOf(login), 1),
    getAllLogins: async () => [...logins],
  };
  const backend = createLoginBackend({
    loginManager: manager,
    createLogin: (value) => ({
      origin: value.origin,
      formActionOrigin: null,
      httpRealm: value.realm,
      username: value.username,
      password: value.password,
    }),
  });
  const store = new CredentialStore(backend);
  await store.setAPIKey("https://api.example.com/v1", "first");
  await store.setAPIKey("https://api.example.com/v1", "second");

  assert.equal(logins.length, 1);
  assert.equal(logins[0].httpRealm, "Zotero Context Translator API Key");
  assert.equal(await store.getAPIKey("https://api.example.com/v1"), "second");
  await backend.removeAll();
  assert.equal(logins.length, 0);
});

test("writes cache JSON through a temp file and move", async () => {
  const calls = [];
  const io = {
    makeDirectory: async (path, options) => calls.push(["mkdir", path, options]),
    writeUTF8: async (path, value) => calls.push(["write", path, value]),
    move: async (source, destination, options) =>
      calls.push(["move", source, destination, options]),
  };
  const adapter = createZoteroFileAdapter({
    IOUtils: io,
    PathUtils: { join: (...parts) => parts.join("/") },
    rootPath: "profile/cache/zct",
    random: () => "fixed",
    cloneIntoIO: (value) => ({ ...value, privileged: true }),
  });
  await adapter.writeJSONAtomic("documents/test.json", { ok: true });

  assert.match(calls[1][1], /test\.json\.tmp-fixed$/);
  assert.deepEqual(JSON.parse(calls[1][2]), { ok: true });
  assert.equal(calls[2][0], "move");
  assert.equal(calls[2][2], "profile/cache/zct/documents/test.json");
  assert.deepEqual(calls[0][2], {
    ignoreExisting: true,
    createAncestors: true,
    privileged: true,
  });
  assert.deepEqual(calls[2][3], { noOverwrite: false, privileged: true });
});

test("parses cached JSON inside the plugin compartment", async () => {
  const adapter = createZoteroFileAdapter({
    IOUtils: { readUTF8: async () => '{"cacheVersion":1,"ok":true}' },
    PathUtils: { join: (...parts) => parts.join("/") },
    rootPath: "profile/cache/zct",
  });

  assert.deepEqual(await adapter.readJSON("documents/test.json"), {
    cacheVersion: 1,
    ok: true,
  });
});

test("preference fragment exposes only explicit connection-test actions", async () => {
  const { readFile } = await import("node:fs/promises");
  const xhtml = await readFile(
    new URL("../addon/content/preferences.xhtml", import.meta.url),
    "utf8",
  );
  assert.match(xhtml, /type="password"/);
  assert.match(xhtml, /Base URL/);
  assert.match(xhtml, /Model Name/);
  assert.match(xhtml, /最小的一次 API 请求/);
  assert.doesNotMatch(xhtml, /sidebar/i);
});

test("composition root uses Zotero 9 global IOUtils and PathUtils", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../addon/content/modules/plugin.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /resource:\/\/gre\/modules\/(?:IOUtils|PathUtils)\.sys\.mjs/);
  assert.match(source, /globalThis\.IOUtils/);
  assert.match(source, /globalThis\.PathUtils/);
  assert.doesNotMatch(source, /resource:\/\/gre\/modules\/Services\.sys\.mjs/);
  assert.match(source, /@mozilla\.org\/login-manager;1/);
  assert.match(source, /Zotero\.logError/);
  assert.match(source, /createElement\("style"\)/);
  assert.doesNotMatch(source, /floating-window\.css/);
});
