# Compact Resizable Translation Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep translation embedded in Zotero's annotation popup through result rendering, reduce the card footprint, and allow bounded resizing only after an intentional drag detaches it.

**Architecture:** `FloatingView` remains the single owner of card presentation and pointer interaction. The translate action becomes data-only, while the existing title-bar drag threshold remains the sole detachment trigger; CSS state classes distinguish host-controlled embedded layout from resizable standalone layout. Existing fake-DOM tests verify parenting, sizing styles, and viewport clamping without changing the translation pipeline.

**Tech Stack:** JavaScript ES modules, Node.js 22 built-in test runner, fake DOM test utilities, CSS embedded in `floating-view.mjs`, PowerShell XPI build.

## Global Constraints

- Zotero 9 remains the supported runtime.
- Selection alone produces zero API calls; only explicit `翻译` or retry can request translation.
- Clicking `翻译` keeps the card embedded and invokes `translate("sentence")` exactly once.
- Only a title-bar drag crossing the existing 4 px threshold detaches the card.
- Compact defaults are 380 px width, 520 px maximum height, 12 px base text, and 14 px translation text.
- Detached resize bounds are 320 × 240 px minimum and the reader viewport minus 12 px margins maximum.
- Embedded mode is not resizable; detached mode uses bottom-right native resizing.
- Close, copy, retry, source expansion, dark theme, focus styling, API behavior, context indexing, caching, and prompts remain unchanged.
- Interactive controls retain at least a 36 px hit target.
- Resized geometry is session-local and is not persisted.

---

## File Structure

- Modify `addon/content/modules/floating-view.mjs`: card dimensions, embedded/detached state behavior, drag detachment, resize observation, and viewport bounds.
- Modify `tests/floating-view.test.mjs`: regression tests for translate parenting, compact CSS, drag-only detachment, and resize clamping.
- Modify `tests/helpers/fake-dom.mjs` only if the new test needs a minimal `ResizeObserver` substitute; keep production-specific logic out of this helper.
- Modify `addon/manifest.json` and `package.json`: bump the deliverable version from 0.1.6 to 0.1.7.
- Modify `docs/INSTALL.md` and `docs/ACCEPTANCE.md`: describe the compact embedded behavior and manual Zotero acceptance checks.
- Create `outputs/zotero-context-translator-0.1.7.xpi` through the existing build script; do not commit build staging files.

---

### Task 1: Keep Translation Embedded Until Intentional Drag

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: `FloatingView.mount({ doc, append, handlers })` and `handlers.translate(mode)`.
- Produces: translate-click behavior that calls `handlers.translate("sentence")` without invoking `#detachFromHost()`; title-bar drag remains the only normal detachment path.

- [ ] **Step 1: Replace the detach-on-translate regression test with embedded-state assertions**

```js
test("stays inside Zotero's native selection popup after translation starts", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: { translate: (mode) => calls.push(mode) },
  });

  root.querySelector(".zct-translate").dispatchEvent(event("click"));

  assert.deepEqual(calls, ["sentence"]);
  assert.equal(root.parentNode, host);
  assert.match(root.className, /zct-floating-window--embedded/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="stays inside Zotero" tests/floating-view.test.mjs`

Expected: FAIL because the current click listener reparents the card to `doc.body`.

- [ ] **Step 3: Remove translate-triggered detachment**

```js
this.#listen(translateButton, "click", () => {
  this.#handlers.translate?.("sentence");
});
```

Retain `#detachFromHost()` in the threshold-crossing title-bar drag path.

- [ ] **Step 4: Add a drag regression proving detachment still works once**

```js
test("detaches only after an intentional titlebar drag", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({ doc, append: (node) => host.append(node), handlers: {} });
  const titlebar = root.querySelector(".zct-titlebar");
  root.mockRect = { left: 80, top: 90, width: 380, height: 420 };

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 7, clientX: 100, clientY: 100, target: titlebar,
  }));
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 7, clientX: 110, clientY: 112,
  }));

  assert.equal(root.parentNode, doc.body);
  assert.doesNotMatch(root.className, /zct-floating-window--embedded/);
  assert.equal(doc.querySelectorAll('[role="dialog"]').length, 1);
});
```

- [ ] **Step 5: Run focused and full floating-view tests**

