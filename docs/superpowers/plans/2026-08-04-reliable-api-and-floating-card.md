# Reliable API and Floating Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release Zotero Context Translator 0.1.2 with phased stream timeouts, safe transient retries, actionable Chinese error states, a polished academic-reading card, and a reliable first-click close interaction.

**Architecture:** A focused request-watchdog module owns first-model-event and idle-stream deadlines, while the API client owns retry policy and emits sanitized progress events. Selection state retains mode, progress, and partial translation; the plugin connects that state to a presentation-only floating card whose interactive controls detach only after their click completes or after a real drag begins.

**Tech Stack:** Zotero 9 bootstrap extension, JavaScript ES modules bundled by esbuild, XUL preference fragment, native Fetch/ReadableStream/SSE, Node.js 22+ `node:test`, PowerShell XPI builder.

## Global Constraints

- Support Zotero 9.0 through 9.0.* only.
- Keep plugin ID `zotero-context-translator@local`, preference keys, Login Manager realm, and cache version unchanged.
- Keep OpenAI Chat Completions compatibility; do not inject DeepSeek-only request parameters.
- First valid model event deadline is 90,000 ms; after that, idle stream deadline is 45,000 ms with no absolute total deadline.
- Retry only before the first model event, at most two retries (three total attempts).
- Never log or render API keys, request bodies, paper context, or credential-bearing URLs.
- Preserve the PDF selection, use one floating window, and never inject a fixed sidebar.
- Add no runtime dependency, remote font, telemetry, or paid external acceptance request.

---

## File Map

- Create `addon/content/modules/request-watchdog.mjs`: phased abort signal and timeout classification only.
- Modify `addon/content/modules/api-client.mjs`: transient retry policy, progress events, Retry-After parsing, and watchdog integration.
- Modify `addon/content/modules/sse.mjs`: preserve the distinction between comments and parsed model events without exposing comment text.
- Modify `addon/content/modules/selection-state.mjs`: request mode, progress, attempt, and partial translation state.
- Modify `addon/content/modules/plugin.mjs`: progress forwarding, partial-state persistence, copy/retry handlers, and last-mode retry.
- Modify `addon/content/modules/floating-view.mjs`: academic-reading-card DOM/CSS and reliable close/detach/drag behavior.
- Modify `tests/helpers/fake-dom.mjs`: SVG creation and the minimal DOM properties used by the real view.
- Modify `tests/api-client.test.mjs`, `tests/sse.test.mjs`, `tests/selection-state.test.mjs`, `tests/plugin.test.mjs`, `tests/floating-view.test.mjs`, and `tests/stability.test.mjs`: observable behavior regressions.
- Modify `package.json`, `addon/manifest.json`, `addon/content/modules/constants.mjs`, `tests/manifest.test.mjs`, `docs/INSTALL.md`, and `docs/ACCEPTANCE.md`: 0.1.2 release metadata and acceptance contract.

---

### Task 1: Phased deadlines and transient API recovery

**Files:**
- Create: `addon/content/modules/request-watchdog.mjs`
- Modify: `addon/content/modules/api-client.mjs`
- Modify: `addon/content/modules/sse.mjs`
- Test: `tests/api-client.test.mjs`
- Test: `tests/sse.test.mjs`

**Interfaces:**
- Produces: `createRequestWatchdog({ parentSignal, firstEventMs, idleMs, setTimer, clearTimer })` returning `{ signal, timeoutKind, noteNetworkActivity(), noteModelEvent(), dispose() }`.
- Produces: `OpenAICompatibleClient.streamTranslation(request, { onDelta, onProgress })`, where progress is one of `{ phase: "waiting"|"retrying"|"reasoning"|"streaming", attempt, maxAttempts, status? }`.
- Preserves: `testConnection()` request shape and one-token behavior.

Add this literal request fixture near the top of `tests/api-client.test.mjs` and use the existing `startFakeOpenAIServer` helper for every network case:

```js
function requestFor(baseURL, signal) {
  return {
    baseURL,
    apiKey: "secret",
    model: "test-model",
    messages: [{ role: "user", content: "translate" }],
    signal,
  };
}
```

- [ ] **Step 1: Add failing first-event and active-stream deadline tests**

