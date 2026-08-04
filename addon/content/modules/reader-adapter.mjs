const EVENT_TYPE = "renderTextSelectionPopup";

export class PdfTextAccessUnavailable extends Error {
  constructor(message = "无法访问 PDF 文本层；扫描版 PDF 暂不受支持") {
    super(message);
    this.name = "PdfTextAccessUnavailable";
  }
}

export class ReaderAdapter {
  constructor({
    readerAPI,
    pluginID,
    resolvePdfDocument,
    resolvePdfWindow,
    waiveXrays,
    cloneInto,
  } = {}) {
    this.readerAPI = readerAPI;
    this.pluginID = pluginID;
    this.resolvePdfDocument = resolvePdfDocument;
    this.resolvePdfWindow = resolvePdfWindow;
    this.waiveXrays = waiveXrays ?? ((value) => globalThis.Cu?.waiveXrays?.(value) ?? value);
    this.cloneInto = cloneInto ?? ((value, target) => globalThis.Cu?.cloneInto?.(value, target) ?? value);
    this.handler = null;
  }

  register(handler) {
    if (this.handler) return;
    if (typeof this.readerAPI?.registerEventListener !== "function") {
      throw new Error("Zotero Reader event API is unavailable");
    }
    this.handler = handler;
    this.readerAPI.registerEventListener(EVENT_TYPE, handler, this.pluginID);
  }

  unregister() {
    if (!this.handler) return;
    const unregister = this.readerAPI?.unregisterEventListener;
    const hasZotero906FilterBug =
      typeof unregister === "function" &&
      /x\.type\s*===\s*type\s*&&\s*x\.handler\s*===\s*handler/.test(
        Function.prototype.toString.call(unregister),
      );
    if (
      hasZotero906FilterBug &&
      typeof this.readerAPI?._unregisterEventListenerByPluginID === "function"
    ) {
      // Zotero 9.0.6's public method keeps the matching listener and removes
      // unrelated listeners. Its plugin-scoped lifecycle helper is safe here.
      this.readerAPI._unregisterEventListenerByPluginID(this.pluginID);
    } else {
      unregister?.call(this.readerAPI, EVENT_TYPE, this.handler);
    }
    this.handler = null;
  }

  extractSelection(event) {
    const annotation = event?.params?.annotation ?? {};
    const text = typeof annotation.text === "string" ? annotation.text.trim() : "";
    if (!text) return invalid("EMPTY_TEXT");

    const position = parsePosition(annotation.position);
    if (!position) return invalid("INVALID_POSITION");
    const rectCount = Math.max(0, Number(position.rects?.length) || 0);
    if (!rectCount) {
      return invalid("MISSING_RECTS");
    }
    const rects = [];
    for (let index = 0; index < rectCount; index += 1) {
      const rect = normalizeRect(position.rects[index]);
      if (rect) rects.push(rect);
    }
    if (!rects.length) return invalid("MISSING_RECTS");
    const attachmentID = event?.reader?.itemID;
    if (attachmentID === null || attachmentID === undefined) {
      return invalid("MISSING_ATTACHMENT");
    }

    const selection = {
      ok: true,
      attachmentID,
      text,
      pageIndex: Number(position.pageIndex) || 0,
      rects,
      doc: event.doc,
      reader: event.reader,
    };
    if (typeof event.append === "function") selection.append = event.append;
    return selection;
  }