Run: `node --test tests/floating-view.test.mjs`

Expected: PASS with all existing close, pointer, result, and viewport behaviors intact.

- [ ] **Step 6: Commit the behavior fix**

```bash
git add tests/floating-view.test.mjs addon/content/modules/floating-view.mjs
git commit -m "fix: keep translation card aligned with Zotero popup"
```

---

### Task 2: Apply the Compact Visual Scale

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: exported `FLOATING_WINDOW_CSS` and `dialogSize(root)` fallback constants.
- Produces: 380 px default width, 520 px maximum height, 12 px base text, 14 px translation text, and proportionally smaller non-interactive spacing.

- [ ] **Step 1: Add failing CSS contract tests**

```js
test("uses the approved compact card dimensions and typography", () => {
  assert.match(FLOATING_WINDOW_CSS, /width:\s*min\(380px,/);
  assert.match(FLOATING_WINDOW_CSS, /max-height:\s*min\(520px,/);
  assert.match(FLOATING_WINDOW_CSS, /font:\s*12px\/1\.5/);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-translation\s*\{[^}]*font-size:\s*14px/s);
});

test("keeps embedded layout host-controlled and non-resizable", () => {
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window--embedded\s*\{[^}]*width:\s*100%/s);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window--embedded\s*\{[^}]*resize:\s*none/s);
});
```

- [ ] **Step 2: Run the compact-style tests and verify RED**

Run: `node --test --test-name-pattern="compact|host-controlled" tests/floating-view.test.mjs`

Expected: FAIL on the existing 440 px, 620 px, 13 px, and 15 px declarations.

- [ ] **Step 3: Implement compact constants and CSS**

```js
const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 300;
```

Update `.zct-floating-window` to `width: min(380px, calc(100vw - 24px))`, `max-height: min(520px, calc(100vh - 24px))`, `font: 12px/1.5 ...`, `min-width: 320px`, and `min-height: 240px`. Set `.zct-floating-window--embedded` to `width: 100%`, `max-width: min(380px, calc(100vw - 24px))`, `min-width: 0`, `min-height: 0`, and `resize: none`. Reduce the title bar, card margins, internal padding, and non-interactive gaps while preserving every existing control's minimum hit target.

- [ ] **Step 4: Run floating-view tests and inspect CSS assertions**

Run: `node --test tests/floating-view.test.mjs`

Expected: PASS; the accessibility test still confirms 36–40 px control targets.

- [ ] **Step 5: Commit compact styling**

```bash
git add tests/floating-view.test.mjs addon/content/modules/floating-view.mjs
git commit -m "feat: compact the translation card layout"
```

---

### Task 3: Add Detached-Only Bounded Resizing

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `tests/helpers/fake-dom.mjs` only if required for deterministic resize callbacks
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: `#detachFromHost()`, `#repositionWithinViewport()`, `setClampedPosition(root, left, top, view)`, and the `zct-floating-window--embedded` state class.
- Produces: detached `resize: both`; a resize callback that caps width/height to viewport availability and reclamps left/top; observer cleanup in `destroy()`.

- [ ] **Step 1: Add a failing detached-resize CSS test**

```js
test("allows bounded resizing only for the detached card", () => {
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window\s*\{[^}]*resize:\s*both/s);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window\s*\{[^}]*min-width:\s*320px/s);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window\s*\{[^}]*min-height:\s*240px/s);
  assert.match(FLOATING_WINDOW_CSS, /\.zct-floating-window--embedded\s*\{[^}]*resize:\s*none/s);
});
```

- [ ] **Step 2: Run the resize-style test and verify RED**

Run: `node --test --test-name-pattern="bounded resizing" tests/floating-view.test.mjs`

Expected: FAIL because no resize declarations or minimum detached dimensions exist.

- [ ] **Step 3: Implement detached resize styling and preserve measured detach size**

Add `resize: both` to the base detached rule and override it with `resize: none` in the embedded rule. In `#detachFromHost()`, capture `rect.width` and `rect.height`, remove the embedded class, append to `doc.body`, and set inline width/height only when finite and within viewport limits before clamping the saved position.

- [ ] **Step 4: Add a failing resize/viewport clamp test**