Add tests that use short injected values rather than waiting 90 seconds:

```js
test("times out when only SSE keep-alive comments arrive before the first model event", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    const timer = setInterval(() => response.write(": keep-alive\n\n"), 4);
    response.on("close", () => clearInterval(timer));
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ firstEventTimeoutMs: 20, idleTimeoutMs: 20 });

  await assert.rejects(
    client.streamTranslation(requestFor(server.baseURL)),
    (error) => error.code === "FIRST_EVENT_TIMEOUT",
  );
});

test("allows a stream to outlive the first-event deadline while model events stay active", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    const parts = ["一", "段", "译", "文"];
    const emit = (index) => {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[index] } }] })}\n\n`);
      if (index + 1 < parts.length) setTimeout(() => emit(index + 1), 12);
      else response.end("data: [DONE]\n\n");
    };
    emit(0);
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ firstEventTimeoutMs: 15, idleTimeoutMs: 18 });

  const result = await client.streamTranslation(requestFor(server.baseURL));

  assert.equal(result.translation, "一段译文");
});
```

- [ ] **Step 2: Run the deadline tests and verify RED**

Run: `node --test --test-name-pattern="first-event|outlive" tests/api-client.test.mjs`

Expected: FAIL because the constructor does not accept phased deadline options and the current 60-second total timer has no `FIRST_EVENT_TIMEOUT` classification.

- [ ] **Step 3: Implement the request watchdog and wire it through streaming reads**

Implement a watchdog with these exact state transitions:

```js
const watchdog = createRequestWatchdog({
  parentSignal: signal,
  firstEventMs: this.firstEventTimeoutMs,
  idleMs: this.idleTimeoutMs,
  setTimer: this.setTimer,
  clearTimer: this.clearTimer,
});