  async extractDocumentBlocks(reader) {
    const pdfDocument = await this.#getPdfDocument(reader);
    if (
      !pdfDocument ||
      typeof pdfDocument.getPage !== "function" ||
      !Number.isInteger(pdfDocument.numPages)
    ) {
      throw new PdfTextAccessUnavailable();
    }

    const blocks = [];
    const pdfWindow = this.resolvePdfWindow
      ? this.resolvePdfWindow(reader)
      : reader?._internalReader?._primaryView?._iframeWindow;
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = this.waiveXrays(
        await pdfOperation(pageNumber, "get-page", () =>
          pdfDocument.getPage(pageNumber),
        ),
      );
      if (typeof page?.getTextContent !== "function") {
        throw new PdfTextAccessUnavailable();
      }
      const content = this.waiveXrays(
        await pdfOperation(pageNumber, "get-text", () => page.getTextContent()),
      );
      const viewportOptions = pdfWindow
        ? await pdfOperation(pageNumber, "clone-viewport-options", () =>
            this.cloneInto({ scale: 1 }, pdfWindow),
          )
        : { scale: 1 };
      const viewport = this.waiveXrays(
        await pdfOperation(pageNumber, "get-viewport", () =>
          page.getViewport?.(viewportOptions),
        ),
      );
      const viewportTransform = this.waiveXrays(viewport?.transform);
      const textItems = copyTextItems(
        this.waiveXrays(content?.items),
        this.waiveXrays,
      );
      const pageBlocks = await pdfOperation(pageNumber, "build-blocks", () =>
        textItemsToBlocks(
          textItems,
          pageNumber - 1,
          normalizeTransform(viewportTransform),
        ),
      );
      blocks.push(...pageBlocks);
    }
    if (!blocks.length) throw new PdfTextAccessUnavailable();
    return blocks;
  }

  async #getPdfDocument(reader) {
    if (this.resolvePdfDocument) {
      return this.waiveXrays(await this.resolvePdfDocument(reader));
    }
    // This is the single Zotero 9.0.6 path verified against the installed
    // application source. If it changes, fail explicitly instead of probing.
    return this.waiveXrays(
      reader?._internalReader?._primaryView?._iframeWindow
        ?.PDFViewerApplication?.pdfDocument,
    );
  }
}

function copyTextItems(items, waiveXrays) {
  const copied = [];
  const length = Math.max(0, Number(items?.length) || 0);
  for (let index = 0; index < length; index += 1) {
    const item = waiveXrays(items[index]);
    const transform = normalizeTransform(waiveXrays(item?.transform));
    copied.push({
      str: typeof item?.str === "string" ? item.str : "",
      transform: transform ?? [],
      width: Number(item?.width) || 0,
      height: Number(item?.height) || 0,
    });
  }
  return copied;
}

async function pdfOperation(pageNumber, operation, action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(
      `PDF page ${pageNumber} ${operation} failed: ${String(error?.message ?? error)}`,
      { cause: error },
    );
  }
}

function parsePosition(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRect(rect) {
  if (!rect || Number(rect.length) < 4) return null;
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    const value = Number(rect[index]);
    if (!Number.isFinite(value)) return null;
    values.push(value);
  }
  return values;
}

function invalid(reason) {
  return { ok: false, reason };
}

function textItemsToBlocks(items, pageIndex, viewportTransform) {
  const positioned = items
    .filter((item) => typeof item?.str === "string" && item.str.trim())
    .map((item) => itemToPositionedText(item, viewportTransform));
  const lines = [];
  for (const item of positioned.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0])) {
    const centerY = (item.rect[1] + item.rect[3]) / 2;
    let line = lines.find((candidate) => Math.abs(candidate.centerY - centerY) <= 2.5);
    if (!line) {
      line = { centerY, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  const gutters = detectVerticalGutters(lines, positioned);

  const blocks = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    line.items.sort((a, b) => a.rect[0] - b.rect[0]);
    const segments = splitLineItems(line.items, gutters);
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const rect = unionRects(segment.map((item) => item.rect));
      const crossesGutter = gutters.some(
        (gutter) => rect[0] < gutter && gutter < rect[2],
      );
      blocks.push({
        id: `p${pageIndex}-l${lineIndex}-s${segmentIndex}`,
        pageIndex,
        text: joinLine(segment),
        rect,
        pdfRect: unionRects(segment.map((item) => item.pdfRect)),
        fontSize: Math.max(...segment.map((item) => item.fontSize)),
        spansColumns: crossesGutter,
        layoutColumn:
          gutters.length && !crossesGutter
            ? gutters.filter((gutter) => gutter < (rect[0] + rect[2]) / 2).length
            : null,
      });
    }
  }
  return blocks;
}

