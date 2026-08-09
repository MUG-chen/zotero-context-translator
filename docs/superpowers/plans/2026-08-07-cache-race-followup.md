# Cache Race Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two residual cache races found by the scoped final re-review without changing the accepted drag-origin behavior or public translation flow.

**Architecture:** Treat cache maintenance as part of the save result so a record evicted by its own write cannot become a durable ready entry. Preserve write ordering during reanalysis so an invalidated write completes cleanup before its replacement writes the same identity path.

**Tech Stack:** Zotero 9 bootstrap plugin, JavaScript ES modules, Node.js built-in test runner, PowerShell XPI build script.

## Global Constraints

- A record removed by the cache-limit pass that follows its own save must not remain as a durable ready entry in `DocumentContextIndex.entries`.
- The initiating operation may still use its freshly analyzed record once; the record must not be retained for later cache hits after self-eviction.
- A stale write may never invalidate or delete a newer reanalysis result for the same identity.
- `clear()` and `dispose()` must continue preventing stale work from repopulating memory or disk.
- Existing pointerdown drag-origin behavior, viewport clamping, API URL security policy, bootstrap cleanup, and Zotero 9 compatibility must remain unchanged.
- Final artifact remains version `0.1.8` and must contain no tests, private paths, credentials, paper files, or personal email addresses.

---

### Task 1: Fix Self-Eviction and Reanalysis Write Ordering

**Files:**
- Modify: `tests/document-context-index.test.mjs`
- Modify: `addon/content/modules/plugin.mjs`

**Interfaces:**
- Consumes: `DocumentContextIndex.begin()`, `resolve()`, `reanalyze()`, `#saveRecord()`, `#enforceCacheLimit()`, `CacheRepository.documentPath()` and `enforceLimit()` results.
- Produces: a save outcome that distinguishes retained from self-evicted records, plus ordered replacement writes during reanalysis.

- [ ] **Step 1: Add a failing self-eviction regression test**

Use a real `CacheRepository` and a cache limit smaller than one serialized document. Index one document and assert:

1. the initiating `begin()`/`resolve()` can produce context from the freshly analyzed record;
2. the persisted document file is removed by maintenance;
3. the index does not retain a ready entry for that attachment after settlement;
4. a later request cannot receive the self-evicted record as an in-memory cache hit.

Run the focused test and record RED evidence showing the current entry becomes ready despite its file being removed.

- [ ] **Step 2: Add a failing write-stage reanalysis race test**

Use a controllable cache double that pauses the first `saveDocument()` after it begins. Start initial indexing, invoke `reanalyze()` while the first write is paused, then release operations in an order that would expose an unconditional stale `invalidate()`. Assert that the replacement record remains persisted and is the only ready entry. Record RED evidence showing the stale generation deletes the replacement under the current implementation.

- [ ] **Step 3: Implement the minimal self-eviction fix**

Return cache-maintenance information from `#enforceCacheLimit()`/`#saveRecord()` and propagate whether the just-written path survived. When the record self-evicts, allow the initiating promise to return the record but do not transition the entry into durable `ready` state or leave it in `entries`. Update `resolve()` only as needed so a caller already waiting on that promise can use the one-time record.

Do not put transient fields into the serialized cache record.

- [ ] **Step 4: Implement ordered reanalysis writes**

Do not let replacement analysis bypass the queue containing the invalidated write. Ensure stale post-write cleanup settles before replacement `saveDocument()` for the same identity can run. Preserve abort/generation checks and avoid unconditional invalidation of a path that may already hold a newer generation.

- [ ] **Step 5: Run focused and dependent tests**

Use bundled Node and run:

```powershell
node --test tests/document-context-index.test.mjs tests/cache-repository.test.mjs tests/plugin.test.mjs
```

Expected: all tests pass, including self-eviction, paused-write reanalysis, clear, dispose, and existing context construction behavior.

- [ ] **Step 6: Commit**

```powershell
git add -- addon/content/modules/plugin.mjs tests/document-context-index.test.mjs
git -c user.name="MUG-chen" -c user.email="88625388+MUG-chen@users.noreply.github.com" commit -m "fix: close cache lifecycle races"
```

---

### Task 2: Verify and Rebuild 0.1.8

**Files:**
- Build: `outputs/zotero-context-translator-0.1.8.xpi`

**Interfaces:**
- Consumes: corrected branch head and `scripts/build-xpi.ps1`.
- Produces: audited installable Zotero 9 XPI version `0.1.8`.

- [ ] **Step 1: Run the complete suite**

Run `npm test` with bundled Node. Expected: zero failures and all performance thresholds pass.

- [ ] **Step 2: Build and audit the XPI**

Build with `scripts/build-xpi.ps1` and bundled Node. Verify the six expected archive entries, manifest version `0.1.8`, no forbidden/sensitive content, and record size and SHA-256.

- [ ] **Step 3: Verify repository state**

Run `git diff --check`, `git status --short --branch`, and inspect the latest commits. Do not push, merge, or alter the user's existing GitHub Release.