// After reader.read() yields bytes:
watchdog.noteNetworkActivity();
// After SSEDecoder yields a parsed JSON event, including reasoning-only events:
watchdog.noteModelEvent();
```

`noteNetworkActivity()` must reset a timer only after the first model event. `noteModelEvent()` switches from the first-event timer to the idle timer. `dispose()` removes the parent abort listener and clears exactly one active timer.

- [ ] **Step 4: Run the deadline tests and verify GREEN**

Run: `node --test --test-name-pattern="first-event|outlive" tests/api-client.test.mjs`

Expected: both tests PASS with no unhandled rejection or open-handle warning.

- [ ] **Step 5: Add failing retry-policy and progress tests**

Replace the old “does not retry a server failure” expectation with behavior tests:

```js
test("recovers from two transient 503 responses before model output", async (t) => {
  const progress = [];
  const server = await startFakeOpenAIServer(({ response, requestNumber }) => {
    if (requestNumber < 3) return sendJSON(response, 503, { error: { message: "busy" } });
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: "恢复后的译文" } }] })}\n\ndata: [DONE]\n\n`);
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ sleep: async () => {} });

  const result = await client.streamTranslation(
    requestFor(server.baseURL),
    { onProgress: (event) => progress.push(event) },
  );

  assert.equal(result.translation, "恢复后的译文");
  assert.equal(server.requests.length, 3);
  assert.deepEqual(
    progress.filter((event) => event.phase === "retrying").map((event) => [event.attempt, event.status]),
    [[2, 503], [3, 503]],
  );
});

test("does not retry a broken stream after a model event", async (t) => {
  const server = await startFakeOpenAIServer(({ response }) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "部分译文" } }] })}\n\n`);
    setTimeout(() => response.destroy(), 5);
  });
  t.after(() => server.close());
  const client = new OpenAICompatibleClient({ sleep: async () => {} });

  await assert.rejects(client.streamTranslation(requestFor(server.baseURL)));
  assert.equal(server.requests.length, 1);
});
```

Add separate cases for 502, 504, pre-response network failure, 429 numeric/HTTP-date `Retry-After`, authentication, user cancellation, and first-event timeout.

- [ ] **Step 6: Run retry tests and verify RED**

Run: `node --test --test-name-pattern="503|502|504|Retry-After|broken stream|network failure" tests/api-client.test.mjs`

Expected: FAIL because 5xx currently stops after one request and no progress events are emitted.

- [ ] **Step 7: Implement minimal retry classification**

Use three attempts and retry only while `modelEventSeen === false`. Parse `Retry-After` as seconds first, then as an HTTP date, and reject waits over 15,000 ms. Emit `retrying` before sleeping with the next one-based attempt number. Add `attempt` and `maxAttempts` to the final safe error object.

- [ ] **Step 8: Run API and SSE tests and verify GREEN**

Run: `node --test tests/api-client.test.mjs tests/sse.test.mjs`

Expected: all API/SSE tests PASS, including authentication, cancellation, cross-realm chunks, and connection test.

- [ ] **Step 9: Commit Task 1**

```bash
git add addon/content/modules/request-watchdog.mjs addon/content/modules/api-client.mjs addon/content/modules/sse.mjs tests/api-client.test.mjs tests/sse.test.mjs
git commit -m "fix: make streaming requests resilient"
```

---

### Task 2: Persist progress, partial output, and manual retry

**Files:**
- Modify: `addon/content/modules/selection-state.mjs`
- Modify: `addon/content/modules/plugin.mjs`
- Test: `tests/selection-state.test.mjs`
- Test: `tests/plugin.test.mjs`

**Interfaces:**
- Consumes: API `onProgress` events from Task 1.
- Produces: `SelectionState.startRequest(mode)`, `updateProgress(requestID, progress)`, and `updatePartial(requestID, translation)`.
- Produces: `TranslatorPlugin.retry()` through the existing floating view handler map.

- [ ] **Step 1: Write failing state tests**

```js
test("preserves partial translation and safe progress when a stream fails", () => {
  const state = new SelectionState();
  state.select(snapshot("selected sentence"));
  const requestID = state.startRequest("sentence");
  state.updateProgress(requestID, { phase: "streaming", attempt: 1, maxAttempts: 3 });
  state.updatePartial(requestID, "已经收到的译文");

  state.fail(requestID, Object.assign(new Error("流式响应中断"), { status: 200, attempt: 1 }));

  assert.equal(state.current.status, "error");
  assert.equal(state.current.mode, "sentence");
  assert.equal(state.current.translation, "已经收到的译文");
  assert.equal(state.current.progress.phase, "streaming");
});
```

- [ ] **Step 2: Run the state test and verify RED**

Run: `node --test --test-name-pattern="partial translation" tests/selection-state.test.mjs`

Expected: FAIL because `startRequest` accepts no mode and partial/progress mutators do not exist.

- [ ] **Step 3: Implement request-scoped progress and partial state**

All mutators must return `false` for stale request IDs. `startRequest(mode)` clears prior output and stores the requested mode. `fail()` keeps `translation`, `mode`, and `progress` while recording the new error.

- [ ] **Step 4: Run selection-state tests and verify GREEN**

Run: `node --test tests/selection-state.test.mjs`

Expected: all state transition and stale-response tests PASS.

- [ ] **Step 5: Write failing plugin progress/retry tests**

```js
test("manual retry reuses the current selection and last translation mode", async () => {
  let attempts = 0;
  const { deps, view } = makeDeps({
    api: {
      async streamTranslation() {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return { translation: "重试译文" };
      },
      async testConnection() { return { ok: true }; },
    },
  });
  const plugin = createPlugin(deps);
  await plugin.handleSelection(selection());
  await plugin.translate("paragraph");
  await view.mountOptions.handlers.retry();

  assert.equal(attempts, 2);
  assert.equal(plugin.state.current.mode, "paragraph");
  assert.equal(plugin.state.current.translation, "重试译文");
});

