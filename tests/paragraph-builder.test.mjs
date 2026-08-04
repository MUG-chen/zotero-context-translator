import test from "node:test";
import assert from "node:assert/strict";
import { buildParagraphs } from "../addon/content/modules/paragraph-builder.mjs";

function line(documentOrdinal, text, rect, options = {}) {
  return {
    documentOrdinal,
    pageIndex: options.pageIndex ?? 0,
    layoutColumn: options.layoutColumn ?? 0,
    text,
    rect,
    fontSize: options.fontSize ?? 10,
    fontWeight: options.fontWeight ?? 400,
  };
}

test("reconstructs indented academic paragraphs and dehyphenates wrapped words", () => {
  const blocks = [
    line(0, "Large language models enable auto-", [60, 20, 280, 30]),
    line(1, "matic analysis of scientific papers.", [50, 32, 280, 42]),
    line(2, "However, context remains important.", [60, 48, 280, 58]),
    line(3, "This motivates our method.", [50, 60, 280, 70]),
  ];

  const paragraphs = buildParagraphs(blocks, []);

  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.text),
    [
      "Large language models enable automatic analysis of scientific papers.",
      "However, context remains important. This motivates our method.",
    ],
  );
  assert.deepEqual(
    paragraphs.map(({ startOrdinal, endOrdinal }) => ({ startOrdinal, endOrdinal })),
    [
      { startOrdinal: 0, endOrdinal: 2 },
      { startOrdinal: 2, endOrdinal: 4 },
    ],
  );
});

test("never merges across headings, pages, or layout columns", () => {
  const blocks = [
    line(0, "First paragraph line.", [50, 20, 280, 30]),
    line(1, "2 Method", [50, 40, 280, 55], { fontSize: 14, fontWeight: 700 }),
    line(2, "Method paragraph.", [50, 65, 280, 75]),
    line(3, "Right column paragraph.", [320, 20, 550, 30], { layoutColumn: 1 }),
    line(4, "Next page paragraph.", [50, 20, 280, 30], { pageIndex: 1 }),
  ];
  const headings = [{ blockOrdinal: 1, title: "2 Method" }];

  const paragraphs = buildParagraphs(blocks, headings);

  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.text),
    [
      "First paragraph line.",
      "Method paragraph.",
      "Right column paragraph.",
      "Next page paragraph.",
    ],
  );
});

test("recognizes common academic run-in headings without layout cues", () => {
  const blocks = [
    line(0, "The direct approach has limitations.", [50, 20, 280, 30]),
    line(1, "Challenge II: How should context be selected?", [50, 32, 280, 42]),
    line(2, "We address this issue with an index.", [50, 44, 280, 54]),
    line(3, "Case 3: A multi-column document.", [50, 56, 280, 66]),
    line(4, "The same rules apply to this case.", [50, 68, 280, 78]),
  ];

  assert.deepEqual(
    buildParagraphs(blocks, []).map((paragraph) => paragraph.text),
    [
      "The direct approach has limitations.",
      "Challenge II: How should context be selected? We address this issue with an index.",
      "Case 3: A multi-column document. The same rules apply to this case.",
    ],
  );
});

test("bounds a context paragraph even when a PDF template has no paragraph cues", () => {
  const blocks = Array.from({ length: 40 }, (_, index) =>
    line(index, `Sentence ${index} contains enough text for a realistic wrapped academic line.`, [
      50,
      20 + index * 12,
      280,
      30 + index * 12,
    ]),
  );

  const paragraphs = buildParagraphs(blocks, []);

  assert.ok(paragraphs.length > 1);
  assert.ok(paragraphs.every((paragraph) => paragraph.text.length <= 1700));
});
