var chromeHandle;

var Services = globalThis.Services;
if (!Services) {
  try {
    Services = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
  } catch (_) {
    Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
  }
}

function install() {}

async function startup({ rootURI }) {
  const startupService = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = startupService.registerChrome(manifestURI, [
    ["content", "zotagent", rootURI + "content/"],
  ]);

  const context = { rootURI, Services };
  context._globalThis = context;
  Services.scriptloader.loadSubScript(
    rootURI + "content/zot-agent.js",
    context,
  );
  Services.scriptloader.loadSubScript(
    rootURI + "content/preferences.js",
    context,
  );
  await Zotero.ZotAgent.hooks.onStartup();
}

async function onMainWindowLoad({ window }) {
  await Zotero.ZotAgent?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }) {
  await Zotero.ZotAgent?.hooks.onMainWindowUnload(window);
}

async function shutdown(_data, reason) {
  if (reason === APP_SHUTDOWN) return;
  await Zotero.ZotAgent?.hooks.onShutdown();
  delete Zotero.ZotAgent;
  chromeHandle?.destruct();
  chromeHandle = null;
}

function uninstall() {}