test("renders API retry progress without replacing the floating window", async () => {
  const { deps, view } = makeDeps({
    api: {
      async streamTranslation(request, callbacks) {
        callbacks.onProgress({ phase: "retrying", attempt: 2, maxAttempts: 3, status: 503 });
        return { translation: "译文" };
      },
      async testConnection() { return { ok: true }; },
    },
  });
  const plugin = createPlugin(deps);
  await plugin.handleSelection(selection());
  await plugin.translate("sentence");

  assert.ok(view.states.some((state) => state.progress?.phase === "retrying"));
});
```

- [ ] **Step 6: Run plugin tests and verify RED**

Run: `node --test --test-name-pattern="manual retry|retry progress" tests/plugin.test.mjs`

Expected: FAIL because the plugin exposes no retry handler and only keeps streamed text in a local variable.

- [ ] **Step 7: Wire progress, partial output, copy, and retry**

In `translate(mode)`, call `state.startRequest(mode)`. On API progress call `state.updateProgress()` and render the same view. On each visible delta call `state.updatePartial()` before rendering. Mount handlers must include:

```js
handlers: {
  translate: (mode) => this.translate(mode),
  retry: () => this.retry(),
  copy: (text) => selection.doc.defaultView.navigator.clipboard.writeText(text),
  close: () => this.close(),
}
```

`retry()` reads `this.state.current.mode ?? "sentence"` and calls `translate(mode)` without remounting.

- [ ] **Step 8: Run state and plugin tests and verify GREEN**

Run: `node --test tests/selection-state.test.mjs tests/plugin.test.mjs`

Expected: all tests PASS and an older request cannot update progress, partial text, or result.

- [ ] **Step 9: Commit Task 2**

```bash
git add addon/content/modules/selection-state.mjs addon/content/modules/plugin.mjs tests/selection-state.test.mjs tests/plugin.test.mjs
git commit -m "feat: expose translation progress and retry"
```

---

### Task 3: Build the academic-reading card and repair close/detach behavior

**Files:**
- Modify: `addon/content/modules/floating-view.mjs`
- Modify: `tests/helpers/fake-dom.mjs`
- Test: `tests/floating-view.test.mjs`
- Test: `tests/stability.test.mjs`

**Interfaces:**
- Consumes: state `{ status, selection, mode, translation, explanation, error, progress }` from Task 2.
- Consumes handlers `{ translate(mode), retry(), copy(text), close() }`.
- Preserves `mount()`, `render()`, `destroy()`, one-root lifecycle, and no-sidebar behavior.

- [ ] **Step 1: Write failing first-click close and detach-order tests**

```js
test("first close click in the native popup closes without detaching the dialog", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: { close: () => calls.push("close") },
  });
  const close = root.querySelector(".zct-close");

  close.dispatchEvent(event("pointerdown", { pointerId: 1 }));
  assert.equal(root.parentNode, host);
  close.dispatchEvent(event("click"));

  assert.deepEqual(calls, ["close"]);
});

test("a mode action fires before the same dialog detaches", () => {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  doc.body.append(host);
  const order = [];
  const view = new FloatingView();
  let root;
  root = view.mount({
    doc,
    append: (node) => host.append(node),
    handlers: {
      translate: () => order.push(root.parentNode === host ? "translate-embedded" : "translate-detached"),
    },
  });
  root.querySelector('[data-mode="sentence"]').dispatchEvent(event("click"));

  assert.deepEqual(order, ["translate-embedded"]);
  assert.equal(root.parentNode, doc.body);
});
```

Repeat the close sequence 20 times with fresh views and require 20 close calls:

```js
test("closes on the first click in 20 fresh embedded dialogs", () => {
  let closes = 0;
  for (let index = 0; index < 20; index += 1) {
    const doc = new FakeDocument();
    const host = doc.createElement("div");
    doc.body.append(host);
    const view = new FloatingView();
    const root = view.mount({
      doc,
      append: (node) => host.append(node),
      handlers: { close: () => { closes += 1; view.destroy(); } },
    });
    root.querySelector(".zct-close").dispatchEvent(event("click"));
    assert.equal(doc.querySelectorAll('[role="dialog"]').length, 0);
  }
  assert.equal(closes, 20);
});
```

- [ ] **Step 2: Run interaction tests and verify RED**

Run: `node --test --test-name-pattern="first close|fires before|20 first" tests/floating-view.test.mjs`

Expected: at least the detach-order assertion FAILS because root `pointerdown` currently moves the dialog before `click`.

- [ ] **Step 3: Implement click-safe detach and drag threshold**

Remove the root-wide detach listener. Mode buttons call `translate` first and `#detachFromHost()` second. Titlebar pointerdown stores a pending drag; pointermove below 4 px does nothing, while the first move at or above 4 px detaches, captures the current rectangle, and begins clamped movement. Close never calls detach.

