const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 300;
const VIEWPORT_MARGIN = 12;
const DRAG_THRESHOLD = 4;
const RESIZE_HANDLE_SIZE = 18;
const TITLEBAR_HEIGHT = 44;
const DETACHED_SIZING = Object.freeze({
  PENDING_RESULT: "pending-result",
  AUTO_FIT: "auto-fit",
  USER_SIZED: "user-sized",
});

export const FLOATING_WINDOW_CSS = String.raw`
.zct-selection-overlay {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: 2147483600;
}

.zct-selection-rect {
  background: color-mix(in srgb, #f5c84c 32%, transparent);
  border-radius: 3px;
  outline: 1px solid color-mix(in srgb, #d49b00 48%, transparent);
  position: fixed;
}

.zct-floating-window {
  --zct-accent: #2f6fdd;
  --zct-accent-hover: #255fbe;
  --zct-accent-soft: #edf4ff;
  --zct-bg: #ffffff;
  --zct-bg-subtle: #f7f9fc;
  --zct-border: #d9e0ea;
  --zct-border-strong: #c7d0dc;
  --zct-text: #172033;
  --zct-text-secondary: #5e6b80;
  --zct-text-tertiary: #7d899a;
  --zct-danger: #b42318;
  --zct-danger-bg: #fff4f2;
  --zct-danger-border: #f4c7c2;
  background: var(--zct-bg);
  border: 1px solid var(--zct-border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgb(26 42 68 / 20%), 0 3px 10px rgb(26 42 68 / 10%);
  box-sizing: border-box;
  color: var(--zct-text);
  display: flex;
  flex-direction: column;
  font: 12px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  max-height: calc(100vh - 24px);
  max-width: calc(100vw - 24px);
  min-width: min(320px, calc(100vw - 24px));
  min-height: min(240px, calc(100vh - 24px));
  overflow: hidden;
  position: fixed;
  resize: both;
  width: min(380px, calc(100vw - 24px));
  z-index: 2147483601;
}

.zct-floating-window--embedded {
  box-shadow: 0 10px 30px rgb(26 42 68 / 14%);
  left: auto;
  max-height: min(520px, calc(100vh - 24px));
  max-width: min(380px, calc(100vw - 24px));
  min-width: 0;
  min-height: 0;
  position: relative;
  resize: none;
  top: auto;
  width: 100%;
}

.zct-floating-window--auto-fit {
  max-height: min(520px, calc(100vh - 24px));
}

.zct-titlebar {
  align-items: center;
  border-bottom: 1px solid var(--zct-border);
  cursor: move;
  display: flex;
  flex: 0 0 auto;
  justify-content: space-between;
  min-height: 44px;
  padding: 6px 8px 6px 12px;
  user-select: none;
}

.zct-brand,
.zct-title-meta,
.zct-section-heading,
.zct-status-row,
.zct-source-heading {
  align-items: center;
  display: flex;
}

.zct-brand { gap: 8px; min-width: 0; }
.zct-title-meta { gap: 6px; }

.zct-brand-mark {
  align-items: center;
  background: linear-gradient(145deg, #e8f1ff, #dceaff);
  border: 1px solid #c6dafb;
  border-radius: 8px;
  color: var(--zct-accent);
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  height: 25px;
  justify-content: center;
  letter-spacing: -0.02em;
  width: 25px;
}

.zct-title { font-size: 13px; font-weight: 680; letter-spacing: 0.01em; }

.zct-state-badge {
  background: var(--zct-bg-subtle);
  border: 1px solid var(--zct-border);
  border-radius: 999px;
  color: var(--zct-text-secondary);
  font-size: 11px;
  line-height: 20px;
  padding: 0 8px;
}

.zct-close,
.zct-copy,
.zct-source-toggle,
.zct-retry,
.zct-translate {
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.zct-close {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 9px;
  color: var(--zct-text-secondary);
  display: inline-flex;
  height: 36px;
  justify-content: center;
  padding: 0;
  width: 36px;
}

.zct-close:hover { background: var(--zct-bg-subtle); color: var(--zct-text); }
.zct-close svg { height: 18px; pointer-events: none; width: 18px; }

.zct-source-card {
  background: var(--zct-bg-subtle);
  border: 1px solid var(--zct-border);
  border-radius: 10px;
  flex: 0 0 auto;
  margin: 10px 12px 7px;
  padding: 7px 9px 8px;
}

.zct-source-heading { justify-content: space-between; margin-bottom: 4px; }
.zct-eyebrow { color: var(--zct-text-tertiary); font-size: 11px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; }

.zct-source-toggle,
.zct-copy {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--zct-accent);
  font-size: 12px;
  min-height: 36px;
  padding: 2px 6px;
}

.zct-source-toggle:hover,
.zct-copy:hover { background: var(--zct-accent-soft); }

.zct-source-preview {
  color: var(--zct-text-secondary);
  display: -webkit-box;
  font-family: ui-serif, Georgia, "Times New Roman", serif;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.zct-source-preview--expanded {
  display: block;
  max-height: 180px;
  overflow: auto;
}

.zct-actions {
  display: flex;
  flex: 0 0 auto;
  margin: 0 12px;
}

.zct-translate {
  background: var(--zct-accent);
  border: 0;
  border-radius: 9px;
  box-shadow: 0 2px 7px rgb(47 111 221 / 24%);
  color: #fff;
  font-weight: 650;
  min-height: 40px;
  padding: 7px 14px;
  width: 100%;
}

.zct-translate:hover:not(:disabled) { background: var(--zct-accent-hover); }
.zct-translate:disabled { cursor: wait; opacity: 0.58; }

.zct-status-row {
  color: var(--zct-text-secondary);
  flex: 0 0 auto;
  gap: 8px;
  min-height: 32px;
  padding: 3px 14px 1px;
}

.zct-status-indicator {
  background: var(--zct-text-tertiary);
  border-radius: 50%;
  flex: 0 0 auto;
  height: 7px;
  width: 7px;
}

.zct-status-indicator[data-state="loading"] {
  animation: zct-pulse 1.2s ease-in-out infinite;
  background: var(--zct-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--zct-accent) 13%, transparent);
}

.zct-status-indicator[data-state="result"] { background: #218739; }
.zct-status-indicator[data-state="error"] { background: var(--zct-danger); }
.zct-status { min-height: 1.3em; }

.zct-content-scroll {
  flex: 1 1 auto;
  min-height: 56px;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px 12px 12px;
  scrollbar-color: var(--zct-border-strong) transparent;
}

.zct-empty {
  color: var(--zct-text-tertiary);
  padding: 8px 2px 10px;
  text-align: center;
}

.zct-result-section { padding: 2px 1px 8px; }
.zct-section-heading { justify-content: space-between; margin-bottom: 5px; }
.zct-section-label { color: var(--zct-text-secondary); font-size: 12px; font-weight: 680; letter-spacing: 0.04em; }

.zct-translation {
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.zct-explanation-section {
  background: var(--zct-bg-subtle);
  border: 1px solid var(--zct-border);
  border-radius: 10px;
  margin-top: 5px;
  padding: 8px 9px 9px;
}

.zct-explanation { color: var(--zct-text-secondary); line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }

.zct-error-card {
  background: var(--zct-danger-bg);
  border: 1px solid var(--zct-danger-border);
  border-radius: 10px;
  margin-bottom: 10px;
  padding: 11px;
}

.zct-error-title { color: var(--zct-danger); font-weight: 680; margin-bottom: 3px; }
.zct-error-detail { color: var(--zct-text-secondary); font-size: 12px; }
.zct-retry {
  background: var(--zct-bg);
  border: 1px solid var(--zct-danger-border);
  border-radius: 7px;
  color: var(--zct-danger);
  margin-top: 9px;
  min-height: 36px;
  padding: 4px 11px;
}

.zct-context-note {
  border-top: 1px solid var(--zct-border);
  color: var(--zct-text-tertiary);
  flex: 0 0 auto;
  font-size: 10.5px;
  padding: 7px 12px 8px;
}

.zct-close:focus-visible,
.zct-translate:focus-visible,
.zct-copy:focus-visible,
.zct-source-toggle:focus-visible,
.zct-retry:focus-visible,
.zct-content-scroll:focus-visible {
  outline: 2px solid var(--zct-accent);
  outline-offset: 2px;
}

@keyframes zct-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.86); }
  50% { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .zct-status-indicator { animation: none !important; }
}

@media (prefers-color-scheme: dark) {
  .zct-floating-window {
    --zct-accent: #78a8ff;
    --zct-accent-hover: #9abfff;
    --zct-accent-soft: #22395e;
    --zct-bg: #20242b;
    --zct-bg-subtle: #292e37;
    --zct-border: #3a424e;
    --zct-border-strong: #515b69;
    --zct-text: #f2f5fa;
    --zct-text-secondary: #c0c8d4;
    --zct-text-tertiary: #949eac;
    --zct-danger: #ff9b91;
    --zct-danger-bg: #402724;
    --zct-danger-border: #74443e;
    box-shadow: 0 20px 50px rgb(0 0 0 / 42%), 0 3px 10px rgb(0 0 0 / 26%);
  }

  .zct-brand-mark { background: #253a5b; border-color: #3e5d8e; }
  .zct-translate { color: #10213d; }
}
`;

