import test from "node:test";
import assert from "node:assert/strict";
import {
  PdfTextAccessUnavailable,
  ReaderAdapter,
} from "../addon/content/modules/reader-adapter.mjs";

test("registers and unregisters the official text-selection popup handler", () => {
  const calls = [];
  const readerAPI = {
    registerEventListener: (...args) => calls.push(["register", ...args]),
    unregisterEventListener: (...args) => calls.push(["unregister", ...args]),
  };
  const adapter = new ReaderAdapter({ readerAPI, pluginID: "plugin@test" });
  const handler = () => {};
  adapter.register(handler);
  adapter.unregister();

  assert.equal(calls[0][0], "register");
  assert.equal(calls[0][1], "renderTextSelectionPopup");
  assert.equal(calls[0][3], "plugin@test");
  assert.deepEqual(calls[1].slice(0, 2), ["unregister", "renderTextSelectionPopup"]);
});

test("normalizes object and JSON-string annotation positions", () => {
  const adapter = new ReaderAdapter({ readerAPI: {}, pluginID: "plugin@test" });
  const makeEvent = (position) => ({
    reader: { itemID: 42 },
    doc: { name: "reader-document" },
    params: { annotation: { text: " selected text ", position } },
  });
  const objectResult = adapter.extractSelection(
    makeEvent({ pageIndex: 3, rects: [[1, 2, 9, 8]] }),
  );
  const stringResult = adapter.extractSelection(
    makeEvent(JSON.stringify({ pageIndex: 4, rects: [[2, 3, 10, 9]] })),
  );

  assert.deepEqual(
    { ...objectResult, doc: undefined, reader: undefined },
    {
      ok: true,
      attachmentID: 42,
      text: "selected text",
      pageIndex: 3,
      rects: [[1, 2, 9, 8]],
      doc: undefined,
      reader: undefined,
    },
  );
  assert.equal(stringResult.pageIndex, 4);
});

