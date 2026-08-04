# Single Translate Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four translation-mode controls with one explicit `翻译` button while preserving the rule that selection alone never calls the API.

**Architecture:** Keep the translation pipeline and its internal `mode` parameter intact, but collapse the floating view's public interaction to one button that invokes `translate("sentence")`. The floating view remains responsible for explicit user intent, loading disablement, and detaching from Zotero's native popup after the action fires.

**Tech Stack:** JavaScript ES modules, Zotero 9 bootstrap add-on APIs, Node.js built-in test runner, fake DOM unit harness, PowerShell XPI build script.

## Global Constraints

- Support Zotero `9.0` through `9.0.*` only.
- Selecting PDF text must not call the API.
- The API is called only after the user presses `翻译`.
- Preserve close, drag, source expansion, copy, retry, status, and result behavior.
- Ship as version `0.1.4` without overwriting earlier artifacts.

---

### Task 1: Replace Mode Controls with One Explicit Action

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: `FloatingView.mount({ doc, append, handlers })`, where `handlers.translate(mode)` accepts the existing internal mode string.
- Produces: one `.zct-translate` button that invokes `handlers.translate("sentence")` exactly once and then detaches the embedded card.

- [ ] **Step 1: Write the failing single-action test**

Add a focused test before changing production code:

```js
test("renders one explicit translate action without mode choices", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    handlers: { translate: (mode) => calls.push(mode) },
  });

  const action = root.querySelector(".zct-translate");
  assert.ok(action);
  assert.equal(action.textContent, "翻译");
  assert.equal(root.querySelectorAll("[data-mode]").length, 0);
  assert.equal(root.querySelectorAll(".zct-translate").length, 1);
  action.dispatchEvent(event("click"));
  assert.deepEqual(calls, ["sentence"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/floating-view.test.mjs
```

Expected: FAIL because `.zct-translate` does not exist and four `[data-mode]` buttons remain.

- [ ] **Step 3: Implement the minimal single-button UI**

In `populateDialog`, replace the mode array with one native button:

```js
const actions = element(doc, "div", "zct-actions");
const translateButton = element(doc, "button", "zct-translate", "翻译");
translateButton.setAttribute("type", "button");
actions.append(translateButton);
```

Return `translateButton` instead of `modeButtons`. In `render`, set:

```js
this.#nodes.translateButton.disabled = current.status === "loading";
```

In `#bindEvents`, bind one handler in this order:

```js
this.#listen(translateButton, "click", () => {
  this.#handlers.translate?.("sentence");
  this.#detachFromHost();
});
```

Replace `.zct-action` styles with a full-width `.zct-translate` primary action, preserve a minimum height of 36 px, and remove all `[aria-pressed]` styles.

- [ ] **Step 4: Update affected view tests without weakening their assertions**

Replace old `[data-mode="sentence"]` lookups with `.zct-translate`. Keep the assertions that the action fires before detachment and that pointer interaction preserves the PDF selection. Replace the structured-result selected-mode assertion with:

```js
assert.equal(root.querySelectorAll("[data-mode]").length, 0);
assert.equal(root.querySelectorAll(".zct-translate").length, 1);
```

Update the hit-target assertion to cover `.zct-translate`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the same focused command. Expected: every floating-view test passes with zero warnings or failures.

- [ ] **Step 6: Commit the UI behavior**

```powershell
git add addon/content/modules/floating-view.mjs tests/floating-view.test.mjs
git commit -m "feat: replace translation modes with one action"
```

---

### Task 2: Lock the API-Call Boundary and Unified Mode

**Files:**
- Modify: `tests/plugin.test.mjs`
- Verify: `addon/content/modules/plugin.mjs`
- Verify: `addon/content/modules/prompt-builder.mjs`

**Interfaces:**
- Consumes: the view's `handlers.translate("sentence")` call.
- Produces: exactly one API request after the explicit action, using the existing contextual `sentence` prompt and no request at selection time.

- [ ] **Step 1: Write a failing interaction-boundary assertion**

Extend the existing selection/API test to invoke the mounted view handler and assert the boundary directly:

```js
await plugin.handleSelection(selection());
assert.equal(calls.api.length, 0);
await view.mountOptions.handlers.translate("paragraph");
assert.equal(calls.api.length, 1);
assert.equal(plugin.state.current.mode, "sentence");
```

The deliberately supplied legacy `paragraph` argument proves that the production view contract no longer exposes arbitrary modes. The test must fail until the mounted handler normalizes UI translation requests to `sentence`.

- [ ] **Step 2: Run the focused plugin test and verify RED**

Run:

```powershell
& '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/plugin.test.mjs
```

