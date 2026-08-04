export function assignDocumentOrdinals(blocks) {
  if (!Array.isArray(blocks)) throw new TypeError("blocks must be an array");
  const pages = new Map();
  for (const block of blocks) {
    if (!pages.has(block.pageIndex)) pages.set(block.pageIndex, []);
    pages.get(block.pageIndex).push({ ...block });
  }

  const ordered = [];
  for (const pageIndex of [...pages.keys()].sort((a, b) => a - b)) {
    ordered.push(...orderPage(pages.get(pageIndex)));
  }

  return ordered.map((block, documentOrdinal) => ({
    ...block,
    documentOrdinal,
  }));
}

function orderPage(blocks) {
  if (blocks.length < 2) {
    return blocks.map((block) => ({ ...block, spansColumns: false }));
  }

  const left = Math.min(...blocks.map((block) => block.rect[0]));
  const right = Math.max(...blocks.map((block) => block.rect[2]));
  const pageWidth = Math.max(1, right - left);
  const isSpanning = (block) =>
    block.spansColumns === true ||
    block.rect[2] - block.rect[0] >= pageWidth * 0.72;
  const spanning = blocks
    .filter(isSpanning)
    .map((block) => ({ ...block, spansColumns: true }))
    .sort(byTopThenLeft);
  let remaining = blocks
    .filter((block) => !isSpanning(block))
    .map((block) => ({ ...block, spansColumns: false }));

  const result = [];
  for (const span of spanning) {
    const before = remaining.filter((block) => block.rect[1] < span.rect[1]);
    remaining = remaining.filter((block) => block.rect[1] >= span.rect[1]);
    result.push(...orderRegion(before, pageWidth), span);
  }
  result.push(...orderRegion(remaining, pageWidth));
  return result;
}

function orderRegion(blocks, pageWidth) {
  if (blocks.length < 2) return [...blocks].sort(byTopThenLeft);
  const hintedColumns = [...new Set(
    blocks
      .map((block) => block.layoutColumn)
      .filter((column) => Number.isInteger(column)),
  )].sort((a, b) => a - b);
  if (hintedColumns.length > 1) {
    return hintedColumns.flatMap((column) =>
      blocks
        .filter((block) => block.layoutColumn === column)
        .sort(byTopThenLeft),
    );
  }
  const byCenter = [...blocks].sort((a, b) => centerX(a) - centerX(b));
  let largestGap = 0;
  let splitIndex = -1;
  for (let index = 1; index < byCenter.length; index += 1) {
    const gap = centerX(byCenter[index]) - centerX(byCenter[index - 1]);
    if (gap > largestGap) {
      largestGap = gap;
      splitIndex = index;
    }
  }

  if (largestGap < pageWidth * 0.18 || splitIndex < 1) {
    return byCenter.sort(byTopThenLeft);
  }
  const leftColumn = byCenter.slice(0, splitIndex).sort(byTopThenLeft);
  const rightColumn = byCenter.slice(splitIndex).sort(byTopThenLeft);
  return [...leftColumn, ...rightColumn];
}

function centerX(block) {
  return (block.rect[0] + block.rect[2]) / 2;
}

function byTopThenLeft(a, b) {
  return a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0];
}