function splitLineItems(items, gutters) {
  const segments = [];
  let current = [];
  for (const item of items) {
    const previous = current.at(-1);
    const gap = previous ? item.rect[0] - previous.rect[2] : 0;
    const crossesGutter = gutters.some(
      (gutter) => previous?.rect[2] <= gutter && gutter <= item.rect[0],
    );
    const obviousGap = Math.max(
      48,
      Math.max(previous?.fontSize ?? 0, item.fontSize) * 5,
    );
    if (current.length && (crossesGutter || gap > obviousGap)) {
      segments.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) segments.push(current);
  return segments;
}

function detectVerticalGutters(lines, items) {
  if (lines.length < 3 || items.length < 6) return [];
  const left = Math.min(...items.map((item) => item.rect[0]));
  const right = Math.max(...items.map((item) => item.rect[2]));
  const pageWidth = right - left;
  if (!(pageWidth > 0)) return [];
  const fontSizes = items
    .map((item) => Number(item.fontSize) || 0)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const medianFont = fontSizes[Math.floor(fontSizes.length / 2)] || 10;
  const boundaries = [...new Set(
    items.flatMap((item) => [item.rect[0], item.rect[2]]).map((value) => Number(value.toFixed(3))),
  )].sort((a, b) => a - b);
  const minimumSupport = Math.max(3, Math.ceil(lines.length * 0.18));
  const minimumWidth = Math.max(10, medianFont * 1.25);
  const centralLeft = left + pageWidth * 0.08;
  const centralRight = right - pageWidth * 0.08;
  const candidates = [];

  for (let index = 1; index < boundaries.length; index += 1) {
    const start = Math.max(boundaries[index - 1], centralLeft);
    const end = Math.min(boundaries[index], centralRight);
    if (end <= start) continue;
    const midpoint = (start + end) / 2;
    let support = 0;
    for (const line of lines) {
      let hasLeft = false;
      let hasRight = false;
      let crosses = false;
      for (const item of line.items) {
        if (item.rect[2] <= midpoint) hasLeft = true;
        else if (item.rect[0] >= midpoint) hasRight = true;
        else crosses = true;
      }
      if (!crosses && hasLeft && hasRight) support += 1;
    }
    if (support >= minimumSupport) candidates.push({ start, end });
  }

  const merged = [];
  for (const candidate of candidates) {
    const previous = merged.at(-1);
    if (previous && candidate.start <= previous.end + 0.01) {
      previous.end = Math.max(previous.end, candidate.end);
    } else {
      merged.push({ ...candidate });
    }
  }
  return merged
    .filter((candidate) => candidate.end - candidate.start >= minimumWidth)
    .map((candidate) => (candidate.start + candidate.end) / 2);
}

function itemToPositionedText(item, viewportTransform) {
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = Number(transform[4]) || 0;
  const y = Number(transform[5]) || 0;
  const width = Math.abs(Number(item.width) || 0);
  const fontSize = Math.abs(Number(item.height) || Number(transform[3]) || 1);
  const pdfRect = [x, y, x + width, y + fontSize];
  const rect = viewportTransform
    ? transformRectangle(pdfRect, viewportTransform)
    : pdfRect;
  return {
    text: item.str.trim(),
    pdfRect,
    rect: [
      Math.min(rect[0], rect[2]),
      Math.min(rect[1], rect[3]),
      Math.max(rect[0], rect[2]),
      Math.max(rect[1], rect[3]),
    ],
    fontSize,
  };
}

function normalizeTransform(value) {
  if (!value || typeof value.length !== "number" || value.length < 6) return null;
  const transform = [];
  for (let index = 0; index < 6; index += 1) {
    const number = Number(value[index]);
    if (!Number.isFinite(number)) return null;
    transform.push(number);
  }
  return transform;
}

function transformRectangle(rect, [a, b, c, d, e, f]) {
  const transformPoint = (x, y) => [a * x + c * y + e, b * x + d * y + f];
  const first = transformPoint(rect[0], rect[1]);
  const second = transformPoint(rect[2], rect[3]);
  return [first[0], first[1], second[0], second[1]];
}

function joinLine(items) {
  let text = "";
  let previous = null;
  for (const item of items) {
    const gap = previous ? item.rect[0] - previous.rect[2] : 0;
    if (text && gap > Math.max(1, item.fontSize * 0.08)) text += " ";
    text += item.text;
    previous = item;
  }
  return text;
}

function unionRects(rects) {
  return [
    Math.min(...rects.map((rect) => rect[0])),
    Math.min(...rects.map((rect) => rect[1])),
    Math.max(...rects.map((rect) => rect[2])),
    Math.max(...rects.map((rect) => rect[3])),
  ];
}