Expected: FAIL if the mounted handler still exposes arbitrary UI mode selection.

- [ ] **Step 3: Normalize the mounted UI handler**

In `handleSelection`, make the view contract explicit:

```js
handlers: {
  translate: () => this.translate("sentence"),
  retry: () => this.retry(),
  copy: (text) => copyText(this.deps, selection, text),
  close: () => this.close(),
},
```

Keep `translate(mode = "sentence")` and prompt-builder mode support intact for compatibility. The view may pass `sentence`, but the plugin handler remains authoritative.

- [ ] **Step 4: Run plugin and prompt tests and verify GREEN**

Run:

```powershell
& '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/plugin.test.mjs tests/prompt-builder.test.mjs
```

Expected: all tests pass; selection alone creates zero API calls and the explicit action creates exactly one.

- [ ] **Step 5: Commit the API boundary**

```powershell
git add addon/content/modules/plugin.mjs tests/plugin.test.mjs
git commit -m "feat: unify floating translation requests"
```

---

### Task 3: Prepare the 0.1.4 Release Metadata

**Files:**
- Modify: `package.json`
- Modify: `addon/manifest.json`
- Modify: `tests/manifest.test.mjs`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`

**Interfaces:**
- Consumes: completed single-action behavior.
- Produces: matching package and manifest version `0.1.4`, plus installation and acceptance guidance.

- [ ] **Step 1: Update the manifest test first**

Change both expected versions in `tests/manifest.test.mjs`:

```js
assert.equal(manifest.version, "0.1.4");
assert.equal(packageMetadata.version, "0.1.4");
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run:

```powershell
& '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/manifest.test.mjs
```

Expected: FAIL because package and manifest still report `0.1.3`.

- [ ] **Step 3: Update metadata and documentation**

Set `package.json` and `addon/manifest.json` to `0.1.4`. Update `docs/INSTALL.md` to name the 0.1.4 XPI and explain the single explicit `翻译` button. Update `docs/ACCEPTANCE.md` with these checks:

```text
- The floating card contains exactly one 翻译 button.
- No 词语/整句/段落/解释 mode controls are present.
- Selecting text does not call the API.
- One explicit click produces one translation request.
```

- [ ] **Step 4: Run the manifest test and verify GREEN**

Run the focused manifest command. Expected: PASS.

- [ ] **Step 5: Commit release metadata**

```powershell
git add package.json addon/manifest.json tests/manifest.test.mjs docs/INSTALL.md docs/ACCEPTANCE.md
git commit -m "chore: prepare 0.1.4 single-action release"
```

---

### Task 4: Full Verification, Build, and Zotero Acceptance

**Files:**
- Create: `outputs/zotero-context-translator-0.1.4.xpi` through the build script.
- Create outside the source tree: versioned source archive, installation guide, and acceptance report under the main `outputs` directory.

**Interfaces:**
- Consumes: committed 0.1.4 source tree.
- Produces: audited, installable release artifacts and reproducible evidence.

- [ ] **Step 1: Run the complete test suite**

```powershell
& '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test
```

Expected: all tests pass, including performance thresholds.

- [ ] **Step 2: Verify repository hygiene**

Run `git diff --check` and `git status --short`. Expected: no whitespace errors and a clean worktree after commits.

- [ ] **Step 3: Build the XPI**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\build-xpi.ps1' -NodeExecutable '<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
```

Expected: `outputs/zotero-context-translator-0.1.4.xpi` with six runtime entries.

- [ ] **Step 4: Audit the exact package**

Verify manifest version `0.1.4`, add-on ID `zotero-context-translator@local`, exact entry list, SHA-256, and zero test endpoint/API-key/model/paper-title residues.

- [ ] **Step 5: Run isolated Zotero 9.0.6 acceptance**

Install the exact candidate into the isolated profile, open the authorized 21-page paper, select real PDF text, and verify:

```text
translateButtonCount = 1
modeButtonCount = 0
apiCallsBeforeClick = 0
apiCallsAfterClick = 1
buttonDisabledWhileLoading = true
closePasses = 20/20
selectionPreserved = true
```

Check plugin runtime errors, then gracefully exit only the isolated Zotero processes.

- [ ] **Step 6: Deliver versioned artifacts**

Preserve 0.1.3 and copy/create:

```text
outputs/zotero-context-translator-0.1.4.xpi
outputs/zotero-context-translator-0.1.4-source.zip
outputs/Zotero-Context-Translator-0.1.4-安装与使用.md
outputs/Zotero-Context-Translator-0.1.4-验收报告.md
```

Record the final XPI SHA-256 in the acceptance report and verify the delivered copy matches the built candidate.
