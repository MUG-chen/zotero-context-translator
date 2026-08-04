export function buildParagraphs(blocks, headings = []) {
  if (!Array.isArray(blocks)) throw new TypeError("blocks must be an array");
  const headingOrdinals = new Set(
    headings.map((heading) => heading.blockOrdinal).filter(Number.isInteger),
  );
  const paragraphs = [];
  let lines = [];

  const flush = () => {
    if (!lines.length) return;
    paragraphs.push(toParagraph(lines, paragraphs.length));
    lines = [];
  };

  for (const block of blocks) {
    if (!String(block.text ?? "").trim()) continue;
    if (headingOrdinals.has(block.documentOrdinal)) {
      flush();
      continue;
    }
    if (
      lines.length &&
      (startsNewParagraph(lines, block) ||
        isAcademicRunInHeading(block.text) ||
        projectedLength(lines, block) > 1500)
    ) {
      flush();
    }
    lines.push(block);
  }
  flush();
  return paragraphs;
}

function isAcademicRunInHeading(text) {
  const value = String(text ?? "").trim();
  return (
    /^(?:challenge|case|step|phase|observation|finding|limitation|threat|research question|rq)\s+(?:[IVXLCDM]+|\d+(?:\.\d+)*|[A-Z])\s*[:.\u2014-]/i.test(
      value,
    ) ||
    /^(?:result|method|implementation|evaluation|experimental)\s+overview\s*[.:]/i.test(
      value,
    )
  );
}

function projectedLength(lines, next) {
  return (
    lines.reduce((sum, line) => sum + String(line.text ?? "").trim().length + 1, 0) +
    String(next.text ?? "").trim().length
  );
}

function startsNewParagraph(lines, next) {
  const first = lines[0];
  const previous = lines.at(-1);
  if (next.pageIndex !== previous.pageIndex) return true;
  if (columnKey(next) !== columnKey(previous)) return true;
  if (Boolean(next.spansColumns) !== Boolean(previous.spansColumns)) return true;

  const fontSize = Math.max(1, Number(previous.fontSize) || 10);
  const nextFontSize = Math.max(1, Number(next.fontSize) || fontSize);
  if (Math.max(fontSize, nextFontSize) / Math.min(fontSize, nextFontSize) > 1.3) {
    return true;
  }

  const verticalGap = Number(next.rect?.[1]) - Number(previous.rect?.[3]);
  if (Number.isFinite(verticalGap) && verticalGap > fontSize * 0.75) return true;

  if (lines.length >= 2) {
    const bodyLeft = Math.min(...lines.map((line) => Number(line.rect?.[0]) || 0));
    const nextLeft = Number(next.rect?.[0]) || 0;
    const previousLeft = Number(previous.rect?.[0]) || 0;
    const isIndented = nextLeft - bodyLeft >= fontSize * 0.7;
    const previousWasFlush = previousLeft - bodyLeft < fontSize * 0.7;
    if (isIndented && previousWasFlush) return true;
  }

  const firstWidth = Number(first.rect?.[2]) - Number(first.rect?.[0]);
  const nextLeft = Number(next.rect?.[0]);
  if (Number.isFinite(firstWidth) && Number.isFinite(nextLeft)) {
    const farAway = Math.abs(nextLeft - Number(first.rect?.[0])) > Math.max(80, firstWidth * 0.55);
    if (farAway) return true;
  }
  return false;
}

function toParagraph(lines, index) {
  return {
    id: `paragraph-${index}`,
    pageIndex: lines[0].pageIndex,
    layoutColumn: lines[0].layoutColumn ?? null,
    startOrdinal: lines[0].documentOrdinal,
    endOrdinal: lines.at(-1).documentOrdinal + 1,
    text: joinLines(lines.map((line) => String(line.text ?? "").trim())),
    rect: unionRect(lines.map((line) => line.rect)),
  };
}

function joinLines(lines) {
  let value = "";
  for (const line of lines) {
    if (!value) {
      value = line;
    } else if (/[A-Za-z]-$/.test(value) && /^[a-z]/.test(line)) {
      value = `${value.slice(0, -1)}${line}`;
    } else {
      value = `${value} ${line}`;
    }
  }
  return value.replace(/\s+/g, " ").trim();
}

function unionRect(rects) {
  const valid = rects.filter((rect) => Array.isArray(rect) && rect.length >= 4);
  if (!valid.length) return [0, 0, 0, 0];
  return [
    Math.min(...valid.map((rect) => Number(rect[0]) || 0)),
    Math.min(...valid.map((rect) => Number(rect[1]) || 0)),
    Math.max(...valid.map((rect) => Number(rect[2]) || 0)),
    Math.max(...valid.map((rect) => Number(rect[3]) || 0)),
  ];
}

function columnKey(block) {
  if (block.spansColumns) return "spanning";
  return Number.isInteger(block.layoutColumn) ? `column-${block.layoutColumn}` : "unknown";
}