```js
test("clamps detached dimensions after the reader viewport shrinks", () => {
  const doc = new FakeDocument();
  doc.defaultView.innerWidth = 500;
  doc.defaultView.innerHeight = 420;
  const view = new FloatingView();
  const root = view.mount({ doc, handlers: {} });
  root.mockRect = { left: 40, top: 30, width: 620, height: 560 };

  doc.defaultView.dispatchEvent(event("resize"));

  assert.equal(root.style.maxWidth, "476px");
  assert.equal(root.style.maxHeight, "396px");
  const rect = root.getBoundingClientRect();
  assert.ok(rect.left >= 12 && rect.top >= 12);
});
```

- [ ] **Step 5: Implement a single dimension-and-position clamp path**

Create `clampDialogToViewport(root, view)` that sets `maxWidth` and `maxHeight` from viewport dimensions minus twice `VIEWPORT_MARGIN`, then calls `setClampedPosition()` with the current rectangle. Use it from render, source expansion, window resize, and a `ResizeObserver` callback when available. Store the observer on `FloatingView` and disconnect it in `destroy()`.

- [ ] **Step 6: Run resize, drag, and full floating-view tests**

Run: `node --test tests/floating-view.test.mjs`

Expected: PASS; no card edge exceeds the viewport margin, and embedded rendering does not detach.

- [ ] **Step 7: Commit resize behavior**

```bash
git add tests/floating-view.test.mjs tests/helpers/fake-dom.mjs addon/content/modules/floating-view.mjs
git commit -m "feat: resize detached translation cards safely"
```

---

### Task 4: Version, Documentation, Full Verification, and XPI

**Files:**
- Modify: `tests/manifest.test.mjs`
- Modify: `addon/manifest.json`
- Modify: `package.json`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`
- Generate: `outputs/zotero-context-translator-0.1.7.xpi`

**Interfaces:**
- Consumes: completed floating-card behavior and existing build scripts.
- Produces: synchronized version 0.1.7 metadata, install/acceptance guidance, and a verified XPI artifact.

- [ ] **Step 1: Add version and behavior acceptance assertions**

Change both version assertions in `tests/manifest.test.mjs` from `0.1.6` to `0.1.7`. Extend `docs/ACCEPTANCE.md` with explicit checks that translate does not detach, compact typography remains readable, title-bar drag detaches once, and detached resizing remains bounded.

- [ ] **Step 2: Run manifest and documentation-related tests and verify RED**

Run: `node --test tests/manifest.test.mjs tests/build-runtime.test.mjs`

Expected: FAIL until manifest/package versions and any versioned runtime expectation are synchronized.

- [ ] **Step 3: Bump version and document the interaction**

Set `version` to `0.1.7` in `addon/manifest.json` and `package.json`. Add a concise `0.1.7` note to `docs/INSTALL.md`: translate remains in the native popup; drag detaches; detached cards resize from the bottom-right; no geometry is saved.

- [ ] **Step 4: Run the complete automated suite**

Run: `npm test`

Expected: all tests pass with zero failures and no unhandled warnings.

- [ ] **Step 5: Build the production XPI**

Run: `npm run build`

Expected: exit code 0 and `outputs/zotero-context-translator-0.1.7.xpi` containing root `manifest.json` and `bootstrap.js`.

- [ ] **Step 6: Inspect repository state and artifact metadata**

Run: `git diff --check`

Run: `git status --short`

Run: `Get-FileHash -Algorithm SHA256 outputs/zotero-context-translator-0.1.7.xpi`

Expected: no whitespace errors; only intended source/docs/version changes plus the new XPI artifact; SHA-256 is printed for handoff.

- [ ] **Step 7: Perform isolated Zotero 9 acceptance**

Install the 0.1.7 XPI in the isolated Zotero profile and verify the five acceptance scenarios from the design with both short and long selections. Confirm the existing API test connection, close button, copy, retry, source expansion, selection preservation, and context status remain functional.

- [ ] **Step 8: Commit release-ready changes**

```bash
git add tests/manifest.test.mjs addon/manifest.json package.json docs/INSTALL.md docs/ACCEPTANCE.md outputs/zotero-context-translator-0.1.7.xpi
git commit -m "release: prepare compact floating card 0.1.7"
```
