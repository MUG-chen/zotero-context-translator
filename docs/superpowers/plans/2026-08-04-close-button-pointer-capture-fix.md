# Close Button Pointer Capture Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floating card close button close on the first real pointer click in Zotero 9.0.6 without disabling titlebar dragging or clearing the PDF selection.

**Architecture:** Keep the standard button `click` handler and stop the draggable titlebar from starting pointer capture when `pointerdown` originated from an interactive descendant. Extend the existing unit test at the exact event boundary, then verify the packaged change through Zotero Reader's real `customEvent` path.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Zotero 9 Reader API, PowerShell XPI build.

## Global Constraints

- Do not alter the approved floating-card visual design, API client, cache, prompt, or translation behavior.
- Keep standard `click`, keyboard activation, and `Esc` close behavior.
- Preserve titlebar dragging when the pointer starts on non-interactive titlebar content.
- Release as version `0.1.3`; keep 0.1.2 artifacts intact.
- Real acceptance target is Zotero 9.0.6 (64-bit) in an isolated profile and data directory.

---

### Task 1: Prevent interactive descendants from starting titlebar pointer capture

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: `FloatingView.mount({ doc, append, handlers })` and the existing `.zct-titlebar`/`.zct-close` DOM structure.
- Produces: titlebar `pointerdown` behavior that returns before creating `#drag` or calling `setPointerCapture()` when the event target is inside `button`, `a`, `input`, `select`, `textarea`, or `[contenteditable="true"]`.

- [ ] **Step 1: Write the failing close-pointer-capture test**

Add a test that dispatches `pointerdown` on `.zct-titlebar` with `.zct-close` as `event.target`, replaces `titlebar.setPointerCapture` with a counter, and asserts the counter remains zero before dispatching the first `click` and asserting one close call:

```js
test("close button does not let the draggable titlebar capture its pointer", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => doc.body.append(node),
    handlers: { close: () => calls.push("close") },
  });
  const titlebar = root.querySelector(".zct-titlebar");
  const close = root.querySelector(".zct-close");
  let captures = 0;
  titlebar.setPointerCapture = () => captures += 1;

  titlebar.dispatchEvent(event("pointerdown", {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    target: close,
  }));
  close.dispatchEvent(event("click"));

  assert.equal(captures, 0);
  assert.deepEqual(calls, ["close"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test --test-name-pattern="close button does not let" tests/floating-view.test.mjs
```

Expected: FAIL because `captures` is `1` in the current implementation.

- [ ] **Step 3: Implement the minimal guard**

Before the titlebar drag handler reads the root rectangle, return for interactive descendants:

```js
this.#listen(titlebar, "pointerdown", (event) => {
  if (isInteractiveTarget(event.target)) return;
  // existing drag setup remains unchanged
});
```

Add a focused module helper:

```js
function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    'button, a, input, select, textarea, [contenteditable="true"]',
  ));
}
```

- [ ] **Step 4: Verify GREEN and dragging regression**

Run:

```powershell
node --test tests/floating-view.test.mjs
```

Expected: all floating-view tests pass, including the existing title drag test.

- [ ] **Step 5: Run the complete suite and commit**

Run `node --test`; expected: all tests pass. Commit test and implementation together with message `fix: keep close clicks out of titlebar drag capture`.

### Task 2: Prepare the 0.1.3 release candidate

**Files:**
- Modify: `package.json`
- Modify: `addon/manifest.json`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`

**Interfaces:**
- Consumes: the green Task 1 implementation.
- Produces: `outputs/zotero-context-translator-0.1.3.xpi` targeting Zotero 9.0.*.

- [ ] **Step 1: Add a failing version assertion**

Update `tests/manifest.test.mjs` to assert version `0.1.3` in both `package.json` and `addon/manifest.json`; run the focused test and expect version mismatch failure.

- [ ] **Step 2: Update release metadata and documentation**

Set both version fields to `0.1.3`. Add a short 0.1.3 note explaining that interactive controls no longer enter titlebar pointer capture and that real first-click close is revalidated.

- [ ] **Step 3: Run tests and build**

Run `node --test`, then:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-xpi.ps1 -NodeExecutable '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
```

Expected: all tests pass and the 0.1.3 XPI is created.

- [ ] **Step 4: Audit and commit release metadata**

Confirm the XPI contains only the six expected files, reports version 0.1.3, and contains no test endpoint, test key, paper title, or paper path. Commit with message `chore: prepare 0.1.3 close fix release`.

### Task 3: Isolated Zotero 9.0.6 acceptance and delivery

**Files:**
- Create: `outputs/Zotero-Context-Translator-0.1.3-验收报告.md`
- Create: `outputs/zotero-context-translator-0.1.3.xpi`
- Create: `outputs/zotero-context-translator-0.1.3-source.zip`

**Interfaces:**
- Consumes: the audited 0.1.3 XPI and existing isolated Zotero harness.
- Produces: installable delivery artifacts and evidence that real Reader close interaction is fixed.

- [ ] **Step 1: Install in an isolated Zotero profile**

Start Zotero 9.0.6 with `-no-remote`, a dedicated profile, a dedicated data directory, and the debugger server. Install 0.1.3 and verify `isActive === true`, one runtime object, and one Reader listener.

- [ ] **Step 2: Reproduce the full real event sequence 20 times**

Through Reader's iframe `customEvent` path, create a real text selection and floating card. For each fresh card, dispatch a complete pointer sequence at the close button and assert: no titlebar pointer capture, card removed after first click, and PDF selection length remains nonzero. Require 20/20.

- [ ] **Step 3: Verify non-interactive titlebar dragging**

Start the pointer on `.zct-title` rather than a button, cross the four-pixel drag threshold, and assert the card detaches/moves while the close button still closes it afterward.

- [ ] **Step 4: Final verification and cleanup**

Run the full test suite again, verify `git diff --check`, rebuild the exact candidate, record SHA-256, and gracefully quit the isolated Zotero instance.

- [ ] **Step 5: Deliver**

Copy the XPI, installation guide, source archive, and acceptance report to the main `outputs` directory without deleting 0.1.2. Preserve the feature branch unless the user separately authorizes merge or push.
