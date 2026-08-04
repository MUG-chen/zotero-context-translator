const NUMBERED_HEADING = /^\s*((?:\d+\.)*\d+|[IVXLCDM]+)[.)]?\s+(.+)/i;
const KNOWN_HEADING = /^(abstract|introduction|background|related work|method(?:s|ology)?|approach|experiments?|results?|discussion|conclusions?|references)$/i;

export function detectHeadings(blocks, bookmarks = []) {
  if (!Array.isArray(blocks)) throw new TypeError("blocks must be an array");
  const bodyFontSize = median(
    blocks.map((block) => Number(block.fontSize) || 0).filter(Boolean),
  );
  const candidates = [];

  for (const block of blocks) {
    const text = String(block.text ?? "").trim();
    if (!text || text.length > 160) continue;
    const bookmark = bookmarks.find(
      (item) =>
        item.blockOrdinal === block.documentOrdinal ||
        (item.pageIndex === block.pageIndex && normalize(item.title) === normalize(text)),
    );
    const numbered = NUMBERED_HEADING.exec(text);
    const known = KNOWN_HEADING.test(text.replace(/^\d+(?:\.\d+)*[.)]?\s+/, ""));
    let confidence = bookmark ? 1 : 0;
    if (numbered) confidence += 0.4;
    if (known) confidence += 0.35;
    if ((Number(block.fontSize) || 0) >= bodyFontSize * 1.15) confidence += 0.2;
    if ((Number(block.fontWeight) || 400) >= 600) confidence += 0.15;
    if (text.length <= 80) confidence += 0.1;
    if (block.spansColumns) confidence += 0.1;
    if (/[.!?。！？]$/.test(text)) confidence -= 0.3;
    confidence = Math.max(0, Math.min(1, confidence));

    if (!bookmark && confidence < 0.65) continue;
    candidates.push({
      title: text,
      level: bookmark?.level ?? inferLevel(numbered?.[1]),
      blockOrdinal: block.documentOrdinal,
      pageIndex: block.pageIndex,
      confidence,
      source: bookmark ? "bookmark" : numbered ? "layout" : "dictionary",
    });
  }

  return candidates.sort((a, b) => a.blockOrdinal - b.blockOrdinal);
}

function inferLevel(numbering) {
  if (!numbering || /^[IVXLCDM]+$/i.test(numbering)) return 1;
  return numbering.split(".").length;
}

function median(values) {
  if (!values.length) return 10;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
