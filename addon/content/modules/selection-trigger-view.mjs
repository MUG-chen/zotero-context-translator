export const SELECTION_TRIGGER_CSS = String.raw`
.zct-selection-trigger {
  --zct-trigger-accent: #2f6fdd;
  --zct-trigger-accent-soft: #edf4ff;
  --zct-trigger-border: #d5deeb;
  --zct-trigger-text: #23314b;
  box-sizing: border-box;
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  width: 100%;
}

.zct-selection-trigger-button {
  align-items: center;
  background: color-mix(in srgb, #fff 94%, var(--zct-trigger-accent));
  border: 1px solid var(--zct-trigger-border);
  border-radius: 999px;
  box-shadow: 0 3px 10px rgb(26 42 68 / 12%);
  color: var(--zct-trigger-text);
  cursor: pointer;
  display: inline-flex;
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  gap: 6px;
  height: 30px;
  padding: 0 11px 0 5px;
  transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.zct-selection-trigger-button:hover {
  background: var(--zct-trigger-accent-soft);
  border-color: color-mix(in srgb, var(--zct-trigger-accent) 38%, var(--zct-trigger-border));
  box-shadow: 0 5px 14px rgb(26 42 68 / 16%);
}

.zct-selection-trigger-button:focus-visible {
  outline: 2px solid var(--zct-trigger-accent);
  outline-offset: 2px;
}

.zct-selection-trigger-button:disabled { cursor: wait; opacity: 0.66; }

.zct-selection-trigger-mark {
  align-items: center;
  background: linear-gradient(145deg, #e8f1ff, #dceaff);
  border: 1px solid #c6dafb;
  border-radius: 50%;
  color: var(--zct-trigger-accent);
  display: inline-flex;
  font-size: 10px;
  height: 20px;
  justify-content: center;
  width: 20px;
}

@media (prefers-reduced-motion: reduce) {
  .zct-selection-trigger-button { transition: none; }
}

@media (prefers-color-scheme: dark) {
  .zct-selection-trigger {
    --zct-trigger-accent: #78a8ff;
    --zct-trigger-accent-soft: #22395e;
    --zct-trigger-border: #465264;
    --zct-trigger-text: #edf2fa;
  }
  .zct-selection-trigger-button { background: #292e37; }
  .zct-selection-trigger-mark { background: #253a5b; border-color: #3e5d8e; }
}
`;

export class SelectionTriggerView {
  #root = null;
  #listeners = [];

  mount({ doc, append, selection, onTranslate, onReaderClose }) {
    if (!doc?.createElement || !doc.body) {
      throw new TypeError("A reader document is required");
    }
    if (!selection || typeof selection !== "object") {
      throw new TypeError("A selection snapshot is required");
    }
    this.destroy();

    const root = doc.createElement("div");
    root.className = "zct-selection-trigger";
    const button = doc.createElement("button");
    button.className = "zct-selection-trigger-button";
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", "翻译所选文本");
    const mark = doc.createElement("span");
    mark.className = "zct-selection-trigger-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "译";
    const label = doc.createElement("span");
    label.className = "zct-selection-trigger-label";
    label.textContent = "翻译";
    button.append(mark, label);
    root.append(button);
    this.#root = root;

    if (typeof append === "function") append(root);
    else doc.body.append(root);

    let activated = false;
    this.#listen(root, "pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.#listen(button, "click", () => {
      if (activated) return;
      activated = true;
      button.disabled = true;
      const rect = root.getBoundingClientRect();
      const activation = {
        selection,
        anchorRect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
      };
      this.destroy();
      onTranslate?.(activation);
    });
    const closeWithReader = () => {
      this.destroy();
      onReaderClose?.();
    };
    this.#listen(doc.defaultView, "pagehide", closeWithReader);
    this.#listen(doc.defaultView, "unload", closeWithReader);
    return root;
  }

  destroy() {
    for (const [target, type, listener] of this.#listeners.splice(0)) {
      target.removeEventListener(type, listener);
    }
    this.#root?.remove();
    this.#root = null;
  }

  #listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.#listeners.push([target, type, listener]);
  }
}
