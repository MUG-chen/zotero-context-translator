import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectHeadings } from "../addon/content/modules/heading-detector.mjs";
import {
  buildSectionIndex,
  locateSection,
  mapSelectionToOrdinal,
} from "../addon/content/modules/section-index.mjs";

const { blocks } = JSON.parse(
  await readFile(new URL("./fixtures/section-blocks.json", import.meta.url)),
);

test("builds nested half-open section ranges", () => {
  const sections = buildSectionIndex(blocks, detectHeadings(blocks, []));

  assert.equal(
    locateSection(sections, 12).titlePath.join(" → "),
    "3 Method → 3.2 Context Encoder",
  );
  assert.equal(
    locateSection(sections, 20).titlePath.join(" → "),
    "4 Experiments",
  );
  assert.equal(locateSection(sections, 9), null);
});

test("maps a selection to the block with greatest overlap", () => {
  const ordinal = mapSelectionToOrdinal(
    [[55, 136, 270, 158]],
    blocks.filter((block) => block.pageIndex === 2),
  );

  assert.equal(ordinal, 13);
});

test("returns null when the selection overlaps no indexed text block", () => {
  assert.equal(
    mapSelectionToOrdinal(
      [[600, 600, 620, 620]],
      blocks.filter((block) => block.pageIndex === 2),
    ),
    null,
  );
});

test("maps Zotero PDF-coordinate selections using cached PDF rectangles", () => {
  const ordinal = mapSelectionToOrdinal(
    [[20, 700, 120, 714]],
    [{ documentOrdinal: 4, rect: [20, 86, 120, 100], pdfRect: [20, 700, 120, 714] }],
  );

  assert.equal(ordinal, 4);
});
