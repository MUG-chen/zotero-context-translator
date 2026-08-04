import { OpenAICompatibleClient } from "./api-client.mjs";
import { CacheRepository } from "./cache-repository.mjs";
import { CACHE_VERSION, PLUGIN_ID } from "./constants.mjs";
import { resolveContext } from "./context-resolver.mjs";
import { CredentialStore } from "./credential-store.mjs";
import { FLOATING_WINDOW_CSS, FloatingView } from "./floating-view.mjs";
import { detectHeadings } from "./heading-detector.mjs";
import { inferPaperMetadata } from "./paper-metadata.mjs";
import { buildParagraphs } from "./paragraph-builder.mjs";
import { buildTranslationMessages } from "./prompt-builder.mjs";
import { assignDocumentOrdinals } from "./reading-order.mjs";
import { ReaderAdapter } from "./reader-adapter.mjs";
import {
  buildSectionIndex,
  locateSection,
  mapSelectionToOrdinal,
} from "./section-index.mjs";
import { SelectionState } from "./selection-state.mjs";
import {
  createLoginBackend,
  createLoginInfoFactory,
  createPreferenceBackend,
  createZoteroFileAdapter,
  readPaperMetadata,
} from "./zotero-adapters.mjs";

export function createPlugin(dependencies) {
  return new TranslatorPlugin(dependencies);
}

class TranslatorPlugin {
  constructor(dependencies) {
    this.deps = dependencies;
    this.state = dependencies.state ?? new SelectionState();
    this.started = false;
    this.view = null;
    this.abortController = null;
    this.preferencePaneID = null;
    this.currentSelection = null;
    this.handleReaderEvent = (event) => this.handleSelection(event);
  }

  async startup() {
    if (this.started) return;
    let readerRegistered = false;
    this.started = true;
    try {
      this.deps.readerAdapter.register(this.handleReaderEvent);
      readerRegistered = true;
      this.preferencePaneID = await this.deps.registerPreferences?.();
    } catch (error) {
      if (this.preferencePaneID) {
        this.deps.unregisterPreferences?.(this.preferencePaneID);
        this.preferencePaneID = null;
      }
      if (readerRegistered) this.deps.readerAdapter.unregister();
      this.started = false;
      throw error;
    }
  }

  async shutdown(context = {}) {
    if (!this.started) return;
    this.cancel();
    this.view?.destroy();
    this.view = null;
    this.state.close();
    this.currentSelection = null;
    this.deps.readerAdapter.unregister();
    if (this.preferencePaneID) {
      this.deps.unregisterPreferences?.(this.preferencePaneID);
      this.preferencePaneID = null;
    }
    this.deps.contextIndex.dispose?.();
    if (this.deps.isUninstallReason?.(context.reason)) {
      await this.deps.removeAllCredentials?.();
    }
    this.started = false;
  }

  async handleSelection(event) {
    const selection = this.deps.readerAdapter.extractSelection(event);
    if (!selection?.ok) return selection;

    this.cancel();
    this.view?.destroy();
    this.currentSelection = selection;
    this.state.select(selection);
    this.deps.injectStyles?.(selection.doc);
    this.view = this.deps.viewFactory();
    this.view.mount({
      doc: selection.doc,
      append: selection.append,
      anchorRects: selection.anchorRects ?? selection.rects,
      handlers: {
        translate: () => this.translate("sentence"),
        retry: () => this.retry(),
        copy: (text) => copyText(this.deps, selection, text),
        close: () => this.close(),
      },
    });
    this.view.render(this.state.current);

    Promise.resolve(this.deps.contextIndex.begin(selection)).catch((error) => {
      this.deps.logger?.error?.(error);
    });
    return selection;
  }