test("copies Reader selection rectangles without calling foreign-realm array methods", () => {
  const foreignArrayLike = (...values) => ({
    ...Object.fromEntries(values.map((value, index) => [index, value])),
    length: values.length,
    map() {
      throw new Error("must not pass plugin callbacks into Reader arrays");
    },
    slice() {
      throw new Error("must not call Reader array methods");
    },
  });
  const adapter = new ReaderAdapter({ readerAPI: {}, pluginID: "plugin@test" });
  const result = adapter.extractSelection({
    reader: { itemID: 42 },
    doc: { name: "reader-document" },
    params: {
      annotation: {
        text: " selected text ",
        position: {
          pageIndex: 3,
          rects: foreignArrayLike(foreignArrayLike(1, 2, 9, 8)),
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.rects, [[1, 2, 9, 8]]);
});

test("returns a typed invalid result instead of throwing for unusable selections", () => {
  const adapter = new ReaderAdapter({ readerAPI: {}, pluginID: "plugin@test" });
  const result = adapter.extractSelection({
    reader: { itemID: 7 },
    params: { annotation: { text: "", position: "not json" } },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "EMPTY_TEXT");
});

test("extracts positioned text blocks from a detected PDF.js document", async () => {
  const pages = [
    [{ str: "1 Introduction", transform: [1, 0, 0, 14, 20, 700], width: 100, height: 14 }],
    [{ str: "Body text", transform: [1, 0, 0, 10, 20, 680], width: 55, height: 10 }],
  ];
  const pdfDocument = {
    numPages: 2,
    async getPage(number) {
      return {
        getViewport: () => ({
          transform: [1, 0, 0, -1, 0, 800],
          convertToViewportRectangle: () => {
            throw new Error("must not pass a plugin-compartment array into PDF.js");
          },
        }),
        getTextContent: async () => ({ items: pages[number - 1] }),
      };
    },
  };
  const adapter = new ReaderAdapter({
    readerAPI: {},
    pluginID: "plugin@test",
    resolvePdfDocument: () => pdfDocument,
  });

  const blocks = await adapter.extractDocumentBlocks({});
  assert.deepEqual(blocks.map((block) => block.pageIndex), [0, 1]);
  assert.equal(blocks[0].text, "1 Introduction");
  assert.deepEqual(blocks[0].rect, [20, 86, 120, 100]);
  assert.deepEqual(blocks[0].pdfRect, [20, 700, 120, 714]);
});

test("keeps same-height text in distant PDF columns as separate blocks", async () => {
  const rows = [700, 680, 660];
  const adapter = new ReaderAdapter({
    readerAPI: {},
    pluginID: "plugin@test",
    resolvePdfDocument: () => ({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => null,
        getTextContent: async () => ({
          items: rows.flatMap((y, index) => [
            { str: `Left ${index}`, transform: [1, 0, 0, 10, 40, y], width: 70, height: 10 },
            { str: `Right ${index}`, transform: [1, 0, 0, 10, 130, y], width: 80, height: 10 },
          ]),
        }),
      }),
    }),
  });

  const blocks = await adapter.extractDocumentBlocks({});
  assert.deepEqual(blocks.map((block) => block.text), [
    "Left 2", "Right 2", "Left 1", "Right 1", "Left 0", "Right 0",
  ]);
  assert.deepEqual(blocks.map((block) => block.layoutColumn), [0, 1, 0, 1, 0, 1]);
});

test("does not mistake ordinary narrow word gaps for page gutters", async () => {
  const rows = [700, 680, 660];
  const adapter = new ReaderAdapter({
    readerAPI: {},
    pluginID: "plugin@test",
    resolvePdfDocument: () => ({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => null,
        getTextContent: async () => ({
          items: rows.flatMap((y, index) => [
            { str: `Sentence ${index}`, transform: [1, 0, 0, 10, 40, y], width: 60, height: 10 },
            { str: "continues", transform: [1, 0, 0, 10, 110, y], width: 55, height: 10 },
          ]),
        }),
      }),
    }),
  });

  const blocks = await adapter.extractDocumentBlocks({});
  assert.deepEqual(blocks.map((block) => block.text), [
    "Sentence 2 continues",
    "Sentence 1 continues",
    "Sentence 0 continues",
  ]);
  assert.ok(blocks.every((block) => block.layoutColumn === null));
});

test("stops with a typed result when PDF.js text access is unavailable", async () => {
  const adapter = new ReaderAdapter({ readerAPI: {}, pluginID: "plugin@test" });
  await assert.rejects(
    adapter.extractDocumentBlocks({}),
    PdfTextAccessUnavailable,
  );
});

test("waives Zotero reader Xray wrappers before calling PDF.js page methods", async () => {
  const wrappedPage = { wrapped: "page" };
  const wrappedContent = { wrapped: "content" };
  const page = {
    getViewport: () => null,
    getTextContent: async () => wrappedContent,
  };
  const content = {
    items: {
      0: { str: "Visible text", transform: [1, 0, 0, 10, 10, 20], width: 40, height: 10 },
      length: 1,
      filter() {
        throw new Error("must not pass callbacks into a PDF-compartment array");
      },
    },
  };
  const adapter = new ReaderAdapter({
    readerAPI: {},
    pluginID: "plugin@test",
    resolvePdfDocument: () => ({
      numPages: 1,
      getPage: async () => wrappedPage,
    }),
    waiveXrays: (value) => {
      if (value === wrappedPage) return page;
      if (value === wrappedContent) return content;
      return value;
    },
  });

  const blocks = await adapter.extractDocumentBlocks({});
  assert.equal(blocks[0].text, "Visible text");
});

test("clones getViewport options into the Zotero PDF compartment", async () => {
  const pdfWindow = { compartment: "pdf" };
  const privilegedOptions = { privileged: true };
  let receivedOptions = null;
  const adapter = new ReaderAdapter({
    readerAPI: {},
    pluginID: "plugin@test",
    resolvePdfDocument: () => ({
      numPages: 1,
      getPage: async () => ({
        getViewport(options) {
          receivedOptions = options;
          return { transform: [1, 0, 0, -1, 0, 800] };
        },
        getTextContent: async () => ({
          items: [{ str: "Text", transform: [1, 0, 0, 10, 10, 20], width: 20, height: 10 }],
        }),
      }),
    }),
    resolvePdfWindow: () => pdfWindow,
    cloneInto: (value, target) => {
      assert.deepEqual(value, { scale: 1 });
      assert.equal(target, pdfWindow);
      return privilegedOptions;
    },
  });

  await adapter.extractDocumentBlocks({});
  assert.equal(receivedOptions, privilegedOptions);
});
