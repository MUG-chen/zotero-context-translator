import test from "node:test";
import assert from "node:assert/strict";
import { CacheRepository } from "../addon/content/modules/cache-repository.mjs";
import { DocumentContextIndex } from "../addon/content/modules/plugin.mjs";

function makeIndex(blocks, options = {}) {
  return new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: options.extractDocumentBlocks ?? (async () => blocks),
    },
    cache: {
      loadDocument: async () => null,
      saveDocument: async () => {},
    },
    readMetadata: () => ({ title: "General paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "ABC", fingerprint: "1" }),
  });
}

function block(text, rect, extra = {}) {
  return {
    pageIndex: extra.pageIndex ?? 0,
    layoutColumn: extra.layoutColumn ?? 0,
    text,
    rect,
    pdfRect: rect,
    fontSize: extra.fontSize ?? 10,
    fontWeight: extra.fontWeight ?? 400,
    spansColumns: extra.spansColumns ?? false,
  };
}

class MemoryDocumentFiles {
  constructor() {
    this.records = new Map();
    this.clock = 0;
  }

  async readJSON(path) {
    const entry = this.records.get(path);
    if (!entry) {
      const error = new Error("missing");
      error.code = "ENOENT";
      throw error;
    }
    return structuredClone(entry.value);
  }

  async writeJSONAtomic(path, value) {
    this.records.set(path, {
      value: structuredClone(value),
      size: 1,
      lastUsed: ++this.clock,
      kind: "document",
    });
  }

  seed(path, value) {
    this.records.set(path, {
      value: structuredClone(value),
      size: 1,
      lastUsed: ++this.clock,
      kind: "document",
    });
  }

  async list() {
    return [...this.records.entries()].map(([path, entry]) => ({
      path,
      size: entry.size,
      lastUsed: entry.lastUsed,
      kind: entry.kind,
    }));
  }

  async remove(path) {
    this.records.delete(path);
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makePausedIndex() {
  const extraction = deferred();
  const started = deferred();
  const saves = [];
  let extractionSignal;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks(_reader, options = {}) {
        extractionSignal = options.signal;
        started.resolve();
        return extraction.promise;
      },
    },
    cache: {
      loadDocument: async () => null,
      saveDocument: async (record) => saves.push(record),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "PAUSED", fingerprint: "1" }),
    clearDisposable: async () => {},
  });
  return {
    index,
    extraction,
    started: started.promise,
    saves,
    get extractionSignal() {
      return extractionSignal;
    },
  };
}

test("context index returns reconstructed paragraphs instead of visual lines", async () => {
  const index = makeIndex([
    block("2 Method", [50, 10, 280, 24], { fontSize: 14, fontWeight: 700 }),
    block("Our approach combines local", [60, 35, 280, 45]),
    block("and global context for translation.", [50, 47, 280, 57]),
    block("We evaluate it on papers.", [60, 64, 280, 74]),
    block("The results are robust.", [50, 76, 280, 86]),
  ]);
  const selection = {
    attachmentID: 11,
    reader: {},
    text: "global context",
    pageIndex: 0,
    rects: [[50, 47, 280, 57]],
  };

  await index.begin(selection);
  const context = await index.resolve(selection);

  assert.equal(
    context.currentParagraph,
    "Our approach combines local and global context for translation.",
  );
  assert.deepEqual(context.nearParagraphs, [
    "We evaluate it on papers. The results are robust.",
  ]);
  assert.deepEqual(context.sectionPath, ["2 Method"]);
});

test("context index rejects on timeout instead of returning empty context", async () => {
  const index = makeIndex([], {
    extractDocumentBlocks: () => new Promise(() => {}),
  });
  const selection = {
    attachmentID: 12,
    reader: {},
    text: "selection",
    pageIndex: 0,
    rects: [],
  };
  index.begin(selection).catch(() => {});

  await assert.rejects(
    index.resolve(selection, { maxWaitMs: 5 }),
    /timed out after 5 ms/,
  );
});

test("context index wait is abortable", async () => {
  const index = makeIndex([], {
    extractDocumentBlocks: () => new Promise(() => {}),
  });
  const selection = {
    attachmentID: 13,
    reader: {},
    text: "selection",
    pageIndex: 0,
    rects: [],
  };
  const controller = new AbortController();
  index.begin(selection).catch(() => {});
  const resolution = index.resolve(selection, {
    maxWaitMs: 10_000,
    signal: controller.signal,
  });
  controller.abort();

  await assert.rejects(resolution, { name: "AbortError" });
});