  async translate(mode = "sentence") {
    const selection = this.currentSelection;
    if (!selection) return null;
    this.cancel();
    const requestID = this.state.startRequest(mode);
    const controller = new AbortController();
    this.abortController = controller;
    this.view?.render(this.state.current);

    try {
      const settings = await this.deps.getSettings();
      const apiKey =
        settings.apiKey ||
        (await this.deps.credentialStore.getAPIKey(settings.baseURL));
      const rawContext = await this.deps.contextIndex.resolve(selection, {
        maxWaitMs: 15_000,
        signal: controller.signal,
      });
      const context = resolveContext({
        ...rawContext,
        selection: selection.text,
      });
      const messages = buildTranslationMessages(context, {
        mode,
        targetLanguage: settings.targetLanguage ?? "zh-CN",
        includePaperProfile: !context.paperProfile,
      });
      let streamed = "";
      const result = await this.deps.api.streamTranslation(
        {
          baseURL: settings.baseURL,
          apiKey,
          model: settings.model,
          messages,
          signal: controller.signal,
        },
        {
          onProgress: (progress) => {
            if (this.state.updateProgress(requestID, progress)) {
              this.view?.render(this.state.current);
            }
          },
          onDelta: (delta) => {
            if (this.state.current.requestID !== requestID) return;
            streamed += delta;
            const visible = visibleTranslation(streamed);
            if (visible && this.state.updatePartial(requestID, visible)) {
              this.view?.render(this.state.current);
            }
          },
        },
      );

      const accepted = this.state.complete(requestID, result);
      if (accepted) {
        this.view?.render(this.state.current);
        await this.deps.contextIndex.update?.(selection.attachmentID, result);
      }
      return result;
    } catch (error) {
      this.deps.logger?.error?.(error?.cause ?? error);
      if (this.state.fail(requestID, error)) this.view?.render(this.state.current);
      return null;
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  cancel() {
    this.abortController?.abort();
    this.abortController = null;
  }

  retry() {
    if (!this.currentSelection) return null;
    return this.translate(this.state.current.mode ?? "sentence");
  }

  close() {
    this.cancel();
    this.state.close();
    this.currentSelection = null;
    this.view?.destroy();
    this.view = null;
  }

  async getSettings() {
    const settings = await this.deps.getSettings();
    return {
      ...settings,
      apiKey:
        settings.apiKey ||
        (settings.baseURL
          ? await this.deps.credentialStore.getAPIKey(settings.baseURL)
          : ""),
    };
  }

  async saveSettings(settings) {
    return this.deps.saveSettings(settings);
  }

  async testConnection() {
    const settings = await this.getSettings();
    return this.deps.api.testConnection(settings);
  }

  async clearAPIKey(baseURL) {
    return this.deps.credentialStore.clearAPIKey(baseURL);
  }

  async reanalyze() {
    if (!this.currentSelection) return;
    await this.deps.contextIndex.reanalyze?.(this.currentSelection);
  }

  async clearCache() {
    return this.deps.contextIndex.clear?.();
  }
}

export class DocumentContextIndex {
  constructor({
    readerAdapter,
    cache,
    readMetadata,
    getIdentity,
    clearDisposable,
    logger,
  }) {
    this.readerAdapter = readerAdapter;
    this.cache = cache;
    this.readMetadata = readMetadata;
    this.getIdentity = getIdentity;
    this.clearDisposable = clearDisposable;
    this.logger = logger;
    this.entries = new Map();
    this.queue = Promise.resolve();
    this.disposed = false;
  }

  begin(selection, { force = false } = {}) {
    const key = String(selection.attachmentID);
    const existing = this.entries.get(key);
    if (!force && existing) return existing.promise;
    const entry = { status: "pending", record: null, promise: null };
    const analyze = () => this.#analyze(selection);
    const promise = (this.queue = this.queue.catch(() => {}).then(analyze));
    entry.promise = promise.then(
      (record) => {
        entry.status = "ready";
        entry.record = record;
        return record;
      },
      (error) => {
        entry.status = "failed";
        entry.error = error;
        throw error;
      },
    );
    this.entries.set(key, entry);
    return entry.promise;
  }

  async resolve(selection, { maxWaitMs = 15_000, signal } = {}) {
    const key = String(selection.attachmentID);
    let entry = this.entries.get(key);
    if (!entry) {
      this.begin(selection).catch((error) => this.logger?.error?.(error));
      entry = this.entries.get(key);
    }
    if (entry.status === "pending") {
      await waitForIndex(entry.promise, { maxWaitMs, signal });
    }
    if (entry.status === "ready") return contextFromRecord(entry.record, selection);
    throw entry.error ?? new Error("Context index is unavailable");
  }

  async update(attachmentID, result) {
    const entry = this.entries.get(String(attachmentID));
    if (entry?.status !== "ready") return;
    if (result.paperProfile) entry.record.paperProfile = result.paperProfile;
    if (Array.isArray(result.terms) && result.terms.length) {
      entry.record.suggestedTerms = mergeTerms(
        entry.record.suggestedTerms ?? [],
        result.terms,
      );
    }
    entry.record.lastUsed = Date.now();
    await this.cache?.saveDocument(entry.record);
  }

  async reanalyze(selection) {
    const key = String(selection.attachmentID);
    const existing = this.entries.get(key);
    if (existing?.record?.identity) {
      await this.cache?.invalidate(existing.record.identity);
    }
    this.entries.delete(key);
    return this.begin(selection, { force: true });
  }

  async clear() {
    this.entries.clear();
    await this.clearDisposable?.();
  }

  dispose() {
    this.disposed = true;
    this.entries.clear();
  }

  async #analyze(selection) {
    if (this.disposed) throw new Error("Context index is disposed");
    const identity = await stage("identity", () =>
      this.getIdentity(selection.attachmentID),
    );
    const cached = await stage("cache-read", () =>
      this.cache?.loadDocument(identity),
    );
    if (cached) return cached;
    const blocks = assignDocumentOrdinals(
      await stage("pdf-extraction", () =>
        this.readerAdapter.extractDocumentBlocks(selection.reader),
      ),
    );
    const headings = detectHeadings(blocks, []);
    const record = {
      identity,
      metadata: inferPaperMetadata(
        blocks,
        this.readMetadata(selection.attachmentID),
      ),
      blocks,
      sections: buildSectionIndex(blocks, headings),
      paragraphs: buildParagraphs(blocks, headings),
      paperProfile: null,
      suggestedTerms: [],
      confirmedTerms: [],
      lastUsed: Date.now(),
    };
    await stage("cache-write", () => this.cache?.saveDocument(record));
    return record;
  }
}

async function stage(name, action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(
      `Context index ${name} failed: ${String(error?.message ?? error)}`,
      { cause: error },
    );
  }
}

