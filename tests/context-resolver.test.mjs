import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveContext,
  SelectionTooLongError,
} from "../addon/content/modules/context-resolver.mjs";

test("never truncates selected text and removes distant context first", () => {
  const selection = "S".repeat(8000);
  const result = resolveContext(
    {
      selection,
      currentParagraph: "C".repeat(2000),
      nearParagraphs: ["N".repeat(2000)],
      distantChunks: ["D".repeat(10000)],
      metadata: { title: "Paper", abstract: "A".repeat(1000) },
      sectionPath: ["3 Method"],
      confirmedTerms: [],
      paperProfile: null,
    },
    { budgetChars: 16000 },
  );

  assert.equal(result.selection, selection);
  assert.deepEqual(result.distantChunks, []);
  assert.ok(result.totalChars <= 16000);
});

test("rejects an oversized selection instead of silently truncating it", () => {
  assert.throws(
    () => resolveContext({ selection: "x".repeat(8001) }),
    SelectionTooLongError,
  );
});