- [ ] **Step 4: Run close/detach/drag tests and verify GREEN**

Run: `node --test --test-name-pattern="close|detach|drag" tests/floating-view.test.mjs`

Expected: all close, Escape, Reader pagehide, detach, and drag tests PASS.

- [ ] **Step 5: Write failing layout, expand, copy, retry, and accessibility tests**

```js
test("renders a structured academic card instead of one undifferentiated result block", () => {
  const doc = new FakeDocument();
  const view = new FloatingView();
  const root = view.mount({ doc, anchorRects: [], handlers: {} });
  view.render({
    status: "result",
    mode: "sentence",
    selection: { text: "A long academic source sentence" },
    translation: "主要译文",
    explanation: "语境说明",
  });

  assert.equal(root.querySelector(".zct-translation").textContent, "主要译文");
  assert.equal(root.querySelector(".zct-explanation").textContent, "语境说明");
  assert.equal(root.querySelector('[data-mode="sentence"]').getAttribute("aria-pressed"), "true");
  assert.ok(root.querySelector(".zct-source-toggle"));
  assert.ok(root.querySelector(".zct-copy"));
});

test("error card retries and reports sanitized HTTP metadata", () => {
  const doc = new FakeDocument();
  const calls = [];
  const view = new FloatingView();
  const root = view.mount({
    doc,
    anchorRects: [],
    handlers: { retry: () => calls.push("retry") },
  });
  view.render({
    status: "error",
    mode: "paragraph",
    error: Object.assign(new Error("The API service is temporarily unavailable"), { status: 503, attempt: 3, maxAttempts: 3 }),
  });

  assert.match(root.querySelector(".zct-error-title").textContent, /服务暂时繁忙/);
  assert.match(root.querySelector(".zct-error-detail").textContent, /HTTP 503.*3/);
  root.querySelector(".zct-retry").dispatchEvent(event("click"));
  assert.deepEqual(calls, ["retry"]);
});
```

- [ ] **Step 6: Run card tests and verify RED**

Run: `node --test --test-name-pattern="structured academic card|error card|source preview|copy" tests/floating-view.test.mjs`

Expected: FAIL because translation/explanation/error regions and controls do not exist.

- [ ] **Step 7: Implement semantic DOM and visual tokens**

Use CSS custom properties for light/dark colors, a 440 px responsive card, 14 px radius, fixed header/mode/footer, and a scrollable content body. Create the close icon with `createElementNS("http://www.w3.org/2000/svg", "svg")`, a `viewBox="0 0 20 20"`, and two stroked paths. Give buttons at least 36 px pointer targets and visible focus rings.

`render()` must update existing nodes rather than replace the root. The source toggle changes `aria-expanded`; copy calls `handlers.copy(current.translation)` and briefly displays “已复制”; retry calls `handlers.retry()`.

- [ ] **Step 8: Run view and stability tests and verify GREEN**

Run: `node --test tests/floating-view.test.mjs tests/stability.test.mjs`

Expected: all tests PASS; 100 lifecycle iterations leave one current view during use and zero listeners after destroy.

- [ ] **Step 9: Commit Task 3**

```bash
git add addon/content/modules/floating-view.mjs tests/helpers/fake-dom.mjs tests/floating-view.test.mjs tests/stability.test.mjs
git commit -m "feat: redesign the translation floating card"
```

---

### Task 4: Release metadata and acceptance contract

**Files:**
- Modify: `package.json`
- Modify: `addon/manifest.json`
- Modify: `addon/content/modules/constants.mjs`
- Modify: `tests/manifest.test.mjs`
- Modify: `docs/INSTALL.md`
- Modify: `docs/ACCEPTANCE.md`

**Interfaces:**
- Produces: version `0.1.2` in every runtime/build metadata source.
- Preserves: plugin ID and Zotero compatibility range.

- [ ] **Step 1: Change the manifest test to require 0.1.2 and verify RED**

```js
assert.equal(manifest.version, "0.1.2");
```

Run: `node --test tests/manifest.test.mjs`

Expected: FAIL with actual version `0.1.1`.

- [ ] **Step 2: Bump all version sources to 0.1.2**

