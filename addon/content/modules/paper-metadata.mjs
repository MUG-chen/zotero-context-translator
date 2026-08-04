const SECTION_HEADING = /^(?:(?:\d+\.)*\d+|[IVXLCDM]+)[.)]?\s+\S/i;

export function inferPaperMetadata(blocks, existing = {}) {
  const metadata = {
    ...existing,
    title: String(existing.title ?? "").trim(),
    abstract: String(existing.abstract ?? "").trim(),
  };
  if (!metadata.title || /\.pdf$/i.test(metadata.title)) {
    metadata.title = inferTitle(blocks) || metadata.title.replace(/\.pdf$/i, "");
  }
  if (!metadata.abstract) metadata.abstract = inferAbstract(blocks);
  return metadata;
}

function inferTitle(blocks) {
  if (!blocks.length) return "";
  const firstPage = Math.min(...blocks.map((block) => block.pageIndex ?? 0));
  const pageBlocks = blocks.filter((block) => block.pageIndex === firstPage);
  const maxFont = Math.max(...pageBlocks.map((block) => Number(block.fontSize) || 0));
  if (!maxFont) return "";
  const candidates = pageBlocks
    .filter(
      (block) =>
        (Number(block.fontSize) || 0) >= maxFont * 0.88 &&
        String(block.text ?? "").trim().length >= 4,
    )
    .sort((a, b) => a.rect?.[1] - b.rect?.[1] || a.rect?.[0] - b.rect?.[0])
    .slice(0, 4)
    .map((block) => String(block.text).trim());
  return candidates.join(" ").replace(/\s+/g, " ").slice(0, 500).trim();
}

function inferAbstract(blocks) {
  const start = blocks.findIndex(
    (block) => /^abstract(?:\b|[—–:-])/i.test(String(block.text ?? "").trim()),
  );
  if (start < 0) return "";
  const parts = [];
  let length = 0;
  const inline = String(blocks[start].text ?? "")
    .trim()
    .replace(/^abstract\b\s*[.:—–-]?\s*/i, "")
    .trim();
  if (inline) {
    parts.push(inline);
    length += inline.length;
  }
  for (let index = start + 1; index < blocks.length; index += 1) {
    const text = String(blocks[index].text ?? "").trim();
    if (!text) continue;
    if (SECTION_HEADING.test(text) || /^(keywords?|index terms)\b/i.test(text)) break;
    if (length + text.length > 5000) break;
    parts.push(text);
    length += text.length;
  }
  return parts
    .join(" ")
    .replace(/-\s+(?=[a-z])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
