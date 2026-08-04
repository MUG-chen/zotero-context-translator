import test from "node:test";
import assert from "node:assert/strict";
import { CacheRepository } from "../addon/content/modules/cache-repository.mjs";

class MemoryFiles {
  constructor(initial = {}) {
    this.records = new Map(Object.entries(initial));
    this.failWrite = false;
    this.removed = [];
  }
  async readJSON(path) {
    if (!this.records.has(path)) {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
    return structuredClone(this.records.get(path));
  }
  async writeJSONAtomic(path, value) {
    if (this.failWrite) throw new Error("replace failed");
    this.records.set(path, structuredClone(value));
  }
  async list() {
    return [...this.records.entries()].map(([path, value]) => ({
      path,
      size: value._size ?? 1,
      lastUsed: value.lastUsed ?? 0,
      kind: value.kind ?? "document",
    }));
  }
  async remove(path) {
    this.removed.push(path);
    this.records.delete(path);
  }
  async quarantine(path) {
    this.records.set(`${path}.corrupt`, this.records.get(path));
    this.records.delete(path);
  }
}

const identity = { attachmentKey: "ABC123", fingerprint: "hash" };

test("keeps the last valid cache when atomic replacement fails", async () => {
  const path = "documents/ABC123-hash.v1.json";
  const oldRecord = { cacheVersion: 1, identity, value: "old" };
  const files = new MemoryFiles({ [path]: oldRecord });
  const repo = new CacheRepository(files, { cacheVersion: 1 });
  files.failWrite = true;

  await assert.rejects(
    repo.saveDocument({ identity, value: "new" }),
    /replace failed/,
  );
  assert.deepEqual(await repo.loadDocument(identity), oldRecord);
});

test("treats Zotero IOUtils NotFoundError as an empty cache", async () => {
  let quarantined = false;
  const files = {
    async readJSON() {
      const error = new Error("source file does not exist");
      error.name = "NotFoundError";
      throw error;
    },
    async quarantine() {
      quarantined = true;
      throw new Error("must not quarantine a missing file");
    },
  };
  const repo = new CacheRepository(files, { cacheVersion: 1 });

  assert.equal(await repo.loadDocument(identity), null);
  assert.equal(quarantined, false);
});

test("evicts least-recent disposable documents but preserves confirmed terms", async () => {
  const files = new MemoryFiles({
    "documents/old.json": { _size: 60, lastUsed: 1, kind: "document" },
    "documents/new.json": { _size: 60, lastUsed: 2, kind: "document" },
    "terms/confirmed.json": { _size: 1000, lastUsed: 0, kind: "confirmedTerms" },
  });
  const repo = new CacheRepository(files, { cacheVersion: 1 });

  await repo.enforceLimit(100);

  assert.deepEqual(files.removed, ["documents/old.json"]);
  assert.equal(files.records.has("terms/confirmed.json"), true);
});
