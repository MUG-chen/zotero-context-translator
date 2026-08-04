import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assignDocumentOrdinals } from "../addon/content/modules/reading-order.mjs";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/two-column-page.json", import.meta.url)),
);

test("orders a spanning heading, left column, then right column", () => {
  const ordered = assignDocumentOrdinals(fixture.blocks);

  assert.deepEqual(
    ordered.map((block) => block.id),
    ["heading", "left-1", "left-2", "right-1", "right-2"],
  );
  assert.deepEqual(
    ordered.map((block) => block.documentOrdinal),
    [0, 1, 2, 3, 4],
  );
  assert.equal(ordered[0].spansColumns, true);
});

test("keeps pages in numeric order before assigning global ordinals", () => {
  const ordered = assignDocumentOrdinals([
    { id: "page-2", pageIndex: 2, rect: [0, 0, 100, 20], text: "later" },
    { id: "page-0", pageIndex: 0, rect: [0, 0, 100, 20], text: "first" },
  ]);

  assert.deepEqual(ordered.map((block) => block.id), ["page-0", "page-2"]);
});

test("uses adaptive layout column hints for three-column pages", () => {
  const blocks = [
    { id: "c2-top", pageIndex: 0, text: "C2 top", rect: [220, 10, 300, 20], layoutColumn: 2, spansColumns: false },
    { id: "c0-bottom", pageIndex: 0, text: "C0 bottom", rect: [0, 40, 80, 50], layoutColumn: 0, spansColumns: false },
    { id: "c1-top", pageIndex: 0, text: "C1 top", rect: [110, 10, 190, 20], layoutColumn: 1, spansColumns: false },
    { id: "c0-top", pageIndex: 0, text: "C0 top", rect: [0, 10, 80, 20], layoutColumn: 0, spansColumns: false },
  ];

  assert.deepEqual(
    assignDocumentOrdinals(blocks).map((block) => block.id),
    ["c0-top", "c0-bottom", "c1-top", "c2-top"],
  );
});
