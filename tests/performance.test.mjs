import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { resolveContext } from "../addon/content/modules/context-resolver.mjs";
import { detectHeadings } from "../addon/content/modules/heading-detector.mjs";
import { assignDocumentOrdinals } from "../addon/content/modules/reading-order.mjs";
import {
  buildSectionIndex,
  locateSection,
} from "../addon/content/modules/section-index.mjs";

function makeDocument(pageCount, linesPerPage = 28) {
  const blocks = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    blocks.push({
      id: `p${pageIndex}-heading`,
      pageIndex,
      text: `${pageIndex + 1} Synthetic Section`,
      rect: [40, 30, 555, 50],
      fontSize: 15,
      fontWeight: 700,
    });
    for (let line = 0; line < linesPerPage; line += 1) {
      const column = line % 2;
      const row = Math.floor(line / 2);
      const left = column ? 315 : 40;
      blocks.push({
        id: `p${pageIndex}-line${line}`,
        pageIndex,
        text: `Academic body text on page ${pageIndex + 1}, line ${line + 1}.`,
        rect: [left, 70 + row * 18, left + 220, 82 + row * 18],
        fontSize: 10,
        fontWeight: 400,
      });
    }
  }
  return blocks;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

test("indexes synthetic 30-page and 100-page two-column papers within budget", (t) => {
  for (const [pages, limitMs] of [[30, 5000], [100, 15000]]) {
    const started = performance.now();
    const ordered = assignDocumentOrdinals(makeDocument(pages));
    const sections = buildSectionIndex(ordered, detectHeadings(ordered, []));
    const elapsed = performance.now() - started;
    t.diagnostic(`${pages}-page synthetic index: ${elapsed.toFixed(3)} ms`);
    assert.ok(sections.length >= pages);
    assert.ok(elapsed <= limitMs, `${pages}-page index took ${elapsed.toFixed(2)} ms`);
  }
});

test("cached section lookup P95 meets the release threshold", (t) => {
  const ordered = assignDocumentOrdinals(makeDocument(100));
  const sections = buildSectionIndex(ordered, detectHeadings(ordered, []));
  const timings = [];
  for (let index = 0; index < 2000; index += 1) {
    const started = performance.now();
    locateSection(sections, index % ordered.length);
    timings.push(performance.now() - started);
  }
  const p95 = percentile(timings, 0.95);
  t.diagnostic(`cached section lookup P95: ${p95.toFixed(4)} ms`);
  assert.ok(p95 <= 20, `lookup P95 was ${p95.toFixed(4)} ms`);
});

test("context construction P95 meets the release threshold", (t) => {
  const input = {
    selection: "S".repeat(500),
    currentParagraph: "C".repeat(2500),
    nearParagraphs: Array.from({ length: 12 }, () => "N".repeat(900)),
    distantChunks: Array.from({ length: 20 }, () => "D".repeat(1200)),
    metadata: { title: "Paper", abstract: "A".repeat(2000) },
    sectionPath: ["3 Method", "3.2 Context Encoder"],
    confirmedTerms: [{ source: "alignment", translation: "对齐" }],
  };
  const timings = [];
  for (let index = 0; index < 500; index += 1) {
    const started = performance.now();
    resolveContext(input);
    timings.push(performance.now() - started);
  }
  const p95 = percentile(timings, 0.95);
  t.diagnostic(`context construction P95: ${p95.toFixed(4)} ms`);
  assert.ok(p95 <= 50, `context P95 was ${p95.toFixed(4)} ms`);
});
