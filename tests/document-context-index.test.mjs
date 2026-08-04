import test from "node:test";
import assert from "node:assert/strict";
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
