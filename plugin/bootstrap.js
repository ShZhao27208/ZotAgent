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

async function startup({ rootURI, version }) {
  if (Zotero.ZotAgent?.hooks?.onShutdown) {
    try { await Zotero.ZotAgent.hooks.onShutdown(); } catch (_) {}
  }
  const startupService = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = startupService.registerChrome(manifestURI, [
    ["content", "zotagent", rootURI + "content/"],
  ]);

  let timers;
  try { timers = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs"); }
  catch (_) { timers = ChromeUtils.import("resource://gre/modules/Timer.jsm"); }
  const context = { rootURI, Services, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout };
  context._globalThis = context;
  Services.scriptloader.loadSubScript(
    rootURI + "content/zot-agent.js",
    context,
  );
  for (const script of ["archive-format.js", "conversation-archive.js", "archive-export.js"]) {
    Services.scriptloader.loadSubScript(rootURI + "content/" + script, context);
  }
  Services.scriptloader.loadSubScript(
    rootURI + "content/preferences.js",
    context,
  );
  Zotero.ZotAgent._rootURI = rootURI;
  Zotero.ZotAgent._version = version;
  Services.scriptloader.loadSubScript(rootURI + "content/runtime-build.js", context);
  Services.scriptloader.loadSubScript(rootURI + "content/runtime-installer.js", context);
  // Zotero may await bootstrap before finishing the item tree. Do not block
  // plugin initialization on uiReadyPromise.
  Zotero.ZotAgent.hooks.onStartup().catch(error => Zotero.logError(error));
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
