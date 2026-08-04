var ZoteroContextTranslatorPreferences = {
  initialized: false,
  initializing: null,

  async init() {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize();
    try {
      await this.initializing;
      this.initialized = true;
    } finally {
      this.initializing = null;
    }
  },

  async initialize() {
    this.bridge = Zotero.ZoteroContextTranslator.preferences;
    const settings = await this.bridge.getSettings();
    this.element("zct-base-url").value = settings.baseURL ?? "";
    this.element("zct-api-key").value = settings.apiKey ?? "";
    this.element("zct-model").value = settings.model ?? "";
    this.element("zct-target-language").value = settings.targetLanguage ?? "zh-CN";
    this.bind("zct-save-settings", () => this.save());
    this.bind("zct-test-connection", () => this.testConnection());
    this.bind("zct-clear-key", () => this.clearKey());
    this.bind("zct-reanalyze", () => this.run("正在重新分析…", () => this.bridge.reanalyze()));
    this.bind("zct-clear-cache", () => this.run("正在清理…", () => this.bridge.clearCache()));
  },

  element(id) {
    return document.getElementById(id);
  },

  bind(id, listener) {
    this.element(id).addEventListener("click", listener);
  },

  values() {
    return {
      baseURL: this.element("zct-base-url").value.trim(),
      apiKey: this.element("zct-api-key").value,
      model: this.element("zct-model").value.trim(),
      targetLanguage: this.element("zct-target-language").value,
    };
  },

  async save() {
    await this.run("正在保存…", async () => {
      await this.bridge.saveSettings(this.values());
      return "设置已保存";
    });
  },

  async testConnection() {
    await this.run("正在发送最小测试请求…", async () => {
      await this.bridge.saveSettings(this.values());
      const result = await this.bridge.testConnection();
      return `连接成功（${result.latencyMs} ms）`;
    });
  },

  async clearKey() {
    await this.run("正在清除…", async () => {
      await this.bridge.clearAPIKey(this.element("zct-base-url").value.trim());
      this.element("zct-api-key").value = "";
      return "API Key 已清除";
    });
  },

  async run(pending, operation) {
    const status = this.element("zct-preference-status");
    status.textContent = pending;
    try {
      status.textContent = (await operation()) || "完成";
    } catch (error) {
      status.textContent = `失败：${error.message}`;
    }
  },
};

document.addEventListener(
  "showing",
  (event) => {
    if (event.target?.id !== "zct-preferences") return;
    return ZoteroContextTranslatorPreferences.init().catch((error) => {
      const status = document.getElementById("zct-preference-status");
      if (status) status.textContent = `初始化失败：${error.message}`;
      Zotero.logError(error);
    });
  },
  true,
);