function contextFromRecord(record, selection) {
  const pageBlocks = record.blocks.filter(
    (block) => block.pageIndex === selection.pageIndex,
  );
  const ordinal = mapSelectionToOrdinal(selection.rects, pageBlocks);
  const paragraphs = record.paragraphs ?? buildParagraphs(record.blocks, []);
  const currentIndex = paragraphs.findIndex(
    (paragraph) =>
      ordinal !== null &&
      paragraph.startOrdinal <= ordinal &&
      ordinal < paragraph.endOrdinal,
  );
  const current = currentIndex >= 0 ? paragraphs[currentIndex] : null;
  const near = current
    ? paragraphs
        .slice(Math.max(0, currentIndex - 2), currentIndex + 3)
        .filter((paragraph) => paragraph !== current)
        .map((paragraph) => paragraph.text)
    : [];
  const section = ordinal === null ? null : locateSection(record.sections, ordinal);
  const distant = section
    ? paragraphs
        .filter(
          (paragraph) =>
            paragraph.startOrdinal >= section.startOrdinal &&
            paragraph.startOrdinal < section.endOrdinal &&
            paragraph !== current &&
            Math.abs(paragraph.startOrdinal - ordinal) > 6,
        )
        .slice(0, 6)
        .map((paragraph) => paragraph.text)
    : [];
  return {
    selection: selection.text,
    currentParagraph: current?.text ?? "",
    nearParagraphs: near,
    distantChunks: distant,
    metadata: record.metadata,
    sectionPath: section?.titlePath ?? [],
    confirmedTerms: record.confirmedTerms ?? [],
    paperProfile: record.paperProfile ?? null,
  };
}