test("runtime indexing enforces the cache limit and prunes evicted ready entries", async () => {
  const files = new MemoryDocumentFiles();
  const cache = new CacheRepository(files, { cacheVersion: 1 });
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: async () => [block("Document body", [0, 0, 10, 10])],
    },
    cache,
    cacheLimitBytes: 2,
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async (attachmentID) => ({
      attachmentKey: `ATT${attachmentID}`,
      fingerprint: "1",
    }),
  });

  for (const attachmentID of [1, 2, 3]) {
    await index.begin({ attachmentID, reader: {} });
  }

  assert.deepEqual([...files.records.keys()], [
    "documents/ATT2-1.v1.json",
    "documents/ATT3-1.v1.json",
  ]);
  assert.deepEqual([...index.entries.keys()], ["2", "3"]);
});

test("self-evicted analysis is available once but is not retained in memory", async () => {
  const files = new MemoryDocumentFiles();
  const cache = new CacheRepository(files, { cacheVersion: 1 });
  let extractionCount = 0;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: async () => [
        block(`Document body ${++extractionCount}`, [0, 0, 10, 10]),
      ],
    },
    cache,
    cacheLimitBytes: 0,
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "OVERSIZED", fingerprint: "1" }),
  });
  const selection = {
    attachmentID: 4,
    reader: {},
    text: "Document body",
    pageIndex: 0,
    rects: [[0, 0, 10, 10]],
  };

  const first = index.begin(selection);
  const context = await index.resolve(selection);

  assert.equal(context.currentParagraph, "Document body 1");
  assert.equal((await first).blocks[0].text, "Document body 1");
  assert.equal(files.records.has("documents/OVERSIZED-1.v1.json"), false);
  assert.equal(index.entries.has("4"), false);

  const later = await index.begin({ ...selection, reader: {} });
  assert.equal(later.blocks[0].text, "Document body 2");
  assert.equal(extractionCount, 2);
});

test("first cache access repairs an already oversized persisted cache", async () => {
  const files = new MemoryDocumentFiles();
  for (const attachmentID of [1, 2, 3]) {
    const identity = { attachmentKey: `ATT${attachmentID}`, fingerprint: "1" };
    files.seed(`documents/ATT${attachmentID}-1.v1.json`, {
      cacheVersion: 1,
      identity,
      marker: attachmentID,
    });
  }
  const cache = new CacheRepository(files, { cacheVersion: 1 });
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: async () => {
        throw new Error("cached document must not be extracted");
      },
    },
    cache,
    cacheLimitBytes: 2,
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "ATT3", fingerprint: "1" }),
  });

  const record = await index.begin({ attachmentID: 3, reader: {} });

  assert.equal(record.marker, 3);
  assert.deepEqual([...files.records.keys()], [
    "documents/ATT2-1.v1.json",
    "documents/ATT3-1.v1.json",
  ]);
});

test("clear invalidates paused extraction before it can save or revive an entry", async () => {
  const harness = makePausedIndex();
  const pending = harness.index.begin({ attachmentID: 20, reader: {} });
  await harness.started;

  const clearing = harness.index.clear();
  assert.equal(harness.extractionSignal?.aborted, true);
  harness.extraction.resolve([block("Stale body", [0, 0, 10, 10])]);
  await clearing;

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(harness.saves.length, 0);
  assert.equal(harness.index.entries.size, 0);
});

test("dispose invalidates paused extraction and releases its active signal", async () => {
  const harness = makePausedIndex();
  const pending = harness.index.begin({ attachmentID: 21, reader: {} });
  await harness.started;

  harness.index.dispose();
  assert.equal(harness.extractionSignal?.aborted, true);
  harness.extraction.resolve([block("Stale body", [0, 0, 10, 10])]);

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(harness.saves.length, 0);
  assert.equal(harness.index.entries.size, 0);
});

