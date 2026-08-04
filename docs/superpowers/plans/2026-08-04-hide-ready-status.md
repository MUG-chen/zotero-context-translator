# Hide Ready Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the redundant ready-state status row while retaining translation progress, completion, and error feedback.

**Architecture:** Expose the existing `.zct-status-row` node from `populateDialog()` and let `FloatingView.render()` hide it only when `status === "ready"`. No API, prompt, cache, or Reader behavior changes.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, fake DOM unit harness, Zotero 9 bootstrap add-on, PowerShell XPI build.

## Global Constraints

- Keep one explicit `翻译` button and zero mode buttons.
- Selecting text must not call the API.
- Hide the entire ready status row without reserving space.
- Show existing loading, result, and error statuses.
- Ship as `0.1.5` and preserve earlier artifacts.

---

### Task 1: Ready-State Visibility

**Files:**
- Modify: `tests/floating-view.test.mjs`
- Modify: `addon/content/modules/floating-view.mjs`

**Interfaces:**
- Consumes: `FloatingView.render({ status })`.
- Produces: `.zct-status-row.hidden === true` only for `ready`.

- [ ] Add a failing test that mounts the card, asserts the ready row is hidden, then renders `loading`, `result`, and `error` and asserts the row is visible.
- [ ] Run `node --test tests/floating-view.test.mjs`; verify failure because the ready row is visible.
- [ ] Return `statusRow` from `populateDialog()` and set `this.#nodes.statusRow.hidden = current.status === "ready"` in `render()`.
- [ ] Re-run the focused suite and verify every view test passes.
- [ ] Commit `addon/content/modules/floating-view.mjs` and `tests/floating-view.test.mjs` with `fix: hide redundant ready status`.

### Task 2: Release Metadata

**Files:**
- Modify: `tests/manifest.test.mjs`
- Modify: `package.json`
- Modify: `addon/manifest.json`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`

**Interfaces:**
- Produces: matching version `0.1.5` and documented acceptance behavior.

- [ ] Change the manifest test expectations to `0.1.5` and verify it fails against `0.1.4`.
- [ ] Update both metadata files to `0.1.5`.
- [ ] Document that the initial static status row is hidden but request states remain visible.
- [ ] Re-run the manifest test and verify it passes.
- [ ] Commit with `chore: prepare 0.1.5 status cleanup release`.

### Task 3: Verification and Delivery

**Files:**
- Create: `outputs/zotero-context-translator-0.1.5.xpi` through the build script.
- Create: versioned source archive, guide, and acceptance report in the main `outputs` directory.

**Interfaces:**
- Produces: audited 0.1.5 artifacts.

- [ ] Run the complete Node test suite and performance tests.
- [ ] Run `git diff --check` and confirm a clean worktree.
- [ ] Build the XPI and audit six entries, version, add-on ID, SHA-256, and zero sensitive residues.
- [ ] Install the exact XPI in isolated Zotero 9.0.6 and verify: ready row hidden, loading/result row visible, one translate button, zero mode buttons, no API call before click, one request after click, selection preserved, close works.
- [ ] Gracefully stop isolated Zotero and the local mock API.
- [ ] Deliver the XPI, source ZIP, installation guide, and acceptance report without overwriting 0.1.4.
