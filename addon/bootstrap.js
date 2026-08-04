let chromeHandle = null;
let pluginInstance = null;
let moduleScope = null;

async function startup({ rootURI }, reason) {
  const addonManagerStartup = Cc[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Ci.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(`${rootURI}manifest.json`);

  chromeHandle = addonManagerStartup.registerChrome(manifestURI, [
    ["content", "zotero-context-translator", "content/"],
  ]);

  try {
    const platformWindow = Services.wm.getMostRecentWindow("navigator:browser");
    if (!platformWindow) throw new Error("Zotero main window is unavailable");
    moduleScope = {
      Zotero,
      Services,
      Cc,
      Ci,
      Cu,
      ChromeUtils,
      IOUtils,
      PathUtils,
      fetch: (...args) => platformWindow.fetch(...args),
      AbortController: platformWindow.AbortController,
      URL: platformWindow.URL,
      setTimeout: (...args) => platformWindow.setTimeout(...args),
      clearTimeout: (...args) => platformWindow.clearTimeout(...args),
      TextDecoder: platformWindow.TextDecoder,
      Uint8Array: platformWindow.Uint8Array,
      crypto: platformWindow.crypto,
    };
    Services.scriptloader.loadSubScript(
      "chrome://zotero-context-translator/content/plugin-bundle.js",
      moduleScope,
    );
    const runtimeExports = moduleScope.ZoteroContextTranslator;
    if (!runtimeExports?.plugin || !runtimeExports?.preferences) {
      throw new Error("Plugin bundle did not expose its runtime exports");
    }
    pluginInstance = runtimeExports.plugin;
    Zotero.ZoteroContextTranslator = runtimeExports;

    await Zotero.initializationPromise;
    await pluginInstance.startup({ rootURI, reason });
  } catch (error) {
    try {
      await pluginInstance?.shutdown?.({ reason });
    } catch (shutdownError) {
      Zotero.logError?.(shutdownError);
    }
    delete Zotero.ZoteroContextTranslator;
    pluginInstance = null;
    moduleScope = null;
    chromeHandle?.destruct();
    chromeHandle = null;
    throw error;
  }
}

async function shutdown(_context, reason) {
  if (pluginInstance) {
    await pluginInstance.shutdown({ reason });
    pluginInstance = null;
  }
  delete Zotero.ZoteroContextTranslator;
  moduleScope = null;
  chromeHandle?.destruct();
  chromeHandle = null;
}

function install() {}

function uninstall() {}
