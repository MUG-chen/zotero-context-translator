# Stable Drag Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the embedded translation card from jumping to Zotero's recalculated popup position when a drag begins after translation starts.

**Architecture:** Capture one immutable card rectangle and pointer-to-card grab offset on `pointerdown`. When the drag threshold is crossed, detach with that saved geometry and calculate every position from the live pointer minus the saved grab offset, so intervening native-popup reflow cannot replace the drag origin.

**Tech Stack:** Zotero 9 bootstrap plugin, JavaScript ES modules, Node.js built-in test runner, PowerShell XPI build script.

## Global Constraints

- Clicking Translate must keep the card embedded.
- Movements below the existing four-pixel threshold must not detach the card.
- The same point within the titlebar must remain under the pointer while dragging.
- Existing viewport clamping, detached resizing, close behavior, and selection preservation must remain unchanged.
- The release artifact must not contain tests, private paths, credentials, or paper files.

---

### Task 1: Reproduce Native Popup Repositioning

**Files:**
- Modify: `tests/floating-view.test.mjs`

**Interfaces:**
- Consumes: `FloatingView.mount({ doc, append, handlers })` and pointer events from `tests/helpers/fake-dom.mjs`.
- Produces: A regression test that protects the pointerdown geometry from an intervening host reposition.

- [ ] **Step 1: Write the failing regression test**

Add a test after `detaches only after an intentional titlebar drag`:

```js
test("keeps the pointerdown grab point when Zotero repositions the host before drag", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {},
  });
  const titlebar = root.querySelector(".zct-titlebar");
  root.mockRect = { width: 380, height: 420 };
  root.style.left = "80px";
  root.style.top = "90px";

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 8,
    clientX: 100,
    clientY: 110,
    target: titlebar,
  }));

  // Zotero's transformed ViewPopup may recalculate after card content changes.
  root.style.left = "900px";
  root.style.top = "300px";
  doc.defaultView.dispatchEvent(event("pointermove", {
    pointerId: 8,
    clientX: 110,
    clientY: 122,
  }));

  assert.equal(root.parentNode, doc.body);
  assert.equal(root.style.left, "90px");
  assert.equal(root.style.top, "102px");
  assert.equal(root.style.width, "380px");
  assert.equal(root.style.height, "420px");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:Path='C:\Users\hanmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:Path
node --test --test-name-pattern="keeps the pointerdown grab point" tests/floating-view.test.mjs
```

Expected: FAIL because the current threshold handler re-reads `900px` and clamps the card near the right edge instead of producing `90px`.

---

### Task 2: Stabilize Drag Geometry

**Files:**
- Modify: `addon/content/modules/floating-view.mjs:479-509`
- Modify: `addon/content/modules/floating-view.mjs:573-596`
- Test: `tests/floating-view.test.mjs`

**Interfaces:**
- Consumes: `PointerEvent.clientX`, `PointerEvent.clientY`, the pointerdown `DOMRect`, and `setClampedPosition(root, left, top, view)`.
- Produces: `#detachFromHost(geometry = null)`, accepting the saved rectangle used for the detach transition.

- [ ] **Step 1: Store the immutable rectangle and grab offset on pointerdown**

Replace the drag origin fields with:

```js
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
```

- [ ] **Step 2: Detach from the saved frame and position by grab offset**

Change the threshold branch and final positioning to:

```js
if (this.#drag.pending) {
  if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
  this.#detachFromHost(this.#drag.geometry);
  this.#drag.pending = false;
}
setClampedPosition(
  this.#root,
  event.clientX - this.#drag.grabX,
  event.clientY - this.#drag.grabY,
  this.#doc.defaultView,
);
```

- [ ] **Step 3: Let detach accept saved geometry**

Use the supplied geometry when present and retain the existing live-rectangle fallback:

```js
#detachFromHost(geometry = null) {
  if (!this.#embedded || !this.#root) return;
  const rect = geometry ?? this.#root.getBoundingClientRect();
  // Existing class removal, append, size clamp, and position clamp remain unchanged.
}
```

- [ ] **Step 4: Run the focused drag tests and verify GREEN**

Run:

```powershell
$env:Path='C:\Users\hanmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:Path
node --test --test-name-pattern="drag|grab point|sub-threshold|detaches only" tests/floating-view.test.mjs
```

Expected: All matching tests PASS.

- [ ] **Step 5: Commit the regression and fix**

```powershell
git add -- addon/content/modules/floating-view.mjs tests/floating-view.test.mjs
git -c user.name="MUG-chen" -c user.email="88625388+MUG-chen@users.noreply.github.com" commit -m "fix: preserve translation card drag origin"
```

---

### Task 3: Package Version 0.1.8 and Verify Delivery

**Files:**
- Modify: `addon/manifest.json`
- Modify: `package.json`
- Modify: `tests/manifest.test.mjs`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`
- Build: `outputs/zotero-context-translator-0.1.8.xpi`

**Interfaces:**
- Consumes: the corrected runtime and `scripts/build-xpi.ps1`.
- Produces: installable Zotero 9 XPI version `0.1.8`.

- [ ] **Step 1: Update version references from 0.1.7 to 0.1.8**

Change the manifest, package metadata, manifest expectation, installation filename, and acceptance filename to `0.1.8`. Do not change API configuration defaults or compatibility bounds.

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
$env:Path='C:\Users\hanmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:Path
npm test
```

Expected: every test passes with zero failures.

- [ ] **Step 3: Build the XPI**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-xpi.ps1 -NodeExecutable 'C:\Users\hanmi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
```

Expected: `outputs/zotero-context-translator-0.1.8.xpi` exists and the build exits with code 0.

- [ ] **Step 4: Audit the XPI and Git state**

Open the XPI as a ZIP and assert that `manifest.json`, `bootstrap.js`, and `prefs.js` exist. Assert that no entry matches tests, work, cache, logs, `.env`, PDF files, personal Windows paths, API-key-like values, or personal email addresses. Run `git diff --check` and inspect `git status --short --branch`.

- [ ] **Step 5: Commit the release metadata**

```powershell
git add -- addon/manifest.json package.json tests/manifest.test.mjs docs/INSTALL.md docs/ACCEPTANCE.md
git -c user.name="MUG-chen" -c user.email="88625388+MUG-chen@users.noreply.github.com" commit -m "release: prepare stable drag origin 0.1.8"
```