function waitForIndex(promise, { maxWaitMs, signal }) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      action(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(
      () => finish(reject, new Error(`Context index timed out after ${maxWaitMs} ms`)),
      maxWaitMs,
    );
    signal?.addEventListener?.("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
}

function abortError() {
  const error = new Error("Context indexing was cancelled");
  error.name = "AbortError";
  return error;
}

function visibleTranslation(raw) {
  const marker = "<<<TRANSLATION>>>";
  const start = raw.indexOf(marker);
  const content = start >= 0 ? raw.slice(start + marker.length) : raw;
  const next = content.search(/<<<(?:EXPLANATION|TERMS_JSON|PAPER_PROFILE_JSON)>>>/);
  return (next >= 0 ? content.slice(0, next) : content).trim();
}

function mergeTerms(existing, incoming) {
  const merged = new Map(existing.map((term) => [term.source, term]));
  for (const term of incoming) {
    if (term?.source && term?.translation) merged.set(term.source, term);
  }
  return [...merged.values()];
}

async function createDefaultDependencies(rootURI) {
  const { nsLoginInfo } = ChromeUtils.importESModule(
    "resource://gre/modules/LoginInfo.sys.mjs",
  );
  const IO = globalThis.IOUtils;
  const Paths = globalThis.PathUtils;
  if (!IO || !Paths) {
    throw new Error("Zotero 9 IOUtils/PathUtils globals are unavailable");
  }
  const loginManager = Cc["@mozilla.org/login-manager;1"].getService(
    Ci.nsILoginManager,
  );
  const preferenceBackend = createPreferenceBackend(Zotero.Prefs);
  const loginBackend = createLoginBackend({
    loginManager,
    createLogin: createLoginInfoFactory(nsLoginInfo),
  });
  const credentialStore = new CredentialStore(loginBackend);
  const fileAdapter = createZoteroFileAdapter({
    IOUtils: IO,
    PathUtils: Paths,
    rootPath: Paths.join(Paths.profileDir, "zotero-context-translator-cache"),
    cloneIntoIO: (value) => Cu.cloneInto(value, Cu.getGlobalForObject(IO)),
  });
  const cache = new CacheRepository(fileAdapter, { cacheVersion: CACHE_VERSION });
  const readerAdapter = new ReaderAdapter({ readerAPI: Zotero.Reader, pluginID: PLUGIN_ID });
  const contextIndex = new DocumentContextIndex({
    readerAdapter,
    cache,
    readMetadata: (attachmentID) => readPaperMetadata(Zotero, attachmentID),
    getIdentity: async (attachmentID) => attachmentIdentity(Zotero, IO, attachmentID),
    clearDisposable: async () => {
      for (const entry of await fileAdapter.list("documents/")) {
        if (entry.kind !== "confirmedTerms") await fileAdapter.remove(entry.path);
      }
    },
    logger: { error: (error) => Zotero.logError(error) },
  });
  const api = new OpenAICompatibleClient();
  const clipboardHelper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper,
  );

  return {
    readerAdapter,
    viewFactory: () => new FloatingView(),
    injectStyles: ensureReaderStylesheet,
    contextIndex,
    api,
    copyText: (text) => clipboardHelper.copyString(String(text)),
    credentialStore,
    logger: { error: (error) => Zotero.logError(error) },
    getSettings: async () => ({
      baseURL: preferenceBackend.get("baseURL", ""),
      model: preferenceBackend.get("model", ""),
      targetLanguage: preferenceBackend.get("targetLanguage", "zh-CN"),
    }),
    saveSettings: async (settings) => {
      preferenceBackend.set("baseURL", String(settings.baseURL ?? "").trim());
      preferenceBackend.set("model", String(settings.model ?? "").trim());
      preferenceBackend.set("targetLanguage", settings.targetLanguage ?? "zh-CN");
      if (settings.apiKey) {
        await credentialStore.setAPIKey(settings.baseURL, settings.apiKey);
      }
    },
    registerPreferences: () =>
      Zotero.PreferencePanes.register({
        pluginID: PLUGIN_ID,
        id: "zotero-context-translator-preferences",
        label: "上下文翻译",
        src: `${rootURI}content/preferences.xhtml`,
        scripts: [`${rootURI}content/preferences.js`],
      }),
    unregisterPreferences: (id) => Zotero.PreferencePanes.unregister(id),
    removeAllCredentials: () => loginBackend.removeAll(),
    isUninstallReason: (reason) => reason === 6,
  };
}

async function attachmentIdentity(zotero, IO, attachmentID) {
  const item = zotero.Items.get(attachmentID);
  const path = await item?.getFilePathAsync?.();
  let fingerprint = String(item?.version ?? 0);
  if (path) {
    const stat = await IO.stat(path);
    fingerprint = `${stat.size}-${Math.floor(stat.lastModified)}`;
  }
  return {
    attachmentKey: String(item?.key ?? attachmentID),
    fingerprint,
  };
}

function ensureReaderStylesheet(doc) {
  if (!doc?.head || doc.getElementById?.("zct-floating-window-styles")) return;
  const style = doc.createElement("style");
  style.id = "zct-floating-window-styles";
  style.textContent = FLOATING_WINDOW_CSS;
  doc.head.append(style);
}

function copyText(dependencies, selection, text) {
  if (typeof dependencies.copyText === "function") {
    return dependencies.copyText(text);
  }
  const clipboard = selection.doc?.defaultView?.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") {
    throw new Error("Clipboard is unavailable");
  }
  return clipboard.writeText(text);
}

let runtime = null;

export const plugin = {
  async startup({ rootURI }) {
    if (runtime) return runtime.startup();
    runtime = createPlugin(await createDefaultDependencies(rootURI));
    return runtime.startup();
  },
  async shutdown(context) {
    if (!runtime) return;
    await runtime.shutdown(context);
    runtime = null;
  },
  handleSelection(event) {
    return runtime?.handleSelection(event);
  },
  translate(mode) {
    return runtime?.translate(mode);
  },
  cancel() {
    return runtime?.cancel();
  },
  reanalyze() {
    return runtime?.reanalyze();
  },
  clearCache() {
    return runtime?.clearCache();
  },
};

export const preferences = {
  getSettings: () => requireRuntime().getSettings(),
  saveSettings: (settings) => requireRuntime().saveSettings(settings),
  testConnection: () => requireRuntime().testConnection(),
  clearAPIKey: (baseURL) => requireRuntime().clearAPIKey(baseURL),
  reanalyze: () => requireRuntime().reanalyze(),
  clearCache: () => requireRuntime().clearCache(),
};

function requireRuntime() {
  if (!runtime) throw new Error("Zotero Context Translator is not running");
  return runtime;
}