Change `package.json`, `addon/manifest.json`, and `PLUGIN_VERSION` in `constants.mjs` to `0.1.2`. Do not change the application ID, preference prefix, or cache version.

- [ ] **Step 3: Update human documentation**

Document the 90-second first-model deadline, 45-second active-stream idle deadline, safe retries, first-click close repair, academic card controls, and direct 0.1.1-to-0.1.2 upgrade preserving settings/key/cache. Add the real first-click-close and slow-stream scenarios to `docs/ACCEPTANCE.md`.

- [ ] **Step 4: Run metadata and full automated tests**

Run: `node --test`

Expected: all tests PASS, zero failures, zero skipped tests.

- [ ] **Step 5: Commit Task 4**

```bash
git add package.json addon/manifest.json addon/content/modules/constants.mjs tests/manifest.test.mjs docs/INSTALL.md docs/ACCEPTANCE.md
git commit -m "chore: prepare 0.1.2 release"
```

---

### Task 5: Build, package audit, and Zotero 9.0.6 acceptance

**Files:**
- Generated: `outputs/zotero-context-translator-0.1.2.xpi`
- Generated outside Git: isolated Zotero probe results and final acceptance report in the workspace `outputs/` directory.

**Interfaces:**
- Consumes: release-ready commit from Tasks 1–4.
- Produces: audited XPI, installation guide copy, source archive, screenshots, and acceptance evidence.

- [ ] **Step 1: Run fresh full verification**

Run: `node --test`

Expected: all tests PASS. Record test count, duration, 30/100-page indexing values, cached section P95, and context construction P95 from this exact run.

- [ ] **Step 2: Build the XPI**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-xpi.ps1 -NodeExecutable "<workspace>/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"`

Expected: `outputs/zotero-context-translator-0.1.2.xpi` and exactly these six entries:

```text
bootstrap.js
manifest.json
prefs.js
content/plugin-bundle.js
content/preferences.js
content/preferences.xhtml
```

- [ ] **Step 3: Audit package contents**

Verify manifest version `0.1.2`, forward-slash paths, no unexpected entries, and no occurrence of test API keys, localhost mock address, authorized paper title, source PDF path, cache JSON, or user profile path. Record SHA-256 and byte size.

- [ ] **Step 4: Install in an isolated Zotero 9.0.6 profile and run network probes**

Use a local loopback OpenAI-compatible server to exercise:

1. Two HTTP 503 responses followed by a successful SSE translation; assert one window, attempt indicator reaches 3, final translation appears.
2. Keep-alive-only stream with shortened injected acceptance timing; assert Chinese timeout card and manual retry button.
3. Active stream whose total duration exceeds its first-event threshold; assert it completes without total-timeout failure.
4. Stream interruption after partial content; assert partial translation stays visible and no automatic second request occurs.

- [ ] **Step 5: Run real Reader interaction and visual acceptance**

Open the authorized paper through a linked attachment and dispatch selection through the Reader iframe `customEvent` path. Verify:

- First-click close succeeds 20/20 times while initially embedded.
- Selecting a mode preserves the selection and leaves one detachable floating card.
- Translation and explanation occupy separate regions; source expands/collapses; copy feedback appears.
- Light, dark, and narrow viewport screenshots have no clipped controls, overlapping text, or fixed-sidebar injection.
- Mount/render P95 remains below the existing release threshold and 100 lifecycle iterations leak no listener or view.

- [ ] **Step 6: Request independent code review and resolve findings**

Review the complete range from the 0.1.1 release commit through the 0.1.2 release candidate. Fix every Critical and Important production issue, rerun affected tests, then rerun the full suite.

- [ ] **Step 7: Create final deliverables**

Copy the final XPI and install guide to the workspace `outputs/`, create `zotero-context-translator-0.1.2-source.zip` from Git HEAD, and write `Zotero-Context-Translator-0.1.2-验收报告.md` with root causes, automated evidence, real Zotero evidence, screenshots, package audit, limitations, commit, size, and SHA-256.

- [ ] **Step 8: Final working-tree and artifact verification**

Run `git diff --check`, confirm the feature worktree is clean, verify every delivered file hash, and open the report/install guide as UTF-8 to ensure there is no mojibake or unreplaced placeholder.
