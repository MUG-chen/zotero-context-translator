import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { detectHeadings } from "../addon/content/modules/heading-detector.mjs";

const { blocks } = JSON.parse(
  await readFile(new URL("./fixtures/section-blocks.json", import.meta.url)),
);

test("detects numbered academic headings and their hierarchy", () => {
  const headings = detectHeadings(blocks, []);

  assert.deepEqual(
    headings.map(({ title, level, blockOrdinal }) => ({
      title,
      level,
      blockOrdinal,
    })),
    [
      { title: "3 Method", level: 1, blockOrdinal: 10 },
      { title: "3.2 Context Encoder", level: 2, blockOrdinal: 12 },
      { title: "4 Experiments", level: 1, blockOrdinal: 20 },
    ],
  );
  assert.ok(headings.every((heading) => heading.confidence >= 0.65));
});

test("does not classify ordinary body sentences as headings", () => {
  const headings = detectHeadings(blocks, []);

  assert.equal(headings.some((heading) => heading.title.startsWith("The encoder")), false);
});