test("reanalyze invalidates paused extraction and saves only the replacement", async () => {
  const firstExtraction = deferred();
  const firstStarted = deferred();
  const saves = [];
  let extractionCount = 0;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks(_reader, options = {}) {
        extractionCount += 1;
        if (extractionCount === 1) {
          firstStarted.resolve(options.signal);
          return firstExtraction.promise;
        }
        return Promise.resolve([block("Fresh body", [0, 0, 10, 10])]);
      },
    },
    cache: {
      loadDocument: async () => null,
      saveDocument: async (record) => saves.push(record),
      invalidate: async () => {},
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "REANALYZE", fingerprint: "1" }),
  });
  const selection = { attachmentID: 22, reader: {} };
  const stale = index.begin(selection);
  const staleSignal = await firstStarted.promise;

  const replacement = index.reanalyze(selection);
  assert.equal(staleSignal?.aborted, true);
  firstExtraction.resolve([block("Stale body", [0, 0, 10, 10])]);

  await assert.rejects(stale, { name: "AbortError" });
  const fresh = await replacement;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(saves.length, 1);
});

test("reanalyze preserves the replacement written after a stale save settles", async () => {
  const firstSaveStarted = deferred();
  const releaseFirstSave = deferred();
  let extractionCount = 0;
  let saveCount = 0;
  let persisted = null;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks() {
        extractionCount += 1;
        const text = extractionCount === 1 ? "Stale body" : "Fresh body";
        return Promise.resolve([block(text, [0, 0, 10, 10])]);
      },
    },
    cache: {
      loadDocument: async () => null,
      async saveDocument(record) {
        const operation = ++saveCount;
        const saved = structuredClone(record);
        if (operation === 1) {
          firstSaveStarted.resolve();
          await releaseFirstSave.promise;
        }
        persisted = saved;
      },
      async invalidate() {
        persisted = null;
      },
      enforceLimit: async () => ({ removedPaths: [] }),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "WRITE-RACE", fingerprint: "1" }),
  });
  const selection = { attachmentID: 23, reader: {} };
  const stale = index.begin(selection);
  await firstSaveStarted.promise;

  const replacement = index.reanalyze({ ...selection, reader: {} });
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirstSave.resolve();

  await assert.rejects(stale, { name: "AbortError" });
  const fresh = await replacement;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(persisted?.blocks[0].text, "Fresh body");
  assert.deepEqual([...index.entries.keys()], ["23"]);
  assert.equal(index.entries.get("23")?.status, "ready");
  assert.equal(index.entries.get("23")?.record.blocks[0].text, "Fresh body");
});

test("reanalyze preserves the replacement written after a paused update settles", async () => {
  const updateSaveStarted = deferred();
  const releaseUpdateSave = deferred();
  let extractionCount = 0;
  let saveCount = 0;
  let persisted = null;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks() {
        extractionCount += 1;
        const text = extractionCount === 1 ? "Initial body" : "Fresh body";
        return Promise.resolve([block(text, [0, 0, 10, 10])]);
      },
    },
    cache: {
      loadDocument: async () => null,
      async saveDocument(record) {
        const operation = ++saveCount;
        const saved = structuredClone(record);
        if (operation === 2) {
          updateSaveStarted.resolve();
          await releaseUpdateSave.promise;
        }
        persisted = saved;
      },
      async invalidate() {
        persisted = null;
      },
      enforceLimit: async () => ({ removedPaths: [] }),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "UPDATE-RACE", fingerprint: "1" }),
  });
  const selection = { attachmentID: 24, reader: {} };
  await index.begin(selection);

  const update = index.update(24, { paperProfile: { field: "updated" } });
  await updateSaveStarted.promise;
  const replacement = index.reanalyze({ ...selection, reader: {} });
  await new Promise((resolve) => setImmediate(resolve));
  releaseUpdateSave.resolve();

  await assert.rejects(update, { name: "AbortError" });
  const fresh = await replacement;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(persisted?.blocks[0].text, "Fresh body");
  assert.deepEqual([...index.entries.keys()], ["24"]);
  assert.equal(index.entries.get("24")?.status, "ready");
  assert.equal(index.entries.get("24")?.record.blocks[0].text, "Fresh body");
});