export class FloatingView {
  #doc = null;
  #root = null;
  #overlay = null;
  #handlers = {};
  #listeners = [];
  #nodes = null;
  #drag = null;
  #embedded = false;
  #current = {};
  #sourceExpanded = false;
  #copyTimer = null;
  #resizeObserver = null;
  #detachedSizingMode = null;
  #detachedHeight = null;
  #autoFitPeakHeight = null;

  mount({ doc, append, anchorRects = [], handlers = {} }) {
    if (!doc?.createElement || !doc.body) {
      throw new TypeError("A reader document is required");
    }
    this.destroy();
    this.#doc = doc;
    this.#handlers = handlers;
    this.#embedded = typeof append === "function";
    this.#sourceExpanded = false;
    this.#overlay = this.#embedded ? null : createSelectionOverlay(doc, anchorRects);
    this.#root = createDialog(doc, this.#embedded);
    this.#nodes = populateDialog(doc, this.#root);
    if (this.#embedded) {
      append(this.#root);
    } else {
      doc.body.append(this.#overlay, this.#root);
      positionDialog(this.#root, anchorRects, doc.defaultView);
    }
    this.#bindEvents();
    this.#observeResize();
    this.render({ status: "ready", selection: null });
    return this.#root;
  }

  render(state) {
    if (!this.#root || !this.#nodes) return;
    const current = state?.current ?? state ?? {};
    this.#current = current;
    const selectionText = current.selection?.text ?? "";
    this.#nodes.sourceCard.hidden = !selectionText;
    this.#nodes.sourcePreview.textContent = selectionText;
    this.#nodes.sourceToggle.hidden = selectionText.length < 180;
    this.#renderSourceExpansion();

    this.#nodes.translateButton.disabled = current.status === "loading";
    const statusReady = current.status === "ready";
    this.#nodes.statusRow.hidden = statusReady;
    this.#nodes.statusRow.style.display = statusReady ? "none" : "";

    this.#nodes.status.textContent = statusText(current);
    this.#nodes.statusIndicator.setAttribute(
      "data-state",
      String(current.status ?? "ready"),
    );
    this.#nodes.stateBadge.textContent = badgeText(current);

    const translation = String(current.translation ?? "");
    const explanation = String(current.explanation ?? "");
    this.#nodes.translation.textContent = translation;
    this.#nodes.translationSection.hidden = !translation;
    this.#nodes.copyButton.hidden = !translation;
    this.#nodes.explanation.textContent = explanation;
    this.#nodes.explanationSection.hidden = !explanation;

    const isError = current.status === "error";
    const error = errorPresentation(current.error);
    this.#nodes.errorCard.hidden = !isError;
    this.#nodes.errorTitle.textContent = error.title;
    this.#nodes.errorDetail.textContent = error.detail;

    this.#nodes.empty.hidden =
      Boolean(translation || explanation || isError) || current.status === "loading";
    this.#updateDetachedSizing(current);
    this.#repositionAfterContentChange();
  }

  destroy() {
    for (const [target, type, listener] of this.#listeners.splice(0)) {
      target.removeEventListener(type, listener);
    }
    this.#resizeObserver?.disconnect();
    if (this.#copyTimer !== null) clearTimeout(this.#copyTimer);
    this.#root?.remove();
    this.#overlay?.remove();
    this.#root = null;
    this.#overlay = null;
    this.#nodes = null;
    this.#handlers = {};
    this.#drag = null;
    this.#embedded = false;
    this.#current = {};
    this.#sourceExpanded = false;
    this.#copyTimer = null;
    this.#resizeObserver = null;
    this.#detachedSizingMode = null;
    this.#detachedHeight = null;
    this.#autoFitPeakHeight = null;
    this.#doc = null;
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.#listeners.push([target, type, listener]);
  }

  #bindEvents() {
    const {
      closeButton,
      titlebar,
      translateButton,
      sourceToggle,
      copyButton,
      retryButton,
    } = this.#nodes;
    this.#listen(this.#root, "pointerdown", (event) => {
      const usesResizeHandle = this.#markUserSized(event);
      if (!usesResizeHandle) event.preventDefault();
      event.stopPropagation();
    });
    this.#listen(closeButton, "click", () => this.#handlers.close?.());
    this.#listen(translateButton, "click", () => {
      this.#handlers.translate?.("sentence");
    });
    this.#listen(sourceToggle, "click", () => {
      this.#sourceExpanded = !this.#sourceExpanded;
      this.#renderSourceExpansion();
    });
    this.#listen(copyButton, "click", () => this.#copyTranslation());
    this.#listen(retryButton, "click", () => this.#handlers.retry?.());
    this.#listen(this.#doc, "keydown", (event) => {
      if (event.key === "Escape") this.#handlers.close?.();
    });
    const closeWithReader = () => this.#handlers.close?.();
    this.#listen(this.#doc.defaultView, "pagehide", closeWithReader);
    this.#listen(this.#doc.defaultView, "unload", closeWithReader);
    this.#listen(this.#doc.defaultView, "resize", () =>
      this.#repositionWithinViewport(),
    );
    this.#listen(titlebar, "pointerdown", (event) => {
      if (isInteractiveTarget(event.target)) return;
      const rect = this.#root.getBoundingClientRect();
      this.#drag = {
        pointerID: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        grabX: event.clientX - rect.left,
        grabY: event.clientY - rect.top,
        geometry: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        pending: true,
      };
      titlebar.setPointerCapture?.(event.pointerId);
    });
    this.#listen(this.#doc.defaultView, "pointermove", (event) => {
      if (!this.#drag || event.pointerId !== this.#drag.pointerID) return;
      const deltaX = event.clientX - this.#drag.startX;
      const deltaY = event.clientY - this.#drag.startY;
      if (this.#drag.pending) {
        if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
        this.#detachFromHost(this.#drag.geometry);
        this.#drag.pending = false;
      }
      this.#setDraggedPosition(
        event.clientX - this.#drag.grabX,
        event.clientY - this.#drag.grabY,
      );
    });
    this.#listen(this.#doc.defaultView, "pointerup", (event) => {
      if (this.#drag?.pointerID === event.pointerId) this.#drag = null;
    });
    this.#listen(this.#doc.defaultView, "pointercancel", (event) => {
      if (this.#drag?.pointerID === event.pointerId) this.#drag = null;
    });
  }

  #renderSourceExpansion() {
    if (!this.#nodes) return;
    this.#nodes.sourceToggle.setAttribute(
      "aria-expanded",
      String(this.#sourceExpanded),
    );
    this.#nodes.sourceToggle.textContent = this.#sourceExpanded ? "收起" : "展开";
    this.#nodes.sourcePreview.className = this.#sourceExpanded
      ? "zct-source-preview zct-source-preview--expanded"
      : "zct-source-preview";
    this.#repositionAfterContentChange();
  }

  #observeResize() {
    const ResizeObserver = this.#doc?.defaultView?.ResizeObserver;
    if (typeof ResizeObserver !== "function") return;
    this.#resizeObserver = new ResizeObserver(() =>
      this.#handleObservedResize(),
    );
    this.#resizeObserver.observe(this.#root);
  }

  async #copyTranslation() {
    const translation = String(this.#current.translation ?? "");
    if (!translation) return;
    try {
      if (typeof this.#handlers.copy !== "function") {
        throw new Error("Clipboard is unavailable");
      }
      await this.#handlers.copy(translation);
      if (!this.#nodes) return;
      this.#nodes.copyButton.textContent = "已复制";
      if (this.#copyTimer !== null) clearTimeout(this.#copyTimer);
      this.#copyTimer = setTimeout(() => {
        if (this.#nodes) this.#nodes.copyButton.textContent = "复制";
        this.#copyTimer = null;
      }, 1_200);
      this.#copyTimer?.unref?.();
    } catch {
      if (this.#nodes) this.#nodes.copyButton.textContent = "复制失败";
    }
  }

  #repositionWithinViewport() {
    if (this.#embedded || !this.#root || !this.#doc) return;
    const rect = this.#root.getBoundingClientRect();
    if (this.#detachedSizingMode !== null) {
      this.#constrainAutoFitToViewport();
      setReachablePosition(
        this.#root,
        rect.left,
        rect.top,
        this.#doc.defaultView,
      );
      return;
    }
    setClampedPosition(
      this.#root,
      rect.left,
      rect.top,
      this.#doc.defaultView,
    );
  }

  #setDraggedPosition(left, top) {
    const position = this.#detachedSizingMode === null
      ? setClampedPosition
      : setReachablePosition;
    position(this.#root, left, top, this.#doc.defaultView);
  }

  #repositionAfterContentChange() {
    if (this.#detachedSizingMode === null) this.#repositionWithinViewport();
  }

  #handleObservedResize() {
    if (this.#detachedSizingMode !== DETACHED_SIZING.AUTO_FIT) {
      this.#repositionAfterContentChange();
      return;
    }
    const limit = this.#autoFitHeightLimit();
    const observedHeight = Math.min(
      this.#root.getBoundingClientRect().height,
      limit,
    );
    const peakHeight = Math.min(
      Math.max(this.#autoFitPeakHeight ?? 0, observedHeight),
      limit,
    );
    if (peakHeight === this.#autoFitPeakHeight) return;
    this.#autoFitPeakHeight = peakHeight;
    this.#root.style.minHeight = `${peakHeight}px`;
  }

  #autoFitHeightLimit() {
    return Math.max(
      0,
      Math.min(520, (this.#doc?.defaultView?.innerHeight ?? 800) - 24),
    );
  }

  #constrainAutoFitToViewport() {
    if (this.#detachedSizingMode !== DETACHED_SIZING.AUTO_FIT) return;
    const peakHeight = Math.min(
      this.#autoFitPeakHeight ?? this.#detachedHeight ?? 0,
      this.#autoFitHeightLimit(),
    );
    if (peakHeight === this.#autoFitPeakHeight) return;
    this.#autoFitPeakHeight = peakHeight;
    this.#root.style.minHeight = `${peakHeight}px`;
  }

  #updateDetachedSizing(current) {
    if (
      this.#detachedSizingMode !== DETACHED_SIZING.PENDING_RESULT ||
      !this.#root
    ) return;
    const hasVisibleResult = Boolean(
      String(current.translation ?? "") ||
      String(current.explanation ?? "") ||
      current.status === "error",
    );
    if (!hasVisibleResult) return;
    const preservedHeight = `${this.#detachedHeight}px`;
    if (this.#root.style.height !== preservedHeight) {
      this.#detachedSizingMode = DETACHED_SIZING.USER_SIZED;
      return;
    }
    this.#root.style.height = "auto";
    this.#root.style.minHeight = preservedHeight;
    this.#root.className += " zct-floating-window--auto-fit";
    this.#detachedSizingMode = DETACHED_SIZING.AUTO_FIT;
    this.#autoFitPeakHeight = this.#detachedHeight;
  }

  #markUserSized(event) {
    if (this.#detachedSizingMode === null) return false;
    const rect = this.#root.getBoundingClientRect();
    const usesResizeHandle =
      event.clientX >= rect.right - RESIZE_HANDLE_SIZE &&
      event.clientY >= rect.bottom - RESIZE_HANDLE_SIZE;
    if (!usesResizeHandle) return false;
    if (this.#detachedSizingMode === DETACHED_SIZING.USER_SIZED) return true;
    this.#detachedSizingMode = DETACHED_SIZING.USER_SIZED;
    this.#autoFitPeakHeight = null;
    this.#root.style.minHeight = "";
    this.#root.className = this.#root.className
      .split(/\s+/)
      .filter((name) => name && name !== "zct-floating-window--auto-fit")
      .join(" ");
    return true;
  }

  #detachFromHost(geometry = null) {
    if (!this.#embedded || !this.#root) return;
    const rect = geometry ?? this.#root.getBoundingClientRect();
    const view = this.#doc.defaultView;
    const maxWidth = Math.max(0, (view?.innerWidth ?? 1200) - 2 * VIEWPORT_MARGIN);
    const maxHeight = Math.max(0, (view?.innerHeight ?? 800) - 2 * VIEWPORT_MARGIN);
    this.#root.className = this.#root.className
      .split(/\s+/)
      .filter((name) => name && name !== "zct-floating-window--embedded")
      .join(" ");
    this.#doc.body.append(this.#root);
    this.#root.style.width = `${clamp(
      rect.width,
      Math.min(320, maxWidth),
      maxWidth,
    )}px`;
    this.#detachedHeight = clamp(
      rect.height,
      Math.min(240, maxHeight),
      maxHeight,
    );
    this.#root.style.height = `${this.#detachedHeight}px`;
    setClampedPosition(this.#root, rect.left, rect.top, view);
    this.#embedded = false;
    this.#detachedSizingMode = DETACHED_SIZING.PENDING_RESULT;
  }
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    'button, a, input, select, textarea, [contenteditable="true"]',
  ));
}

function createDialog(doc, embedded = false) {
  const root = doc.createElement("section");
  root.className = `zct-floating-window${embedded ? " zct-floating-window--embedded" : ""}`;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "上下文翻译");
  root.setAttribute("tabindex", "-1");
  return root;
}

function populateDialog(doc, root) {
  const titlebar = element(doc, "div", "zct-titlebar");
  const brand = element(doc, "div", "zct-brand");
  const brandMark = element(doc, "span", "zct-brand-mark", "译");
  const title = element(doc, "span", "zct-title", "上下文翻译");
  brand.append(brandMark, title);
  const titleMeta = element(doc, "div", "zct-title-meta");
  const stateBadge = element(doc, "span", "zct-state-badge", "待选择");
  const closeButton = element(doc, "button", "zct-close");
  closeButton.setAttribute("type", "button");
  closeButton.setAttribute("aria-label", "关闭翻译窗口");
  closeButton.append(createCloseIcon(doc));
  titleMeta.append(stateBadge, closeButton);
  titlebar.append(brand, titleMeta);

  const sourceCard = element(doc, "section", "zct-source-card");
  const sourceHeading = element(doc, "div", "zct-source-heading");
  const sourceLabel = element(doc, "span", "zct-eyebrow", "原文");
  const sourceToggle = element(doc, "button", "zct-source-toggle", "展开");
  sourceToggle.setAttribute("type", "button");
  sourceToggle.setAttribute("aria-expanded", "false");
  sourceHeading.append(sourceLabel, sourceToggle);
  const sourcePreview = element(doc, "div", "zct-source-preview");
  sourceCard.append(sourceHeading, sourcePreview);

  const actions = element(doc, "div", "zct-actions");
  const translateButton = element(doc, "button", "zct-translate", "翻译");
  translateButton.setAttribute("type", "button");
  actions.append(translateButton);

  const statusRow = element(doc, "div", "zct-status-row");
  const statusIndicator = element(doc, "span", "zct-status-indicator");
  statusIndicator.setAttribute("aria-hidden", "true");
  const status = element(doc, "div", "zct-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  statusRow.append(statusIndicator, status);

  const contentScroll = element(
    doc,
    "div",
    "zct-result-scroll zct-content-scroll",
  );
  contentScroll.setAttribute("tabindex", "0");
  const empty = element(doc, "div", "zct-empty", "点击翻译开始上下文翻译");

  const errorCard = element(doc, "section", "zct-error-card");
  const errorTitle = element(doc, "div", "zct-error-title");
  const errorDetail = element(doc, "div", "zct-error-detail");
  const retryButton = element(doc, "button", "zct-retry", "重新尝试");
  retryButton.setAttribute("type", "button");
  errorCard.append(errorTitle, errorDetail, retryButton);

  const translationSection = element(
    doc,
    "section",
    "zct-result-section zct-translation-section",
  );
  const translationHeading = element(doc, "div", "zct-section-heading");
  const translationLabel = element(doc, "span", "zct-section-label", "译文");
  const copyButton = element(doc, "button", "zct-copy", "复制");
  copyButton.setAttribute("type", "button");
  translationHeading.append(translationLabel, copyButton);
  const translation = element(doc, "div", "zct-translation");
  translationSection.append(translationHeading, translation);

  const explanationSection = element(
    doc,
    "section",
    "zct-result-section zct-explanation-section",
  );
  const explanationLabel = element(doc, "div", "zct-section-label", "说明");
  const explanation = element(doc, "div", "zct-explanation");
  explanationSection.append(explanationLabel, explanation);
  contentScroll.append(empty, errorCard, translationSection, explanationSection);

  const contextNote = element(
    doc,
    "div",
    "zct-context-note",
    "上下文增强：标题 · 摘要 · 当前章节",
  );
  root.append(titlebar, sourceCard, actions, statusRow, contentScroll, contextNote);
  return {
    titlebar,
    closeButton,
    stateBadge,
    sourceCard,
    sourceToggle,
    sourcePreview,
    translateButton,
    statusRow,
    statusIndicator,
    status,
    contentScroll,
    empty,
    errorCard,
    errorTitle,
    errorDetail,
    retryButton,
    translationSection,
    translation,
    copyButton,
    explanationSection,
    explanation,
    contextNote,
  };
}

function createCloseIcon(doc) {
  const namespace = "http://www.w3.org/2000/svg";
  const create = (name) =>
    typeof doc.createElementNS === "function"
      ? doc.createElementNS(namespace, name)
      : doc.createElement(name);
  const svg = create("svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  const path = create("path");
  path.setAttribute("d", "M5.25 5.25 14.75 14.75M14.75 5.25 5.25 14.75");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

function createSelectionOverlay(doc, rects) {
  const overlay = element(doc, "div", "zct-selection-overlay");
  overlay.setAttribute("aria-hidden", "true");
  for (const value of rects) {
    const rect = normalizeRect(value);
    const node = element(doc, "div", "zct-selection-rect");
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${Math.max(0, rect.right - rect.left)}px`;
    node.style.height = `${Math.max(0, rect.bottom - rect.top)}px`;
    overlay.append(node);
  }
  return overlay;
}

function positionDialog(root, anchorRects, view) {
  const anchor = anchorRects.length ? normalizeRect(anchorRects[0]) : null;
  const width = view?.innerWidth ?? 1200;
  const height = view?.innerHeight ?? 800;
  const size = dialogSize(root);
  let left = anchor ? anchor.right + VIEWPORT_MARGIN : (width - size.width) / 2;
  let top = anchor ? anchor.bottom + VIEWPORT_MARGIN : (height - size.height) / 2;
  if (left + size.width > width - VIEWPORT_MARGIN && anchor) {
    left = anchor.left - size.width - VIEWPORT_MARGIN;
  }
  setClampedPosition(root, left, top, view);
}

function setClampedPosition(root, left, top, view) {
  const width = view?.innerWidth ?? 1200;
  const height = view?.innerHeight ?? 800;
  const size = dialogSize(root);
  root.style.left = `${clamp(left, VIEWPORT_MARGIN, width - size.width - VIEWPORT_MARGIN)}px`;
  root.style.top = `${clamp(top, VIEWPORT_MARGIN, height - size.height - VIEWPORT_MARGIN)}px`;
}

function setReachablePosition(root, left, top, view) {
  const width = view?.innerWidth ?? 1200;
  const height = view?.innerHeight ?? 800;
  const size = dialogSize(root);
  root.style.left = `${clamp(left, VIEWPORT_MARGIN, width - size.width - VIEWPORT_MARGIN)}px`;
  root.style.top = `${clamp(top, VIEWPORT_MARGIN, height - TITLEBAR_HEIGHT - VIEWPORT_MARGIN)}px`;
}

function dialogSize(root) {
  const rect = root?.getBoundingClientRect?.();
  return {
    width: Number.isFinite(rect?.width) && rect.width > 0
      ? rect.width
      : WINDOW_WIDTH,
    height: Number.isFinite(rect?.height) && rect.height > 0
      ? rect.height
      : WINDOW_HEIGHT,
  };
}

function normalizeRect(value) {
  if (Array.isArray(value)) {
    const [left, top, right, bottom] = value.map(Number);
    return { left, top, right, bottom };
  }
  return {
    left: Number(value?.left) || 0,
    top: Number(value?.top) || 0,
    right: Number(value?.right) || 0,
    bottom: Number(value?.bottom) || 0,
  };
}

function statusText(state) {
  if (state.status === "loading") {
    const phase = state.progress?.phase;
    if (phase === "retrying") {
      return `服务暂时繁忙，正在进行第 ${state.progress?.attempt ?? 2} 次尝试…`;
    }
    if (phase === "reasoning") return "模型正在分析论文上下文…";
    if (phase === "streaming") return "正在生成译文…";
    return "正在连接模型…";
  }
  if (state.status === "error") return "翻译未能完成";
  if (state.status === "result") return "翻译完成";
  return "";
}

function badgeText(state) {
  if (state.status === "loading") {
    const attempt = state.progress?.attempt;
    const maxAttempts = state.progress?.maxAttempts;
    return attempt && maxAttempts ? `${attempt}/${maxAttempts}` : "处理中";
  }
  if (state.status === "result") return "已完成";
  if (state.status === "error") return "需要处理";
  return "待选择";
}

function errorPresentation(error) {
  const status = Number(error?.status) || null;
  const attempt = Number(error?.attempt) || null;
  const maxAttempts = Number(error?.maxAttempts) || null;
  const attempts = attempt
    ? `已尝试 ${attempt}${maxAttempts ? `/${maxAttempts}` : ""} 次`
    : "";
  if ([502, 503, 504].includes(status)) {
    return {
      title: "服务暂时繁忙",
      detail: [`HTTP ${status}`, attempts].filter(Boolean).join(" · "),
    };
  }
  if (status === 429) {
    return {
      title: "请求过于频繁",
      detail: ["HTTP 429", attempts].filter(Boolean).join(" · "),
    };
  }
  if (status === 401 || status === 403) {
    return {
      title: "API 认证失败",
      detail: `HTTP ${status} · 请检查 API Key`,
    };
  }
  if (error?.code === "FIRST_EVENT_TIMEOUT") {
    return {
      title: "等待模型响应超时",
      detail: "90 秒内未收到有效模型输出",
    };
  }
  if (error?.code === "IDLE_TIMEOUT") {
    return {
      title: "流式响应中断",
      detail: "模型开始输出后连续 45 秒没有新数据",
    };
  }
  return {
    title: "翻译失败",
    detail: attempts || "请稍后重新尝试",
  };
}

function element(doc, tag, className, text = "") {
  const node = doc.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
