import test from "node:test";
import assert from "node:assert/strict";
import { inferPaperMetadata } from "../addon/content/modules/paper-metadata.mjs";
import { DocumentContextIndex } from "../addon/content/modules/plugin.mjs";

test("infers a multi-line title and abstract when Zotero metadata is missing", () => {
  const blocks = [
    { pageIndex: 0, documentOrdinal: 0, text: "Make Agent Defeat Agent: Automatic Detection of", fontSize: 18, rect: [80, 100, 530, 122] },
    { pageIndex: 0, documentOrdinal: 1, text: "Taint-Style Vulnerabilities in LLM-based Agents", fontSize: 18, rect: [95, 126, 515, 148] },
    { pageIndex: 0, documentOrdinal: 2, text: "Fengyu Liu et al.", fontSize: 11, rect: [200, 170, 410, 184] },
    { pageIndex: 1, documentOrdinal: 3, text: "Abstract", fontSize: 12, rect: [80, 200, 150, 214] },
    { pageIndex: 1, documentOrdinal: 4, text: "Large language models enable agent applications.", fontSize: 10, rect: [60, 220, 285, 232] },
    { pageIndex: 1, documentOrdinal: 5, text: "We present a directed fuzzing framework.", fontSize: 10, rect: [60, 235, 285, 247] },
    { pageIndex: 1, documentOrdinal: 6, text: "1 Introduction", fontSize: 13, rect: [60, 270, 180, 285] },
  ];

  const result = inferPaperMetadata(blocks, {
    title: "",
    abstract: "",
    creators: ["Fengyu Liu"],
    publicationTitle: "USENIX Security",
    date: "2025",
  });

  assert.equal(
    result.title,
    "Make Agent Defeat Agent: Automatic Detection of Taint-Style Vulnerabilities in LLM-based Agents",
  );
  assert.equal(
    result.abstract,
    "Large language models enable agent applications. We present a directed fuzzing framework.",
  );
  assert.deepEqual(result.creators, ["Fengyu Liu"]);
});

test("keeps curated Zotero title and abstract", () => {
  const result = inferPaperMetadata(
    [{ pageIndex: 0, text: "Wrong visual title", fontSize: 20, rect: [0, 0, 100, 20] }],
    { title: "Curated title", abstract: "Curated abstract" },
  );
  assert.equal(result.title, "Curated title");
  assert.equal(result.abstract, "Curated abstract");
});

test("extracts an abstract that begins on the same line as its label", () => {
  const result = inferPaperMetadata(
    [
      { pageIndex: 0, text: "Paper title", fontSize: 18, rect: [0, 0, 100, 20] },
      { pageIndex: 0, text: "Abstract—Agents need document contex-", fontSize: 10, rect: [0, 30, 200, 42] },
      { pageIndex: 0, text: "t. This work builds a structural index.", fontSize: 10, rect: [0, 45, 200, 57] },
      { pageIndex: 0, text: "1 Introduction", fontSize: 13, rect: [0, 70, 130, 84] },
    ],
    { title: "Paper title", abstract: "" },
  );

  assert.equal(
    result.abstract,
    "Agents need document context. This work builds a structural index.",
  );
});

test("background indexing stores inferred metadata in the document cache", async () => {
  let saved;
  const index = new DocumentContextIndex({
    readerAdapter: {
      extractDocumentBlocks: async () => [
        { id: "title", pageIndex: 0, text: "Inferred Paper Title", fontSize: 18, rect: [10, 10, 200, 30] },
        { id: "abstract", pageIndex: 0, text: "Abstract", fontSize: 12, rect: [10, 50, 80, 65] },
        { id: "body", pageIndex: 0, text: "This is the inferred abstract.", fontSize: 10, rect: [10, 70, 200, 82] },
        { id: "intro", pageIndex: 0, text: "1 Introduction", fontSize: 13, rect: [10, 100, 130, 115] },
      ],
    },
    cache: {
      loadDocument: async () => null,
      saveDocument: async (record) => { saved = record; },
    },
    readMetadata: () => ({ title: "", abstract: "" }),
    getIdentity: async () => ({ attachmentKey: "A", fingerprint: "1" }),
    logger: { error() {} },
  });

  const record = await index.begin({ attachmentID: 1, reader: {} });
  assert.equal(record.metadata.title, "Inferred Paper Title");
  assert.equal(record.metadata.abstract, "This is the inferred abstract.");
  assert.equal(saved.metadata.title, "Inferred Paper Title");
});
