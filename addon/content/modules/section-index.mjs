export function buildSectionIndex(blocks, headings) {
  if (!headings.length) return [];
  const orderedHeadings = [...headings].sort(
    (a, b) => a.blockOrdinal - b.blockOrdinal,
  );
  const documentEnd =
    Math.max(...blocks.map((block) => block.documentOrdinal ?? -1)) + 1;
  let path = [];

  return orderedHeadings.map((heading, index) => {
    const level = Math.max(1, heading.level || 1);
    path = path.slice(0, level - 1);
    path.push(heading.title);
    return {
      title: heading.title,
      titlePath: [...path],
      level,
      startOrdinal: heading.blockOrdinal,
      endOrdinal: orderedHeadings[index + 1]?.blockOrdinal ?? documentEnd,
      confidence: heading.confidence,
      source: heading.source,
    };
  });
}

export function locateSection(sections, ordinal) {
  let low = 0;
  let high = sections.length - 1;
  let candidate = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (sections[middle].startOrdinal <= ordinal) {
      candidate = sections[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (!candidate || ordinal >= candidate.endOrdinal) return null;
  return candidate;
}

export function mapSelectionToOrdinal(rects, pageBlocks) {
  let bestOrdinal = null;
  let bestOverlap = 0;
  for (const block of pageBlocks) {
    const overlap = rects.reduce(
      (total, rect) => total + intersectionArea(rect, block.pdfRect ?? block.rect),
      0,
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestOrdinal = block.documentOrdinal;
    }
  }
  return bestOverlap > 0 ? bestOrdinal : null;
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return width * height;
}