test("clear preserves a new write queued after a paused stale save", async () => {
  const staleSaveStarted = deferred();
  const releaseStaleSave = deferred();
  let extractionCount = 0;
  let saveCount = 0;
  let persisted = null;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks() {
        extractionCount += 1;
        const text = extractionCount === 1 ? "Stale body" : "Fresh body";
        return Promise.resolve([block(text, [0, 0, 10, 10])]);
      },
    },
    cache: {
      loadDocument: async () => null,
      async saveDocument(record) {
        const operation = ++saveCount;
        const saved = structuredClone(record);
        if (operation === 1) {
          staleSaveStarted.resolve();
          await releaseStaleSave.promise;
        }
        persisted = saved;
      },
      async invalidate() {
        persisted = null;
      },
      enforceLimit: async () => ({ removedPaths: [] }),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "CLEAR-RACE", fingerprint: "1" }),
    clearDisposable: async () => {
      persisted = null;
    },
  });
  const selection = { attachmentID: 25, reader: {} };
  const stale = index.begin(selection);
  await staleSaveStarted.promise;

  const clearing = index.clear();
  releaseStaleSave.resolve();
  await clearing;
  const replacement = index.begin({ ...selection, reader: {} });

  await assert.rejects(stale, { name: "AbortError" });
  const fresh = await replacement;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(persisted?.blocks[0].text, "Fresh body");
  assert.deepEqual([...index.entries.keys()], ["25"]);
  assert.equal(index.entries.get("25")?.status, "ready");
  assert.equal(index.entries.get("25")?.record.blocks[0].text, "Fresh body");
});

test("overlapping reanalysis preserves the replacement after both invalidations", async () => {
  const firstInvalidationStarted = deferred();
  const releaseFirstInvalidation = deferred();
  let extractionCount = 0;
  let invalidationCount = 0;
  let persisted = null;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks() {
        extractionCount += 1;
        const text = extractionCount === 1 ? "Initial body" : "Fresh body";
        return Promise.resolve([block(text, [0, 0, 10, 10])]);
      },
    },
    cache: {
      loadDocument: async () => null,
      async saveDocument(record) {
        persisted = structuredClone(record);
      },
      async invalidate() {
        const operation = ++invalidationCount;
        if (operation === 1) {
          firstInvalidationStarted.resolve();
          await releaseFirstInvalidation.promise;
        }
        persisted = null;
      },
      enforceLimit: async () => ({ removedPaths: [] }),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "OVERLAP-RACE", fingerprint: "1" }),
  });
  const selection = { attachmentID: 26, reader: {} };
  await index.begin(selection);

  const older = index.reanalyze({ ...selection, reader: {} });
  await firstInvalidationStarted.promise;
  const newer = index.reanalyze({ ...selection, reader: {} });
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirstInvalidation.resolve();

  await assert.rejects(older, { name: "AbortError" });
  const fresh = await newer;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(persisted?.blocks[0].text, "Fresh body");
  assert.deepEqual([...index.entries.keys()], ["26"]);
  assert.equal(index.entries.get("26")?.status, "ready");
  assert.equal(index.entries.get("26")?.record.blocks[0].text, "Fresh body");
});

test("clear purge finishes before a concurrently requested new write", async () => {
  const purgeStarted = deferred();
  const releasePurge = deferred();
  let persisted = null;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: async () => [block("Fresh body", [0, 0, 10, 10])],
    },
    cache: {
      loadDocument: async () => null,
      async saveDocument(record) {
        persisted = structuredClone(record);
      },
      async invalidate() {
        persisted = null;
      },
      enforceLimit: async () => ({ removedPaths: [] }),
    },
    readMetadata: () => ({ title: "Paper", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "PURGE-RACE", fingerprint: "1" }),
    clearDisposable: async () => {
      purgeStarted.resolve();
      await releasePurge.promise;
      persisted = null;
    },
  });
  const selection = { attachmentID: 27, reader: {} };
  const clearing = index.clear();
  await purgeStarted.promise;

  const replacement = index.begin(selection);
  await new Promise((resolve) => setImmediate(resolve));
  releasePurge.resolve();

  await clearing;
  const fresh = await replacement;
  assert.equal(fresh.blocks[0].text, "Fresh body");
  assert.equal(persisted?.blocks[0].text, "Fresh body");
  assert.deepEqual([...index.entries.keys()], ["27"]);
  assert.equal(index.entries.get("27")?.status, "ready");
  assert.equal(index.entries.get("27")?.record.blocks[0].text, "Fresh body");
});
