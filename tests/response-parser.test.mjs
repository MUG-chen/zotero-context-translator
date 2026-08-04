import test from "node:test";
import assert from "node:assert/strict";
import { parseModelEnvelope } from "../addon/content/modules/response-parser.mjs";

test("parses translation, explanation, terms, and paper profile", () => {
  const parsed = parseModelEnvelope(`<<<TRANSLATION>>>
准确译文
<<<EXPLANATION>>>
这里说明指代关系。
<<<TERMS_JSON>>>
[{"source":"alignment","translation":"对齐"}]
<<<PAPER_PROFILE_JSON>>>
{"field":"computer vision","goal":"context-aware translation"}`);

  assert.equal(parsed.translation, "准确译文");
  assert.equal(parsed.explanation, "这里说明指代关系。");
  assert.deepEqual(parsed.terms, [
    { source: "alignment", translation: "对齐" },
  ]);
  assert.equal(parsed.paperProfile.field, "computer vision");
  assert.deepEqual(parsed.warnings, []);
});

test("keeps translation when metadata JSON is malformed", () => {
  const parsed = parseModelEnvelope(
    "<<<TRANSLATION>>>\n准确译文\n<<<TERMS_JSON>>>\n{bad",
  );

  assert.equal(parsed.translation, "准确译文");
  assert.deepEqual(parsed.terms, []);
  assert.equal(parsed.paperProfile, null);
  assert.match(parsed.warnings.join(" "), /TERMS_JSON/);
});

test("treats an unmarked response as visible translation without cache data", () => {
  const parsed = parseModelEnvelope("普通但可显示的译文");

  assert.equal(parsed.translation, "普通但可显示的译文");
  assert.deepEqual(parsed.terms, []);
  assert.match(parsed.warnings.join(" "), /markers/i);
});
