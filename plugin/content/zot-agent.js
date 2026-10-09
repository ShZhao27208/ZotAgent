(function () {
  "use strict";

  const PLUGIN_ID = "zotagent@shzhao.local";
  const PREF_ROOT = "extensions.zotagent.";
  const controllers = new Map();
  const pdfTextCache = new Map();
  let dialogSequence = 0;
  let preferencePaneID = null;
  let shuttingDown = false;

  function getReaderIframeWindow(reader) {
    const candidates = [
      reader?._internalReader?._lastView,
      reader?._internalReader?._primaryView,
      reader?._internalReader?._secondaryView,
      reader?._primaryView,
      reader,
    ];
    for (const c of candidates) {
      const win = c?._iframeWindow || c?._iframe?.contentWindow;
      if (win?.document) return win;
      try {
        const wrapped = win?.wrappedJSObject;
        if (wrapped?.document) return wrapped;
      } catch {}
    }
    return null;
  }

  function pref(name, fallback) {
    const value = Zotero.Prefs.get(PREF_ROOT + name, true);
    return value === undefined || value === null ? fallback : value;
  }

  function setPref(name, value) {
    Zotero.Prefs.set(PREF_ROOT + name, value, true);
  }

  async function preferredPDF(entry, primary = false) {
    const isPDF = item => item && (item.attachmentContentType === "application/pdf" || item.isPDFAttachment?.());
    if (primary && isPDF(entry.attachment)) return entry.attachment;
    const item = entry.topItem;
    if (isPDF(item)) return item;
    const best = await item?.getBestAttachment?.();
    if (isPDF(best)) return best;
    for (const id of item?.getAttachments?.() || []) {
      const candidate = await Zotero.Items.getAsync(id);
      if (isPDF(candidate)) return candidate;
    }
    return null;
  }

  async function extractPdfText(attachment) {
    const id = Number(attachment?.id || 0);
    if (!id) return { text: "", source: "none" };
    if (pdfTextCache.has(id)) return pdfTextCache.get(id);
    const task = (async () => {
      try {
        const result = await Zotero.PDFWorker?.getFullText?.(id);
        const text = String(result?.text || "").replace(/\u0000/g, "").trim();
        if (text) return { text, source: "Zotero PDFWorker" };
      } catch (error) {
        Zotero.debug(`[ZotAgent] PDF text extraction failed: ${error.message}`);
      }
      return { text: "", source: "none" };
    })();
    pdfTextCache.set(id, task);
    const result = await task;
    if (result.text) pdfTextCache.set(id, result);
    else pdfTextCache.delete(id);
    return result;
  }

  const runtimeProcesses = new Set();

  const RuntimeManager = {
    token() {
      let token = String(pref("runtimeToken", "")).trim();
      if (token) return token;
      token = Array.from({ length: 3 }, () =>
        Services.uuid.generateUUID().toString().replace(/[{}-]/g, ""),
      ).join("");
      setPref("runtimeToken", token);
      return token;
    },

    endpoint(path = "") {
      return String(this._connectingEndpoint || pref("runtimeEndpoint", "http://127.0.0.1:24119"))
        .replace(/\/$/, "") + path;
    },

    async request(path, options = {}, timeout = 8000) {
      const xhr = await Zotero.HTTP.request(options.method || "GET", this.endpoint(path), {
        headers: { authorization: `Bearer ${this.token()}`, "content-type": "application/json" },
        body: options.body,
        responseType: "json",
        successCodes: false,
        timeout,
        logBodyLength: 0,
        errorDelayMax: 0,
      });
      return { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => xhr.response };
    },

    desiredPlatform() {
      return Zotero.isWin && pref("runtimeHost", "auto") !== "wsl" ? "windows" : "wsl";
    },

    selectRuntimeProfile() {
      const key = this.desiredPlatform() === "windows" ? "windows" : "wsl:" + String(pref("wslDistro", "Ubuntu")).trim();
      const fields = ["runtimeEndpoint", "runtimeScriptPath", "runtimeNodePath", "defaultWorkingDirectory", "opencodePath", "codexPath", "claudePath", "opencodePlatform", "codexPlatform", "claudePlatform"];
      let profiles = {};
      try { profiles = JSON.parse(pref("runtimeProfiles", "{}")); } catch {}
      let previous = String(pref("activeRuntimeProfile", ""));
      if (!previous) {
        // Preserve old Linux settings before Windows installation replaces them.
        const node = String(pref("runtimeNodePath", ""));
        previous = Zotero.isWin && node.startsWith("/") ? "wsl:" + String(pref("wslDistro", "Ubuntu")) : key;
      }
      if (previous !== key) {
        profiles[previous] = Object.fromEntries(fields.map(name => [name, pref(name, "")]));
        const defaults = { runtimeEndpoint: key === "windows" ? "http://127.0.0.1:24119" : "http://127.0.0.1:24139", runtimeNodePath: key === "windows" ? "" : "node",
          opencodePlatform: "auto", codexPlatform: "auto", claudePlatform: "auto" };
        const saved = profiles[key] || defaults;
        for (const name of fields) setPref(name, saved[name] ?? "");
        setPref("runtimeProfiles", JSON.stringify(profiles));
        this._nativeRuntime = null; this._health = null;
      }
      setPref("activeRuntimeProfile", key);
    },

    normalizePaths() {
      if (Zotero.isWin && pref("runtimeHost", "auto") !== "wsl") return;
      for (const name of ["runtimeScriptPath", "runtimeNodePath", "defaultWorkingDirectory"]) {
        const platformName = { opencodePath: "opencodePlatform", codexPath: "codexPlatform", claudePath: "claudePlatform" }[name];
        if (platformName && pref(platformName, "auto") === "windows") continue;
        const current = String(pref(name, "")).trim();
        const normalized = windowsToWSLPath(current);
        if (current && current !== normalized) setPref(name, normalized);
      }
    },

    async probe() {
      try {
        this.normalizePaths();
        const cwd = String(pref("defaultWorkingDirectory", "")).trim();
        const response = await this.request("/v1/health?cwd=" + encodeURIComponent(cwd), {}, 1500);
        if (response.ok) {
          const health = await response.json();
          this._health = health;
          if ((health.platform || health.shell?.platform) !== this.desiredPlatform()) return "wrong-environment";
          if (this.desiredPlatform() === "wsl" && health.wslDistro && health.wslDistro !== String(pref("wslDistro", "Ubuntu"))) return "wrong-environment";
          if (Number(health.protocolVersion || 0) < 7) return "outdated";
          if (Zotero.ZotAgent._runtimeBuildID && health.buildID !== Zotero.ZotAgent._runtimeBuildID) return "outdated";
          const incorrectHomeCase = health.cwdExists === false && cwd.toLowerCase() === health.defaultCwd?.toLowerCase();
          if ((!cwd || incorrectHomeCase || (Zotero.isWin && pref("runtimeHost", "auto") !== "wsl" && cwd.startsWith("/"))) && health.defaultCwd && (/^[a-z]:[\\/]/i.test(health.defaultCwd) || health.defaultCwd.startsWith("/"))) {
            setPref("defaultWorkingDirectory", health.defaultCwd);
          }
          return "running";
        }
        if (response.status === 401) return "unauthorized";
        return "unavailable";
      } catch {
        return "offline";
      }
    },

    async healthy() { return (await this.probe()) === "running"; },

    _autoDetectRuntimePath() {
      const location = Zotero.ZotAgent?._runtimeLocation;
      if (location?.script) return windowsToWSLPath(location.script);
      const uri = Zotero.ZotAgent?._rootURI;
      if (!uri) return "";
      const pluginDir = rootURIToWSLPath(uri);
      if (!pluginDir) return "";
      return pluginDir.replace(/\/content\/?$/, "").replace(/\/plugin\/?$/, "") + "/runtime/src/index.js";
    },

    launch() {
      if (this._nativeRuntime) {
        const address = this.endpoint().match(/^http:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?$/);
        const port = Number(address?.[1] || 80);
        if (!address || port < 1 || port > 65535) throw new Error("自动启动仅支持本机 HTTP Endpoint");
        this._launchFailure = null;
        const executable = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        executable.initWithPath(this._nativeRuntime.node);
        const child = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        child.init(executable);
        child.startHidden = true;
        child.noShell = true;
        const args = [this._nativeRuntime.script, "--host", "127.0.0.1", "--port", String(port), "--token", this.token()];
        this._launchProcess = child;
        runtimeProcesses.add(child);
        (child.runwAsync || child.runAsync).call(child, args, args.length, { observe: () => {
          runtimeProcesses.delete(child);
          if (this._launchProcess === child) this._launchFailure = "Windows Runtime 已退出，请检查 Node.js 版本（需要 24+）";
        } }, false);
        return;
      }
      this.normalizePaths();
      this._launchFailure = null;
      let runtimePath = String(pref("runtimeScriptPath", "")).trim();
      if (!runtimePath) {
        runtimePath = this._autoDetectRuntimePath();
        if (runtimePath) {
          Zotero.debug(`[ZotAgent] auto-detected runtime path: ${runtimePath}`);
          setPref("runtimeScriptPath", runtimePath);
        }
      }
      runtimePath = windowsToWSLPath(runtimePath);
      if (!runtimePath.startsWith("/")) {
        throw new Error("未找到 Runtime 源码，请在设置中填写 runtime/src/index.js 的 WSL 绝对路径");
      }
      let nodePath = String(pref("runtimeNodePath", "node")).trim() || "node";
      if (nodePath === "node" && Zotero.ZotAgent?._runtimeLocation?.node) {
        nodePath = windowsToWSLPath(Zotero.ZotAgent._runtimeLocation.node);
        setPref("runtimeNodePath", nodePath);
      }
      if (!nodePath.startsWith("/")) {
        throw new Error("请填写 Runtime Node.js 绝对路径，或使用本机源码构建的安装包");
      }
      const endpoint = this.endpoint();
      const address = endpoint.match(/^http:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?$/);
      const port = Number(address?.[1] || 80);
      if (!address || port < 1 || port > 65535) {
        throw new Error("自动启动仅支持 http://127.0.0.1:端口 或 http://localhost:端口");
      }
      const nodeDirectory = nodePath.slice(0, nodePath.lastIndexOf("/"));
      const runtimePathValue = [nodeDirectory, "/usr/local/bin", "/usr/bin", "/bin"].join(":");
      const distro = String(pref("wslDistro", "Ubuntu")).trim() || "Ubuntu";
      const executable = Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsIFile);
      executable.initWithPath("C:\\Windows\\System32\\wsl.exe");
      if (!executable.exists()) throw new Error("未找到 wsl.exe");

      const process = Components.classes["@mozilla.org/process/util;1"]
        .createInstance(Components.interfaces.nsIProcess);
      process.init(executable);
      process.startHidden = true;
      process.noShell = true;
      // Pass literal argv directly, as in the known-good September 10 launcher.
      const args = [
        "-d", distro, "--exec", "/usr/bin/env",
        `ZOTAGENT_TOKEN=${this.token()}`, `ZOTAGENT_PORT=${port}`,
        "ZOTAGENT_HOST=127.0.0.1", `PATH=${runtimePathValue}`,
        nodePath, runtimePath,
      ];
      this._launchProcess = process;
      const observer = {
        observe: (_subject, topic) => {
          runtimeProcesses.delete(process);
          if (this._launchProcess !== process) return;
          this._launchFailure = topic === "process-failed"
            ? "无法启动 wsl.exe"
            : `WSL Runtime 已退出（退出码 ${process.exitValue}），请检查 Runtime 和 Node.js 路径`;
        },
      };
      runtimeProcesses.add(process);
      const run = process.runwAsync || process.runAsync;
      run.call(process, args, args.length, observer, false);
    },

    async ensureRunning(force = false) {
      if (this._manualStopped) throw new Error("Runtime 已手动停止，请在设置中点击启动 Runtime");
      if (this._pending) return this._pending;
      this.selectRuntimeProfile();
      this._pending = this._ensureRunning(force).then(async (state) => {
        if (state.status !== "disabled") await new RuntimeClient(null).syncAgentPaths();
        return state;
      });
      try { return await this._pending; }
      finally { this._pending = null; }
    },

    async _ensureRunning(force = false) {
      const current = await this.probe();
      if (current === "running") return { status: "running" };
      if (current === "outdated" && this._health?.service === "zotagent" && this._health?.instanceID) {
        const stopped = await this.request("/v1/runtime/stop", { method: "POST", body: JSON.stringify({ instanceID: this._health.instanceID, force: false }) });
        if (!stopped.ok) throw new Error("旧版 Runtime 仍有任务运行，请先停止任务后更新连接");
        for (let attempt = 0; attempt < 20; attempt++) {
          if (await this.probe() === "offline") return this._startAndWait();
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        throw new Error("旧版 Runtime 尚未释放端口，请稍后重试");
      }
      if (["wrong-environment", "outdated"].includes(current)) {
        // Keep the existing service alive. Use a distinct authenticated endpoint
        // for the requested host/new protocol; never silently reuse the old one.
        const initial = this.endpoint();
        if (!/^http:\/\/(?:127\.0\.0\.1|localhost):(?:24119|24129|24139|241(?:49|5[0-3]|59|6[0-3]))$/.test(initial)) {
          throw new Error("自定义 Endpoint 上的 Runtime 环境或协议不匹配，请更新对应 Runtime 或修改 Endpoint；未自动更改自定义地址");
        }
        const base = this.desiredPlatform() === "windows" ? 24149 : 24159;
        try {
          for (let index = 0; index < 5; index++) {
            this._connectingEndpoint = `http://127.0.0.1:${base + index}`;
            if (this._connectingEndpoint === initial) continue;
            const status = await this.probe();
            if (status === "running") { setPref("runtimeEndpoint", this._connectingEndpoint); return { status: "running" }; }
            if (status !== "offline") continue;
            if (!force && !pref("autoStartRuntime", true)) throw new Error("当前端口运行的是其他环境或旧版 Runtime；请点击立即启动以连接所选环境");
            const state = await this._startAndWait();
            setPref("runtimeEndpoint", this._connectingEndpoint);
            return state;
          }
          throw new Error("没有可用的独立 Runtime 端口，请配置空闲的本机端口");
        } finally { this._connectingEndpoint = null; }
      }
      if (current === "unauthorized") {
        throw new Error("端口上已有 Runtime，但 Token 不匹配；请停止旧 Runtime 后重试");
      }
      if (!force && !pref("autoStartRuntime", true)) return { status: "disabled" };
      try {
        return await this._startAndWait();
      } catch (error) {
        // Only retry a default local endpoint whose startup could not be reached.
        if (!error.retryPort || this.endpoint() !== "http://127.0.0.1:24119") throw error;
        this._connectingEndpoint = "http://127.0.0.1:24129";
        try {
          const alternate = await this.probe();
          if (alternate === "unauthorized") throw new Error("备用端口 24129 已被其他 Token 的 Runtime 占用");
          const state = alternate === "running" ? { status: "running" } : await this._startAndWait();
          setPref("runtimeEndpoint", this._connectingEndpoint);
          Zotero.debug("[ZotAgent] default port unreachable; authenticated connection recovered on 24129");
          return { ...state, recovered: true };
        } catch (alternateError) {
          throw new Error(`24119 连接失败，备用端口也未连接成功: ${alternateError.message}`);
        } finally {
          this._connectingEndpoint = null;
        }
      }
    },

    async start() {
      this._manualStopped = false;
      return this.ensureRunning(true);
    },

    async stop(win) {
      if (this._pending) throw new Error("正在连接 Runtime，请等待连接完成后停止");
      const response = await this.request("/v1/health");
      if (!response.ok) throw new Error("无法验证 Runtime 身份；未停止任何进程");
      const health = await response.json();
      if (health.service !== "zotagent" || !health.instanceID) throw new Error("该服务不支持安全停止，请从启动它的终端退出；未按端口杀进程");
      const active = [...(health.activeRequests || []).map(r => `${r.agent} · ${r.requestID}`), ...(health.activeTerminals || []).map(r => `原生终端 ${r.agent} · ${r.id}`)];
      if (active.length && !win.confirm("停止将中断以下任务：\n" + active.join("\n") + "\n是否继续？")) return false;
      const stopped = await this.request("/v1/runtime/stop", { method: "POST", body: JSON.stringify({ instanceID: health.instanceID, force: active.length > 0 }) });
      if (!stopped.ok) throw new Error((await stopped.json()).error || "停止失败");
      this._manualStopped = true;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          const probe = await this.request("/v1/health", {}, 500);
          if (!probe.ok) throw new Error("端口上出现其他服务；请检查 Endpoint");
          const current = await probe.json();
          if (current.instanceID !== health.instanceID) throw new Error("端口上的服务已更换；未停止新服务");
        } catch (error) {
          if (error.message.includes("服务")) throw error;
          this._health = null; return true;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error("停止已请求，但端口尚未释放；请稍后重试");
    },

    async _startAndWait() {
      if (Zotero.isWin && pref("runtimeHost", "auto") !== "wsl") {
        this._nativeRuntime = await Zotero.ZotAgent.prepareWindowsRuntime();
      } else this._nativeRuntime = null;
      this.launch();
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await this.healthy()) return { status: "started" };
        if (this._launchFailure) break;
      }
      const error = new Error(this._launchFailure || `Runtime 在 ${this.endpoint()} 无响应；请检查本机端口与 Runtime 启动状态`);
      error.retryPort = true;
      throw error;
    },

  };

  class SessionHistory {
    static KEY = "sessionHistory";
    static MAX_ENTRIES = 50;
    static MAX_MESSAGES_PER_SESSION = 100;

    static load() {
      try {
        return JSON.parse(pref(this.KEY, "[]"));
      } catch {
        return [];
      }
    }

    static save(entries) {
      setPref(this.KEY, JSON.stringify(entries.slice(0, this.MAX_ENTRIES)));
    }

    static upsert(record) {
      const entries = this.load();
      const index = entries.findIndex(
        (e) => e.agent === record.agent && e.nativeSessionID === record.nativeSessionID,
      );
      const entry = {
        ...(index >= 0 ? entries[index] : {}),
        ...record,
        updatedAt: new Date().toISOString(),
      };
      if (index >= 0) entries[index] = entry;
      else entries.unshift(entry);
      this.save(entries);
      return entry;
    }

    static updateMessages(agent, nativeSessionID, messages) {
      const entries = this.load();
      const entry = entries.find(
        (e) => e.agent === agent && e.nativeSessionID === nativeSessionID,
      );
      if (entry) {
        entry.messages = messages.slice(-this.MAX_MESSAGES_PER_SESSION);
        entry.updatedAt = new Date().toISOString();
        this.save(entries);
      }
    }

    static remove(agent, nativeSessionID) {
      const entries = this.load();
      const filtered = entries.filter(
        (e) => !(e.agent === agent && e.nativeSessionID === nativeSessionID),
      );
      this.save(filtered);
    }
  }

  function createElement(doc, tag, className, text) {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function markdownToNoteHTML(markdown) {
    const lines = markdown.split(/\r?\n/);
    const output = [];
    let inCode = false;
    let code = [];
    let listStack = [];
    let inTable = false;
    let tableRows = [];

    const closeList = () => {
      while (listStack.length) output.push(listStack.pop() === "ol" ? "</ol>" : "</ul>");
    };

    const closeTable = () => {
      if (!inTable) return;
      inTable = false;
      if (tableRows.length < 2 || !tableRows[1].every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) {
        for (const row of tableRows) output.push(`<p>${inlineFormat("|" + row.join("|") + "|")}</p>`);
        tableRows = [];
        return;
      }
      const headerCells = tableRows[0];
      const bodyRows = tableRows.slice(2);
      let html = "<table><thead><tr>";
      for (const cell of headerCells) html += `<th>${inlineFormat(cell.trim())}</th>`;
      html += "</tr></thead><tbody>";
      for (const row of bodyRows) {
        html += "<tr>";
        for (const cell of row) html += `<td>${inlineFormat(cell.trim())}</td>`;
        html += "</tr>";
      }
      html += "</tbody></table>";
      output.push(html);
      tableRows = [];
    };

    const inlineFormat = (text) => {
      return escapeHTML(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/_(.+?)_/g, "<em>$1</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
          if (/^\s*(javascript|data|vbscript):/i.test(href)) return label;
          return `<a href="${href}">${label}</a>`;
        });
    };

    for (const line of lines) {
      if (line.startsWith("```")) {
        closeList();
        closeTable();
        if (inCode) {
          output.push("<pre><code>" + escapeHTML(code.join("\n")) + "</code></pre>");
          code = [];
        }
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        code.push(line);
        continue;
      }

      if (line.includes("|") && line.trim().startsWith("|")) {
        closeList();
        const cells = line.split("|").slice(1, -1);
        if (!inTable) inTable = true;
        tableRows.push(cells);
        continue;
      }
      closeTable();

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length, 6);
        output.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
        continue;
      }

      const blockquote = line.match(/^>\s?(.*)$/);
      if (blockquote) {
        closeList();
        output.push(`<blockquote><p>${inlineFormat(blockquote[1])}</p></blockquote>`);
        continue;
      }

      const hr = line.match(/^[-*_]{3,}\s*$/);
      if (hr) {
        closeList();
        output.push("<hr/>");
        continue;
      }

      const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
      if (ordered) {
        if (!listStack.length || listStack[listStack.length - 1] !== "ol") {
          closeList();
          output.push("<ol>");
          listStack.push("ol");
        }
        output.push(`<li>${inlineFormat(ordered[2])}</li>`);
        continue;
      }

      const bullet = line.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        if (!listStack.length || listStack[listStack.length - 1] !== "ul") {
          closeList();
          output.push("<ul>");
          listStack.push("ul");
        }
        output.push(`<li>${inlineFormat(bullet[1])}</li>`);
        continue;
      }

      closeList();
      if (line.trim()) output.push(`<p>${inlineFormat(line)}</p>`);
    }
    closeList();
    closeTable();
    if (inCode && code.length) {
      output.push("<pre><code>" + escapeHTML(code.join("\n")) + "</code></pre>");
    }
    return output.join("\n");
  }

  function windowsToWSLPath(winPath) {
    if (!winPath || typeof winPath !== "string") return "";
    const normalized = winPath.replace(/\\/g, "/");
    const wslMatch = normalized.match(/^(?:\/\/)?(?:wsl\.localhost|wsl\$)\/[^/]+\/(.+)/i);
    if (wslMatch) return "/" + wslMatch[1];
    const match = normalized.match(/^([A-Za-z]):\/(.*)/);
    if (!match) {
      // Recover Linux paths pasted with Windows separators and a missing leading slash.
      if (/^home\/[^/]+(?:\/|$)/.test(normalized)) return "/" + normalized;
      return normalized;
    }
    return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
  }

  function rootURIToWSLPath(uri) {
    if (!uri) return "";
    let p = decodeURIComponent(uri.replace(/\/$/, ""));
    if (p.startsWith("file:///")) p = p.slice(7);
    else if (p.startsWith("file://")) p = p.slice(7);
    const wslMatch = p.match(/^\/?(?:wsl\.localhost|wsl\$)\/[^/]+\/(.+)/i);
    if (wslMatch) return "/" + wslMatch[1];
    const driveMatch = p.match(/^\/?([A-Za-z]):\/(.*)/);
    if (driveMatch) return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
    if (p.startsWith("/")) return p;
    return "";
  }

  function readPosition(annotation) {
    try {
      const position =
        typeof annotation?.position === "string"
          ? JSON.parse(annotation.position)
          : annotation?.position;
      return Number.isInteger(position?.pageIndex) ? position.pageIndex : null;
    } catch {
      return null;
    }
  }

  class NoteService {
    static lastInsertError = "";

    static insertIntoReaderCursor(reader, markdown) {
      this.lastInsertError = "";
      if (!reader || !markdown) return false;
      const internal = reader._internalReader;
      const views = [
        reader._iframeWindow,
        reader._iframe?.contentWindow,
        reader._window,
        internal?._primaryView?._iframeWindow,
        internal?._primaryView?._iframe?.contentWindow,
        internal?._secondaryView?._iframeWindow,
        internal?._secondaryView?._iframe?.contentWindow,
      ].filter(Boolean);
      const candidates = [];
      for (const win of views) {
        try {
          const active = win.document.activeElement;
          if (active && this._isEditable(active)) candidates.push(active);
          for (const selector of [
            ".annotation-popup [contenteditable='true']",
            ".annotation-popup textarea",
            ".annotation-popup input",
            "[data-testid*='annotation'] [contenteditable='true']",
            "[contenteditable='true']",
            "textarea",
          ]) candidates.push(...win.document.querySelectorAll(selector));
        } catch (_) {}
      }
      const target = candidates.find((element) => this._isEditable(element));
      if (!target) return false;
      try {
        target.focus?.();
        if (target.isContentEditable) {
          const doc = target.ownerDocument;
          const win = doc.defaultView;
          const selection = win.getSelection?.();
          const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
          if (range && target.contains(range.commonAncestorContainer)) {
            range.deleteContents();
            range.insertNode(range.createContextualFragment(markdownToNoteHTML(markdown)));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          } else if (typeof doc.execCommand === "function") {
            doc.execCommand("insertHTML", false, markdownToNoteHTML(markdown));
          } else target.textContent += markdown;
        } else {
          const value = String(target.value || "");
          const start = Number.isInteger(target.selectionStart) ? target.selectionStart : value.length;
          const end = Number.isInteger(target.selectionEnd) ? target.selectionEnd : start;
          target.value = value.slice(0, start) + markdown + value.slice(end);
          target.selectionStart = target.selectionEnd = start + markdown.length;
        }
        const EventCtor = target.ownerDocument.defaultView.Event;
        target.dispatchEvent(new EventCtor("input", { bubbles: true }));
        target.dispatchEvent(new EventCtor("change", { bubbles: true }));
        return true;
      } catch (error) {
        Zotero.logError(error);
        this.lastInsertError = `注释光标插入失败: ${error.message}`;
        return false;
      }
    }

    static _isEditable(element) {
      if (!element || element.disabled || element.readOnly) return false;
      const tag = String(element.localName || element.tagName || "").toLowerCase();
      return Boolean(element.isContentEditable || tag === "textarea" || (tag === "input" && /^(text|search|url|email|tel)?$/.test(element.type || "text")));
    }

    static async createChildNote(context, markdown) {
      const parent = context?.topItem;
      if (!parent || parent.libraryID === undefined || parent.libraryID === null) {
        throw new Error("当前没有可关联的文献条目");
      }
      const note = new Zotero.Item("note");
      note.libraryID = parent.libraryID;
      note.parentID = parent.id;
      note.setNote(markdownToNoteHTML(markdown));
      await note.saveTx();
      return note;
    }

    static async createCombinedNote(context, markdown) {
      const items = context?.items;
      if (!items?.length) throw new Error("没有可关联的文献");
      const first = items[0].topItem;
      const note = new Zotero.Item("note");
      note.libraryID = first.libraryID;
      note.parentID = first.id;
      note.setNote(markdownToNoteHTML(markdown));
      await note.saveTx();
      for (let i = 1; i < items.length; i++) {
        const related = items[i].topItem;
        if (related) note.addRelatedItem(related);
      }
      if (items.length > 1) await note.saveTx();
      return note;
    }

    static async saveWithConfirmation(dialog, context, markdown) {
      if (pref("autoSaveNotes", false)) {
        if (context?.items?.length > 1 && dialog._multiMode !== "separate") {
          return this.createCombinedNote(context, markdown);
        }
        return this.createChildNote(context, markdown);
      }
      return new Promise((resolve) => {
        dialog.showSaveConfirmation(context, markdown, resolve);
      });
    }

    static insertAtActiveCursor(markdown) {
      this.lastInsertError = "";
      const usable = Array.from(Zotero.Notes?._editorInstances || []).filter((editor) => {
        try {
          return Boolean(
            editor?._iframeWindow &&
            !editor._readOnly &&
            !Components.utils.isDeadWrapper(editor._iframeWindow),
          );
        } catch {
          return false;
        }
      });

      const mainWin = Zotero.getMainWindow?.();
      const selectedTabID = mainWin?.Zotero_Tabs?.selectedID;
      let editor = selectedTabID && Zotero.Notes?.getByTabID?.(selectedTabID);
      if (!usable.includes(editor)) editor = null;

      if (!editor) {
        editor = usable.find((candidate) => {
          try {
            const win = candidate._iframeWindow;
            const active = win.document.activeElement;
            const selection = win.getSelection?.();
            return win.document.hasFocus() || Boolean(
              active?.closest?.(".primary-editor, .editor-core") && selection?.rangeCount,
            );
          } catch {
            return false;
          }
        });
      }

      if (!editor && usable.length === 1) editor = usable[0];
      if (!editor) {
        this.lastInsertError = usable.length
          ? "检测到多个笔记，请先切换到目标笔记标签页并点击正文"
          : "请先打开一篇可编辑的 Zotero 笔记并点击正文";
        return false;
      }

      const html = markdownToNoteHTML(markdown);
      try {
        if (typeof editor._postMessage === "function") {
          editor._postMessage({ action: "insertHTML", pos: null, html });
          editor.focus?.();
          return true;
        }

        const wrapped = editor._iframeWindow.wrappedJSObject;
        const core = wrapped?._currentEditorInstance?._editorCore;
        if (core?.insertHTML) {
          core.insertHTML(null, html);
          core.focus?.();
          return true;
        }
      } catch (error) {
        Zotero.logError(error);
        this.lastInsertError = `插入失败: ${error.message}`;
        return false;
      }

      this.lastInsertError = "当前 Zotero 编辑器不支持光标插入";
      return false;
    }

    static async insertIntoAnnotation(annotation, attachmentID, markdown) {
      if (!annotation || !attachmentID) return false;
      const attachment = await Zotero.Items.getAsync?.(attachmentID) || Zotero.Items.get(attachmentID);
      const candidates = attachment?.getAnnotations?.() || [];
      const annotationData = annotation.data || annotation.annotation || {};
      const annotationID = annotation.key || annotation.annotationKey || annotation.id ||
        annotation.annotationID || annotationData.key || annotationData.annotationKey ||
        annotationData.id || annotationData.annotationID;
      const annotationPosition = readPosition(annotation);
      const annotationText = String(annotation.text || annotationData.text || "").trim();
      const target = candidates.find((item) => {
        const key = item.key || item.id || item.annotationKey;
        if (annotationID && String(key) === String(annotationID)) return true;
        if (annotationPosition === null) return false;
        const itemPosition = readPosition(item);
        if (itemPosition !== annotationPosition) return false;
        return !annotationText || String(item.annotationText || item.getField?.("annotationText") || "").trim() === annotationText;
      });
      if (!target) return false;
      const previous = String(target.getField?.("annotationComment") || "").trim();
      const html = markdownToNoteHTML(markdown);
      target.setField("annotationComment", previous ? `${previous}<br/>${html}` : html);
      await target.saveTx();
      return true;
    }
  }

  class RuntimeClient {
    constructor(dialog) {
      this.dialog = dialog;
      this.currentController = null;
    }

    headers() {
      const token = pref("runtimeToken", "");
      return {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      };
    }

    endpoint(path) {
      return String(pref("runtimeEndpoint", "http://127.0.0.1:24119")).replace(
        /\/$/,
        "",
      ) + path;
    }

    makeAbortController() {
      const win = this.dialog?.win || globalThis;
      if (typeof win.AbortController === "function") return new win.AbortController();
      if (typeof AbortController === "function") return new AbortController();
      return null;
    }

    async syncAgentPaths() {
      const executables = {}, platforms = {};
      const definitions = { opencode: ["opencodePath", "opencodePlatform"], codex: ["codexPath", "codexPlatform"], "claude-code": ["claudePath", "claudePlatform"] };
      const hostPlatform = RuntimeManager._health?.platform || RuntimeManager.desiredPlatform();
      for (const [agent, [pathPref, platformPref]] of Object.entries(definitions)) {
        const selection = String(pref(platformPref, "auto"));
        platforms[agent] = ["windows", "wsl"].includes(selection) ? selection : "auto";
        const actual = platforms[agent] === "auto" ? hostPlatform : platforms[agent];
        const value = String(pref(pathPref, "")).trim();
        const matches = actual === "windows" ? /^(?:[a-z]:[\\/]|\\\\(?!wsl[.$]))/i.test(value) : value.startsWith("/");
        if (value && !matches) throw new Error(`${agent} 手动路径与所选环境不匹配：${value}；请修正或清空后重新检测`);
        executables[agent] = value;
      }
      const response = await RuntimeManager.request("/v1/config/agents", {
        method: "POST", body: JSON.stringify({ executables, platforms, wslDistro: String(pref("wslDistro", "Ubuntu")) }),
      }, 5000);
      if (!response.ok) throw new Error(`Agent 配置失败: Runtime ${response.status}`);
      try {
        const agentsRes = await RuntimeManager.request("/v1/agents", {}, 22000);
        if (!agentsRes.ok) throw new Error(`Runtime ${agentsRes.status}`);
        const agents = await agentsRes.json();
        if (this.dialog) this.dialog._agentCapabilities = agents;
        RuntimeManager._agents = agents;
        for (const [agent, info] of Object.entries(agents)) {
          if (!definitions[agent]) continue;
          const pathPref = definitions[agent][0];
          const value = String(info.executable || "");
          if (!String(pref(pathPref, "")).trim() && info.available && value) setPref(pathPref, value);
        }
      } catch (error) {
        throw new Error("Agent 自动检测失败: " + error.message);
      }
    }

    async run(payload, onEvent, operation = {}) {
      this.operations ||= new Map();
      const op = operation;
      op.controller = this.makeAbortController();
      this.operations.set(payload.requestID, op);
      const check = () => { if (op.cancelled) { const error = new Error("用户已中断"); error.name = "AbortError"; throw error; } };
      let timeout;
      let completion = null, failure = "";
      try {
        check();
        await RuntimeManager.ensureRunning(); check();
        const body = JSON.stringify(payload);
        if (new TextEncoder().encode(body).byteLength > 4 * 1024 * 1024) throw new Error("请求体超过 Runtime 的 4 MiB 接收限制；未主动截断全文或截图，请减少附加文献或图片");
        timeout = setTimeout(() => { op.timedOut = true; op.controller?.abort(); }, 10000);
        check();
        op.sent = true;
        const response = await fetch(this.endpoint("/v1/run"), {
          method: "POST", headers: this.headers(), body, signal: op.controller?.signal,
        });
        clearTimeout(timeout); check();
        if (!response.ok) throw new Error(`Runtime ${response.status}: ${await response.text()}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const accept = line => {
          if (!line.trim()) return;
          let event;
          try { event = JSON.parse(line); } catch { throw new Error("Runtime 返回了无效事件，回答可能不完整"); }
          if (event.requestID !== payload.requestID || event.windowID !== payload.windowID) return;
          if (event.type === "error") {
            failure = event.data?.message || event.data?.raw?.error?.data?.message || event.data?.raw?.error?.message || event.data?.raw?.errors?.join("\n") || "Agent 返回错误";
            event.data = { ...event.data, message: failure };
          }
          if (event.type === "request.completed") completion = event;
          if (event.type === "request.preparing") this.dialog?.renderStatus(event.data?.message || "正在准备 Agent 和模型…");
          check(); onEvent(event);
        };
        while (true) {
          const { value, done } = await reader.read(); check();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) accept(line);
          if (done) break;
        }
        if (buffer.trim()) accept(buffer);
        if (!completion) { const error = new Error("连接结束但未收到完成事件，回答可能不完整"); error.disconnected = true; throw error; }
        return { status: completion.data.code === 0 && !failure ? "completed" : "failed", endedAt: completion.timestamp || Date.now(),
          error: failure || (completion.data.code !== 0 ? `退出码 ${completion.data.code}: ${completion.data.stderr || "Agent 未成功完成"}` : "") };
      } catch (error) {
        if (op.cancelled) { const cancelled = new Error("用户已中断"); cancelled.name = "AbortError"; throw cancelled; }
        if (op.timedOut) throw new Error("Runtime 未在 10 秒内返回响应头：请检查连接或更新后端（不代表 Agent 未启动）");
        throw error;
      } finally {
        clearTimeout(timeout);
        if (this.operations.get(payload.requestID) === op) this.operations.delete(payload.requestID);
      }
    }

    async cancel(requestID) {
      const op = this.operations?.get(requestID);
      if (op) { op.cancelled = true; op.controller?.abort(); }
      if (!op?.sent) return;
      const controller = this.makeAbortController();
      const timeout = setTimeout(() => controller?.abort(), 3000);
      try {
        await fetch(this.endpoint(`/v1/requests/${encodeURIComponent(requestID)}/cancel`), {
          method: "POST", headers: this.headers(), signal: controller?.signal,
        });
      } catch (_) {} finally { clearTimeout(timeout); }
    }

    async approve(requestID, approved) {
      try {
        return await fetch(this.endpoint(`/v1/requests/${requestID}/approve`), {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ approved }),
        });
      } catch (_) {
        return null;
      }
    }
  }

  class AgentDialog {
    constructor(controller) {
      this.controller = controller;
      this.win = controller.win;
      this.doc = controller.doc;
      this.id = `zotagent-window-${Date.now()}-${++dialogSequence}`;
      this.agent = String(pref("defaultAgent", "claude-code"));
      this.sessions = Object.create(null);
      this.sessionDirectories = Object.create(null);
      this.messages = [];
      this.requestID = null;
      this._requestState = "idle";
      this.lastProcessError = "";
      this.currentModel = null;
      this.receiveSelections = Boolean(pref("receiveSelections", true));
      this.extraItems = [];
      this.primaryContext = null;
      this.runtime = new RuntimeClient(this);
      this.element = this.build();
      this.controller.layer.appendChild(this.element);
      this._archiveUnsubscribe = Zotero.ZotAgent.archive?.subscribe(() => this.updateArchiveBar());
      this.updateContext();
      this.installAutoFit();
    }

    installAutoFit() {
      if (!this.win.requestAnimationFrame || !this.element.getBoundingClientRect) return;
      this._fitBaseline = { width: 460, height: 680 };
      this._scheduleFit = () => {
        if (this._fitFrame || this._destroyed || this._fitPointerActive) return;
        this._fitFrame = this.win.requestAnimationFrame(() => {
          this._fitFrame = null;
          if (!this._destroyed) this.fitContent();
        });
      };
      if (this.win.MutationObserver) {
        this._contentObserver = new this.win.MutationObserver(records => {
          if (records.some(record => record.target !== this.element || record.attributeName !== "style")) this._scheduleFit();
        });
        this._contentObserver.observe(this.element, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
      }
      // Observe content mutations, not layout sizes: resizing a child is an
      // effect of fitting and must never feed back into another fit pass.
      this._beginManualFit = () => {
        this._fitPointerActive = true;
        this._pointerStartSize = this.element.getBoundingClientRect();
        if (this._fitFrame) this.win.cancelAnimationFrame(this._fitFrame);
        this._fitFrame = null;
      };
      this._rememberManualSize = () => {
        if (!this._fitPointerActive) return;
        this._fitPointerActive = false;
        const rect = this.element.getBoundingClientRect();
        const before = this._pointerStartSize;
        if (!this.element.classList.contains("is-minimized") && before &&
          (Math.abs(rect.width - before.width) > 3 || Math.abs(rect.height - before.height) > 3)) {
          this._manualFitSize = { width: rect.width, height: rect.height };
        }
        this._pointerStartSize = null;
        this._scheduleFit();
      };
      this.element.addEventListener("pointerdown", this._beginManualFit, true);
      this.win.addEventListener("resize", this._scheduleFit);
      this.win.addEventListener("pointerup", this._rememberManualSize);
      this.win.addEventListener("pointercancel", this._rememberManualSize);
      this.win.addEventListener("blur", this._rememberManualSize);
      this.element.addEventListener("input", this._scheduleFit);
      this.element.addEventListener("load", this._scheduleFit, true);
      this._scheduleFit();
    }

    fitContent() {
      const root = this.element;
      if (this._fitPointerActive || root.classList.contains("is-minimized")) return;
      const viewportWidth = this.win.innerWidth || 1024;
      const viewportHeight = this.win.innerHeight || 800;
      const maxWidth = Math.max(1, viewportWidth - 24), maxHeight = Math.max(1, viewportHeight - 24);
      const baseline = this._fitBaseline || { width: 460, height: 680 };
      const rect = root.getBoundingClientRect();
      const context = root.querySelector(".zotagent-context-details");
      // Reference titles wrap instead of requiring unbounded horizontal growth.
      const width = Math.min(maxWidth, this._manualFitSize?.width ?? Math.max(rect.width, baseline.width, this.extraItems.length ? 520 : 460));
      const set = (name, value) => { if (root.style[name] !== value) root.style[name] = value; };
      set("width", `${Math.ceil(width)}px`);
      const contextHeight = Math.min(context?.scrollHeight || 0, maxHeight * 0.55);
      root.style.setProperty("--za-context-height", `${Math.ceil(contextHeight)}px`);
      let chromeHeight = 0;
      for (const child of root.children) {
        if (child === context || child === this.messagesElement || child === this.ptyContainer || child === this._pdfExportPanel) continue;
        chromeHeight += child.getBoundingClientRect().height;
      }
      const messageHeight = 160; // Fixed reading space; scrollHeight includes allocated space and causes feedback.
      const overlayHeight = this._pdfExportPanel?.isConnected ? Math.min(760, 210 + (this.context ? 1 : 0) * 40 + this.extraItems.length * 40) : 0;
      const height = Math.min(maxHeight, this._manualFitSize?.height ?? Math.max(rect.height, baseline.height, chromeHeight + contextHeight + messageHeight + 4, overlayHeight));
      const left = Math.max(12, Math.min(rect.left, viewportWidth - width - 12));
      const top = Math.max(12, Math.min(rect.top, viewportHeight - height - 12));
      set("left", `${Math.round(left)}px`); set("top", `${Math.round(top)}px`);
      root.style.setProperty("--za-top", `${Math.round(top)}px`);
      set("height", `${Math.ceil(height)}px`);
      this._lastFit = { width: Math.ceil(width), height: Math.ceil(height) };
    }

    build() {
      const root = createElement(this.doc, "section", "zotagent-dialog");
      root.id = this.id;
      root.dataset.agent = this.agent;
      const left = Math.min(40 + (dialogSequence % 5) * 34, Math.max(0, (this.win.innerWidth || 1024) - 480));
      const top = Math.min(72 + (dialogSequence % 4) * 28, Math.max(0, (this.win.innerHeight || 800) - 700));
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.setProperty("--za-top", `${top}px`);

      const header = createElement(this.doc, "header", "zotagent-dialog-header");
      const title = createElement(this.doc, "strong", "zotagent-dialog-title", "ZotAgent");
      const agent = createElement(this.doc, "select", "zotagent-agent-select");
      for (const [value, label] of [
        ["opencode", "OpenCode"],
        ["codex", "Codex"],
        ["claude-code", "Claude Code"],
      ]) {
        const option = createElement(this.doc, "option", "", label);
        option.value = value;
        option.selected = value === this.agent;
        agent.appendChild(option);
      }
      agent.addEventListener("change", () => {
        if (this._requestState !== "idle" || this._ptyMode || this._ptySwitching) {
          agent.value = this.agent;
          this.renderStatus("请求进行中，无法切换 Agent");
          return;
        }
        this.agent = agent.value;
        root.dataset.agent = this.agent;
        this.renderStatus("已切换 Agent，原会话保持独立");
      });
      const minimize = createElement(this.doc, "button", "zotagent-icon-button", "−");
      minimize.title = "最小化";
      minimize.addEventListener("click", () => root.classList.toggle("is-minimized"));
      const close = createElement(this.doc, "button", "zotagent-icon-button", "×");
      close.title = "关闭";
      close.addEventListener("click", () => this.destroy());
      header.append(title, agent, minimize, close);
      this.enableDragging(root, header);

      const executionBar = createElement(this.doc, "div", "zotagent-execution-bar");
      this.cwdInput = createElement(this.doc, "input", "zotagent-cwd-input");
      this.cwdInput.value = String(pref("defaultWorkingDirectory", ""));
      this.cwdInput.placeholder = "工作目录（留空使用 Agent 默认目录）";
      this.cwdInput.title = "该对话框的 Agent 工作目录";
      executionBar.append(this.cwdInput);

      this.contextBar = createElement(this.doc, "div", "zotagent-context-bar", "未绑定文献");
      this.selectionBox = createElement(this.doc, "div", "zotagent-selection-box");
      this.selectionLabel = createElement(this.doc, "div", "zotagent-selection-label", "PDF 选区");
      this.selectionInput = createElement(this.doc, "textarea", "zotagent-selection-input");
      this.selectionInput.placeholder = "选择 PDF 文字后会自动出现在这里";
      this.capturePreview = createElement(this.doc, "button", "zotagent-capture-preview");
      this.capturePreview.type = "button";
      this.capturePreview.title = "点击预览截图";
      this.capturePreview.style.display = "none";
      this.capturePreview.addEventListener("click", () => this.showCapturePreview());
      this.capturePreviewImage = createElement(this.doc, "img");
      this.capturePreviewImage.alt = "PDF 截图预览";
      this.capturePreview.appendChild(this.capturePreviewImage);
      const clearSelection = createElement(this.doc, "button", "zotagent-small-button", "清除");
      clearSelection.addEventListener("click", () => {
        this.selectionInput.value = "";
        this.selectionSnapshot = null;
        this.selectionLabel.textContent = "PDF 选区";
        this.capturedImage = null;
        this.capturePreview.style.display = "none";
        this.captureTarget = null;
      });
      const captureBtn = createElement(this.doc, "button", "zotagent-small-button", "截图");
      captureBtn.title = "框选 PDF 区域截图";
      captureBtn.addEventListener("click", () => this.startAreaCapture());
      const selectionHeader = createElement(this.doc, "div", "zotagent-selection-header");
      selectionHeader.append(this.selectionLabel, captureBtn, clearSelection);
      this.selectionBox.append(selectionHeader, this.capturePreview, this.selectionInput);

      this.refBar = createElement(this.doc, "div", "zotagent-ref-bar");
      this.fullTextCheckbox = createElement(this.doc, "input");
      this.fullTextCheckbox.type = "checkbox";
      this.fullTextCheckbox.id = `${this.id}-fulltext`;
      const fullTextLabel = createElement(this.doc, "label", "zotagent-fulltext-label", "附加主文献全文");
      fullTextLabel.htmlFor = this.fullTextCheckbox.id;
      const importBtn = createElement(this.doc, "button", "zotagent-small-button", "导入选中文献");
      importBtn.title = "将 Zotero 主面板当前选中的条目添加为额外参考文献";
      importBtn.addEventListener("click", () => this.importSelectedItems());
      this.extraItemsList = createElement(this.doc, "div", "zotagent-extra-items");
      this.multiModeSelect = createElement(this.doc, "select", "zotagent-multi-mode");
      for (const [value, text] of [["combined", "综合分析"], ["separate", "分别处理"]]) {
        const option = createElement(this.doc, "option", "", text);
        option.value = value;
        this.multiModeSelect.appendChild(option);
      }
      this.multiModeSelect.addEventListener("change", () => { this._multiMode = this.multiModeSelect.value; });
      this._multiMode = "combined";
      const selectAll = createElement(this.doc, "button", "zotagent-small-button", "全部附加全文");
      selectAll.addEventListener("click", () => this.setAllFullText(true));
      const clearAll = createElement(this.doc, "button", "zotagent-small-button", "全部取消");
      clearAll.addEventListener("click", () => this.setAllFullText(false));
      const exportPDF = createElement(this.doc, "button", "zotagent-small-button", "导出 PDF 文本");
      exportPDF.addEventListener("click", () => this.showPDFExport());
      const documentActions = createElement(this.doc, "div", "zotagent-document-actions");
      const documentTitle = createElement(this.doc, "strong", "", "文献");
      documentActions.append(documentTitle, importBtn, exportPDF);
      const fullTextActions = createElement(this.doc, "div", "zotagent-fulltext-actions");
      const primaryChoice = createElement(this.doc, "span", "zotagent-primary-choice");
      primaryChoice.append(this.fullTextCheckbox, fullTextLabel);
      selectAll.textContent = "全选全文";
      clearAll.textContent = "取消全选";
      selectAll.title = "勾选主文献与全部参考文献的全文，不立即发送";
      clearAll.title = "取消主文献与全部参考文献的全文勾选";
      fullTextActions.append(primaryChoice, selectAll, clearAll);
      const analysisMode = createElement(this.doc, "label", "zotagent-analysis-mode", "处理方式");
      analysisMode.append(this.multiModeSelect);
      this.refBar.append(documentActions, fullTextActions, analysisMode);

      this.archiveBar = createElement(this.doc, "div", "zotagent-archive-bar");
      this.archiveLabel = createElement(this.doc, "span", "zotagent-archive-label", "本次不会自动归档");
      this.archiveSelect = createElement(this.doc, "select", "zotagent-archive-select");
      this.archiveSelect.setAttribute("aria-label", "后续对话保存到的子笔记");
      this.archiveSelect.addEventListener("change", async () => {
        const document = Zotero.ZotAgent.archiveFormat.documentSnapshot(this.context?.topItem);
        if (!document) return;
        try { await Zotero.ZotAgent.archive.selectTarget(document, this.archiveSelect.value); this.updateArchiveBar("后续提问将保存到所选笔记"); }
        catch (error) { this._noteListSignature = null; this.updateArchiveBar(); this.renderStatus("无法切换归档笔记：" + error.message, true); }
      });
      this.archiveSelect.addEventListener("focus", () => this.updateArchiveBar());
      const openArchive = createElement(this.doc, "button", "zotagent-small-button", "打开");
      openArchive.addEventListener("click", () => this.archiveAction("open"));
      const newArchive = createElement(this.doc, "button", "zotagent-small-button", "新建");
      newArchive.addEventListener("click", () => this.archiveAction("new"));
      const exportArchive = createElement(this.doc, "button", "zotagent-small-button", "导出");
      exportArchive.addEventListener("click", () => this.archiveAction("export"));
      openArchive.title = "打开当前记忆笔记";
      newArchive.title = "新建记忆笔记；此前已提交的问题仍归档到旧笔记";
      exportArchive.title = "导出 Markdown 和截图";
      this.archiveRetry = createElement(this.doc, "button", "zotagent-small-button", "重试归档");
      this.archiveRetry.addEventListener("click", () => this.archiveAction("retry"));
      this.archiveBar.append(this.archiveLabel, this.archiveSelect, openArchive, newArchive, exportArchive, this.archiveRetry);
      this.fullTextStatus = createElement(this.doc, "div", "zotagent-fulltext-status");

      this.messagesElement = createElement(this.doc, "div", "zotagent-messages");
      this.statusElement = createElement(this.doc, "div", "zotagent-status", "就绪");

      const composer = createElement(this.doc, "div", "zotagent-composer");
      this.promptInput = createElement(this.doc, "textarea", "zotagent-prompt-input");
      this.promptInput.placeholder = "向当前 Agent 提问（Enter 发送，Shift+Enter 换行）";
      this.promptInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
          event.preventDefault(); this.send();
        }
      });
      this.sendButton = createElement(this.doc, "button", "zotagent-primary-button", "发送");
      this.sendButton.addEventListener("click", () => this.send());
      this.stopButton = createElement(this.doc, "button", "zotagent-secondary-button", "停止");
      this.stopButton.disabled = true;
      this.stopButton.addEventListener("click", () => this.stop());
      const modeToggle = this.modeToggle = createElement(this.doc, "button", "zotagent-secondary-button", "打开原生终端");
      modeToggle.title = "打开当前 Agent 的原生交互终端";
      modeToggle.addEventListener("click", () => this.togglePtyMode());
      composer.append(this.promptInput, this.sendButton, this.stopButton, modeToggle);

      this.ptyContainer = createElement(this.doc, "div", "zotagent-pty-container");
      this.ptyContainer.style.display = "none";
      this.ptyOutput = createElement(this.doc, "div", "zotagent-pty-output");
      this.ptyInput = createElement(this.doc, "input", "zotagent-pty-input");
      this.ptyInput.placeholder = "终端输入 (Enter 发送)";
      this.ptyInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          this.sendPtyInput(this.ptyInput.value + "\n");
          this.ptyInput.value = "";
        }
      });
      this.terminalInfo = createElement(this.doc, "details", "zotagent-terminal-info");
      const terminalSummary = createElement(this.doc, "summary", "", "会话信息与恢复方法");
      this.terminalInfoText = createElement(this.doc, "div");
      this.terminalInfo.append(terminalSummary, this.terminalInfoText);
      this.ptyContainer.append(this.terminalInfo, this.ptyOutput, this.ptyInput);

      const actions = createElement(this.doc, "footer", "zotagent-actions");
      const copy = createElement(this.doc, "button", "zotagent-small-button", "复制 Markdown");
      copy.addEventListener("click", () => this.copyLastAnswer());
      const insert = createElement(this.doc, "button", "zotagent-small-button", "插入光标");
      insert.addEventListener("click", () => this.insertLastAnswer());
      const save = createElement(this.doc, "button", "zotagent-small-button", "保存子笔记");
      save.addEventListener("click", () => this.saveLastAnswer());
      const history = createElement(this.doc, "button", "zotagent-small-button", "历史");
      history.addEventListener("click", () => this.showHistoryPanel());
      actions.append(copy, insert, save, history);

      const contextDetails = createElement(this.doc, "div", "zotagent-context-details");
      contextDetails.append(executionBar, this.contextBar, this.selectionBox, this.refBar, this.extraItemsList, this.fullTextStatus);
      root.append(
        header,
        this.archiveBar,
        contextDetails,
        this.messagesElement,
        this.ptyContainer,
        this.statusElement,
        composer,
        actions,
      );
      return root;
    }

    enableDragging(root, handle) {
      handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button,select")) return;
        const rect = root.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const move = (moveEvent) => {
          root.style.left = `${Math.max(0, rect.left + moveEvent.clientX - startX)}px`;
          const top = Math.max(0, Math.min(rect.top + moveEvent.clientY - startY, (this.win.innerHeight || 800) - 432));
          root.style.top = `${top}px`;
          root.style.setProperty("--za-top", `${top}px`);
        };
        const stop = () => {
          this.win.removeEventListener("pointermove", move);
          this.win.removeEventListener("pointerup", stop);
        };
        this.win.addEventListener("pointermove", move);
        this.win.addEventListener("pointerup", stop, { once: true });
      });
    }

    updateContext(item) {
      if (item === undefined && (this.primaryContext || this._contextDetached)) return;
      let active;
      if (item !== undefined) {
        this.primaryContext = null;
        this._contextDetached = !item;
        this.extraItems = [];
        this.selectionInput.value = "";
        this.selectionSnapshot = null;
        this.selectionLabel.textContent = "PDF 选区";
        this.selectionSnapshot = null; this.captureTarget = null; this.captureAttachmentID = null;
        this.capturedImage = null; this.capturePreview.style.display = "none";
        const attachmentID = item?.getAttachments?.()[0];
        active = item ? { topItem: item, title: item.getField("title"), attachment: attachmentID ? Zotero.Items.get(attachmentID) : null } : null;
      } else active = this.controller.getActiveContext();
      this.context = active ? (this.primaryContext = active.items?.[0]
        ? { ...active, ...active.items[0], items: [active.items[0]] }
        : { ...active, items: [active] }) : null;
      this.contextBar.innerHTML = "";
      if (!this.context) {
        this.contextBar.textContent = "未绑定文献";
        this.contextBar.title = "";
        this.updateArchiveBar();
        return;
      }
      this.contextBar.append(createElement(this.doc, "span", "zotagent-primary-label", "主文献: "),
        createElement(this.doc, "strong", "", this.context.title || "未命名文献"));
      this.contextBar.title = this.context.attachmentPath || this.context.title || "";
      this.multiModeSelect.style.display = "inline-block";
      this.renderExtraItems();
      this.updateArchiveBar("正在准备记忆笔记...");
      const document = Zotero.ZotAgent.archiveFormat?.documentSnapshot(this.context.topItem);
      Zotero.ZotAgent.archive?.targetFor(document).then(() => this.updateArchiveBar()).catch(error => this.updateArchiveBar("归档笔记创建失败：" + error.message));
    }

    updateArchiveBar(message = "") {
      if (this._destroyed || !this.archiveLabel) return;
      const document = Zotero.ZotAgent.archiveFormat?.documentSnapshot(this.context?.topItem);
      this.archiveSelect.hidden = !document;
      if (!document) { this.archiveLabel.textContent = "本次不会自动归档：未绑定主文献"; this.archiveLabel.title = this.archiveLabel.textContent; this.archiveRetry.hidden = true; return; }
      const archive = Zotero.ZotAgent.archive;
      const target = archive?.current(document);
      let title = "准备中";
      if (target) { try { title = archive.resolve(target).getNoteTitle(); } catch { title = "原笔记不可用，请新建"; } }
      const failed = [...(archive?.pending.values() || [])].filter(e => e.record.primaryDocument.key === document.key && e.record.primaryDocument.libraryID === document.libraryID).length;
      this.archiveRetry.hidden = !failed;
      const notes = archive?.listNotes(document) || [];
      const signature = JSON.stringify([target?.noteKey, notes.map(note => [note.noteKey, note.title, note.archive])]);
      if (signature !== this._noteListSignature) {
        this._noteListSignature = signature;
        this.archiveSelect.replaceChildren();
        if (!notes.some(note => note.noteKey === target?.noteKey)) {
          const empty = createElement(this.doc, "option", "", "选择保存笔记…"); empty.value = ""; empty.selected = true; this.archiveSelect.append(empty);
        }
        for (const note of notes) {
          const option = createElement(this.doc, "option", "", note.title + (note.archive ? " · 归档" : ""));
          option.value = note.noteKey; option.selected = note.noteKey === target?.noteKey; this.archiveSelect.append(option);
        }
      }
      this.archiveLabel.textContent = `子笔记 ${notes.length}${failed ? " ⚠" : ""}`;
      this.archiveSelect.title = `保存到：${title}。切换仅影响后续提问；当前任务仍保存到原笔记。`;
      this.archiveLabel.title = message || (failed ? `${failed} 条待归档，可重试` : `主文献下共 ${notes.length} 个子笔记`);
      if (/失败|错误|不可用/.test(message)) this.renderStatus(message, true);
    }

    async archiveAction(action) {
      const document = Zotero.ZotAgent.archiveFormat.documentSnapshot(this.context?.topItem);
      if (!document) { this.updateArchiveBar(); return; }
      try {
        const archive = Zotero.ZotAgent.archive;
        if (action === "retry") { await archive.retry(document); this.updateArchiveBar("重试完成"); return; }
        const target = await archive.targetFor(document, action === "new");
        if (action === "open") await Zotero.Notes.open(archive.resolve(target).id);
        if (action === "export" && await Zotero.ZotAgent.archiveExport.exportNote(target, this.win)) this.renderStatus("Markdown 和图片已导出");
        this.updateArchiveBar();
      } catch (error) { this.updateArchiveBar(error.message); }
    }

    importSelectedItems() {
      const selected = this.controller.win.ZoteroPane?.getSelectedItems?.() || [];
      const currentId = this.context?.topItem?.id;
      let added = 0;
      for (const raw of selected) {
        const item = raw.isAttachment?.() && raw.parentItemID
          ? Zotero.Items.get(raw.parentItemID) : raw;
        if (!item || item.isNote?.()) continue;
        if (item.id === currentId) continue;
        if (this.extraItems.some((e) => e.topItem.id === item.id)) continue;
        const attachment = item.getAttachments?.()[0]
          ? Zotero.Items.get(item.getAttachments()[0]) : null;
        this.extraItems.push({
          title: item.getField("title"),
          topItem: item,
          attachment,
          includeFullText: false,
        });
        added++;
      }
      if (added) this.renderExtraItems();
      else this.renderStatus("没有可导入的新文献（已存在或未选择）");
    }

    setAllFullText(checked) {
      this.fullTextCheckbox.checked = checked;
      for (const entry of this.extraItems) entry.includeFullText = checked;
      this.renderExtraItems();
    }

    showPDFExport() {
      const entries = [this.context, ...this.extraItems].filter(entry => entry?.topItem);
      if (!entries.length) { this.renderStatus("没有可导出的文献", true); return; }
      this._pdfExportPanel?.remove();
      const panel = this._pdfExportPanel = createElement(this.doc, "div", "zotagent-pdf-export");
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "选择要导出 PDF 文本的文献");
      const title = createElement(this.doc, "strong", "zotagent-export-heading", "导出 PDF 文本");
      const hint = createElement(this.doc, "p", "zotagent-export-hint", "选择文献后，点击底部按钮选择保存文件夹。每篇文献单独保存为 Markdown。");
      const list = createElement(this.doc, "div", "zotagent-export-list");
      panel.append(title, hint, list);
      const choices = entries.map(entry => {
        const label = createElement(this.doc, "label");
        const checkbox = createElement(this.doc, "input"); checkbox.type = "checkbox"; checkbox.checked = true;
        label.append(checkbox, createElement(this.doc, "span", "", entry.title || "未命名")); list.append(label);
        return { entry, checkbox };
      });
      const save = createElement(this.doc, "button", "zotagent-small-button", "选择文件夹并导出");
      const cancel = createElement(this.doc, "button", "zotagent-small-button", "取消");
      const close = () => { panel.remove(); this._pdfExportPanel = null; this.element.querySelector(".zotagent-document-actions button")?.focus(); };
      cancel.addEventListener("click", close);
      panel.addEventListener("keydown", event => {
        if (event.key === "Escape" && !save.disabled) { event.preventDefault(); event.stopPropagation(); close(); }
      });
      save.addEventListener("click", async () => {
        const selected = choices.filter(c => c.checkbox.checked).map(c => c.entry);
        if (!selected.length) { hint.textContent = "请至少选择一篇文献。"; return; }
        save.disabled = true;
        try {
          const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
          const picker = new FilePicker(); picker.init(this.win, "选择 PDF 文本导出文件夹", picker.modeGetFolder);
          if (await picker.show() !== picker.returnOK) return;
          hint.textContent = "正在提取 PDF 文本，请稍候…";
          const result = await this.exportPDFTexts(selected, picker.file);
          this.renderStatus(`已导出 ${result.saved.length} 篇` + (result.failed.length ? "；失败：" + result.failed.join("；") : ""), result.failed.length > 0);
          panel.remove();
        } catch (error) { hint.textContent = "导出失败：" + error.message; }
        finally { save.disabled = false; }
      });
      const footer = createElement(this.doc, "div", "zotagent-export-footer");
      footer.append(cancel, save); panel.append(footer);
      this.element.append(panel);
      save.focus();
    }

    async exportPDFTexts(entries, destination) {
      const folder = Zotero.File.pathToFile(destination);
      const saved = [], failed = [];
      for (const entry of entries) {
        let output, reserved = false;
        try {
          const attachment = await preferredPDF(entry, entry === this.context);
          if (!attachment) throw new Error("没有可用 PDF 附件");
          const { text } = await extractPdfText(attachment);
          if (!text) throw new Error("未提取到文本（扫描件可能需要 OCR）");
          const item = entry.topItem;
          const title = String(entry.title || item.getField("title") || "未命名");
          const safe = Zotero.File.getValidFileName(title).slice(0, 100).replace(/[. ]+$/, "") || "文献";
          output = folder.clone(); output.append(safe + ".md");
          output.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o644);
          reserved = true;
          const creators = (item.getCreators?.() || []).map(c => c.name || [c.firstName, c.lastName].filter(Boolean).join(" ")).join("; ");
          const metadata = [`作者：${creators}`, `日期：${item.getField("date")}`, `DOI：${item.getField("DOI")}`, `Zotero Key：${item.key || ""}`];
          await Zotero.File.putContentsAsync(output, `# ${title}\n\n${metadata.join("\n\n")}\n\n## PDF 提取文本\n\n${text}\n`);
          saved.push(output.path);
        } catch (error) {
          if (reserved && output?.exists()) { try { output.remove(false); } catch {} }
          failed.push(`${entry.title || "未命名"}：${error.message}`);
        }
      }
      return { saved, failed };
    }

    renderExtraItems() {
      this.extraItemsList.replaceChildren();
      if (!this.extraItems.length) {
        this.extraItemsList.textContent = "暂无参考文献。请在 Zotero 主页面多选后点击“导入选中文献”。";
        return;
      }
      for (let i = 0; i < this.extraItems.length; i++) {
        const entry = this.extraItems[i];
        const row = createElement(this.doc, "div", "zotagent-extra-item");
        const cb = createElement(this.doc, "input");
        cb.type = "checkbox";
        cb.checked = entry.includeFullText;
        cb.title = "附加此文献的 PDF 全文";
        cb.addEventListener("change", () => { entry.includeFullText = cb.checked; });
        const titleSpan = createElement(this.doc, "span", "zotagent-extra-title");
        titleSpan.textContent = entry.title || "未命名";
        titleSpan.title = entry.title || "";
        const removeBtn = createElement(this.doc, "button", "zotagent-icon-button", "×");
        removeBtn.title = "移除";
        const idx = i;
        removeBtn.addEventListener("click", () => {
          this.extraItems.splice(idx, 1);
          this.renderExtraItems();
        });
        row.append(cb, titleSpan, removeBtn);
        this.extraItemsList.appendChild(row);
      }
    }

    receiveSelection(snapshot) {
      if (!this.receiveSelections) return;
      if (this._capturingImage) return;
      this.selectionSnapshot = snapshot;
      this.captureTarget = snapshot.annotation || null;
      this.captureAttachmentID = snapshot.attachmentID || null;
      const mode = String(pref("selectionMode", "replace"));
      this.selectionInput.value =
        mode === "append" && this.selectionInput.value
          ? `${this.selectionInput.value}\n\n${snapshot.text}`
          : snapshot.text;
      this.selectionLabel.textContent = snapshot.pageIndex === null
        ? "PDF 选区"
        : `PDF 选区 - 第 ${snapshot.pageIndex + 1} 页`;
    }

    _getReaderIframeWindow(reader) {
      return getReaderIframeWindow(reader);
    }

    _getPdfViewerApplication(reader) {
      const candidates = [
        reader?._internalReader?._lastView,
        reader?._internalReader?._primaryView,
        reader?._internalReader?._secondaryView,
        reader,
      ];
      for (const c of candidates) {
        for (const win of [c?._iframeWindow, c?._iframe?.contentWindow]) {
          if (!win) continue;
          if (win.PDFViewerApplication?.pdfDocument) return win.PDFViewerApplication;
          try {
            const wrapped = win.wrappedJSObject?.PDFViewerApplication;
            if (wrapped?.pdfDocument) return wrapped;
          } catch {}
        }
      }
      return null;
    }

    startAreaCapture() {
      const reader = this.controller.getReader();
      if (!reader) return this.renderStatus("请先打开 PDF 阅读器", true);
      const iframeWin = this._getReaderIframeWindow(reader);
      if (!iframeWin) {
        return this.renderStatus("无法访问阅读器视图，请确认 PDF 已加载完成", true);
      }
      const iframeDoc = iframeWin.document;
      this._capturingImage = true;
      this._captureReaderWindow = iframeWin;

      const previousLayerVisibility = this.controller.layer?.style.visibility || "";
      if (this.controller.layer) this.controller.layer.style.visibility = "hidden";

      const overlay = iframeDoc.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,0.08);user-select:none;-moz-user-select:none;";
      const rect = iframeDoc.createElement("div");
      rect.style.cssText = "position:fixed;border:2px dashed #2368a2;background:rgba(35,104,162,0.12);display:none;";
      overlay.appendChild(rect);
      (iframeDoc.body || iframeDoc.documentElement).appendChild(overlay);

      const previousUserSelect = iframeDoc.documentElement.style.userSelect;
      const previousMozUserSelect = iframeDoc.documentElement.style.MozUserSelect;
      iframeDoc.documentElement.style.userSelect = "none";
      iframeDoc.documentElement.style.MozUserSelect = "none";

      let startX = 0, startY = 0, dragging = false;
      let toolbar = null;
      let longSession = null;
      const cleanup = () => {
        longSession?.dispose?.();
        longSession = null;
        overlay.remove();
        toolbar?.remove();
        toolbar = null;
        iframeWin.removeEventListener("pointerdown", blockSelection, true);
        iframeWin.removeEventListener("pointermove", blockSelection, true);
        iframeWin.removeEventListener("pointerup", blockSelection, true);
        iframeWin.removeEventListener("keydown", onEsc, true);
        iframeDoc.documentElement.style.userSelect = previousUserSelect;
        iframeDoc.documentElement.style.MozUserSelect = previousMozUserSelect;
        if (this.controller.layer) this.controller.layer.style.visibility = previousLayerVisibility;
        this._capturingImage = false;
        this._captureReaderWindow = null;
        this._captureCleanup = null;
      };
      const blockSelection = (e) => {
        e.preventDefault();
      };
      const onDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.setPointerCapture?.(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        dragging = true;
        rect.style.display = "block";
        rect.style.left = startX + "px";
        rect.style.top = startY + "px";
        rect.style.width = "0";
        rect.style.height = "0";
      };
      const onMove = (e) => {
        e.preventDefault();
        if (!dragging) return;
        const x = Math.min(e.clientX, startX);
        const y = Math.min(e.clientY, startY);
        rect.style.left = x + "px";
        rect.style.top = y + "px";
        rect.style.width = Math.abs(e.clientX - startX) + "px";
        rect.style.height = Math.abs(e.clientY - startY) + "px";
      };
      const onUp = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = false;
        const x = Math.min(e.clientX, startX);
        const y = Math.min(e.clientY, startY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        if (w < 10 || h < 10) { cleanup(); return; }
        toolbar = iframeDoc.createElement("div");
        toolbar.style.cssText = `position:fixed;z-index:2147483647;left:${x}px;top:${Math.min(iframeWin.innerHeight - 42, y + h + 8)}px;display:flex;gap:6px;padding:5px 7px;background:#fff;border:1px solid #c7d7dc;border-radius:5px;box-shadow:0 3px 12px rgba(0,0,0,.2);font:13px system-ui,sans-serif;`;
        const makeButton = (label, title, handler, primary = false) => {
          const button = iframeDoc.createElement("button");
          button.textContent = label; button.title = title; button.type = "button";
          button.style.cssText = `min-width:${label === "长截图" ? 58 : 28}px;height:28px;border:1px solid ${primary ? "#159f91" : "#c7d7dc"};border-radius:4px;background:${primary ? "#159f91" : "#fff"};color:${primary ? "#fff" : "#24515a"};cursor:pointer;font-weight:${primary ? 600 : 400};`;
          button.addEventListener("click", handler);
          return button;
        };
        const cancel = makeButton("×", "取消截图", () => {
          cleanup();
          this.renderStatus("已取消截图");
        });
        const confirm = makeButton("✓", "确认截图", async () => {
          if (longSession) await longSession.finish();
          else { cleanup(); this.captureRegion(iframeWin, x, y, w, h); }
        }, true);
        const long = makeButton("长截图", "滚动采集并拼成长截图", () => {
          if (longSession) return;
          overlay.style.pointerEvents = "none";
          overlay.style.background = "transparent";
          rect.style.borderStyle = "solid";
          rect.style.background = "rgba(21,159,145,.06)";
          long.disabled = true;
          long.textContent = "采集中";
          longSession = this._captureLongSlices(
            iframeWin,
            iframeDoc.querySelector("#viewerContainer") || iframeDoc.scrollingElement || iframeDoc.documentElement,
            x, y, w, h, cleanup,
          );
        });
        toolbar.append(long, cancel, confirm);
        (iframeDoc.body || iframeDoc.documentElement).appendChild(toolbar);
        this.renderStatus("已选定区域：点击 ✓ 确认，点击“长截图”后滚动，× 取消");
      };
      const onEsc = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
          this.renderStatus("已取消截图");
        }
      };
      overlay.addEventListener("pointerdown", onDown);
      overlay.addEventListener("pointermove", onMove);
      overlay.addEventListener("pointerup", onUp);
      iframeWin.addEventListener("pointerdown", blockSelection, true);
      iframeWin.addEventListener("pointermove", blockSelection, true);
      iframeWin.addEventListener("pointerup", blockSelection, true);
      iframeWin.addEventListener("keydown", onEsc, true);
      overlay.addEventListener("selectstart", (event) => event.preventDefault());
      this._captureCleanup = cleanup;
      this.renderStatus("框选 PDF 区域后松开鼠标完成截图");
    }

    _captureLongSlices(iframeWin, scrollContainer, x, y, w, h, cleanup) {
      const slices = [];
      let captureTimer = null;
      let finished = false;
      const doc = iframeWin.document;
      const preview = doc.createElement("div");
      preview.style.cssText = `position:fixed;z-index:2147483647;left:${Math.min(iframeWin.innerWidth - 158, x + w + 10)}px;top:${Math.max(8, y)}px;width:142px;padding:5px;background:#fff;border:1px solid #159f91;border-radius:4px;box-shadow:0 3px 12px rgba(0,0,0,.2);font:12px system-ui,sans-serif;color:#24515a;`;
      const previewImage = doc.createElement("img");
      previewImage.alt = "长截图实时预览";
      previewImage.style.cssText = "display:block;width:132px;height:82px;object-fit:contain;background:#f3f8f9;border:1px solid #d5e3e6";
      const previewLabel = doc.createElement("div");
      previewLabel.style.cssText = "padding-top:4px;text-align:center";
      preview.append(previewImage, previewLabel);
      (doc.body || doc.documentElement).appendChild(preview);

      const capture = () => {
        if (finished) return;
        const frame = this._captureViewportRegion(iframeWin, x, y, w, h);
        if (!frame) return;
        const top = Number(scrollContainer.scrollTop || 0);
        if (slices.length && (top <= slices.at(-1).top || frame.data === slices.at(-1).data)) return;
        slices.push({ ...frame, top });
        previewImage.src = frame.data;
        previewLabel.textContent = `已采集 ${slices.length} 帧 · 点击 ✓ 完成`;
      };
      const scheduleCapture = () => {
        if (captureTimer) clearTimeout(captureTimer);
        captureTimer = setTimeout(capture, 180);
      };
      const onKey = (event) => {
        if (event.key === "Enter") { event.preventDefault(); finish(); }
      };
      const dispose = () => {
        if (captureTimer) clearTimeout(captureTimer);
        captureTimer = null;
        scrollContainer.removeEventListener("scroll", scheduleCapture);
        iframeWin.removeEventListener("wheel", scheduleCapture, true);
        iframeWin.removeEventListener("keydown", onKey, true);
        preview.remove();
      };
      const finish = async () => {
        if (finished) return;
        capture();
        finished = true;
        dispose();
        try {
          if (!slices.length) throw new Error("没有捕获到 PDF 内容");
          await this._stitchCaptureSlices(iframeWin, slices, w, h);
          cleanup();
          this.renderStatus(slices.length > 1 ? "长截图完成，可点击缩略图预览" : "未滚动，已保存当前选区");
        } catch (error) {
          cleanup();
          this.renderStatus("长截图拼接失败: " + error.message, true);
        }
      };

      scrollContainer.addEventListener("scroll", scheduleCapture, { passive: true });
      iframeWin.addEventListener("wheel", scheduleCapture, { capture: true, passive: true });
      iframeWin.addEventListener("keydown", onKey, true);
      capture();
      this.renderStatus("长截图采集中：在大框内正常滚动，查看小预览，点击 ✓ 完成，× 取消");
      return { finish, dispose };
    }

    _captureViewportRegion(iframeWin, x, y, w, h) {
      const doc = iframeWin.document;
      const canvases = [...new Set(doc.querySelectorAll(".page canvas, .canvasWrapper canvas, #viewer canvas"))]
        .filter((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return canvas.width > 0 && canvas.height > 0 && rect.right > x && rect.left < x + w && rect.bottom > y && rect.top < y + h;
        });
      if (!canvases.length) return null;
      const scale = Math.max(1, ...canvases.map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return Math.min(3, canvas.width / Math.max(1, rect.width));
      }));
      const output = doc.createElement("canvas");
      output.width = Math.max(1, Math.round(w * scale));
      output.height = Math.max(1, Math.round(h * scale));
      const ctx = output.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, output.width, output.height);
      for (const canvas of canvases) {
        const rect = canvas.getBoundingClientRect();
        const left = Math.max(x, rect.left);
        const top = Math.max(y, rect.top);
        const right = Math.min(x + w, rect.right);
        const bottom = Math.min(y + h, rect.bottom);
        if (right <= left || bottom <= top) continue;
        const canvasScaleX = canvas.width / Math.max(1, rect.width);
        const canvasScaleY = canvas.height / Math.max(1, rect.height);
        ctx.drawImage(
          canvas,
          (left - rect.left) * canvasScaleX,
          (top - rect.top) * canvasScaleY,
          (right - left) * canvasScaleX,
          (bottom - top) * canvasScaleY,
          (left - x) * scale,
          (top - y) * scale,
          (right - left) * scale,
          (bottom - top) * scale,
        );
      }
      return { data: output.toDataURL("image/png"), width: output.width, height: output.height };
    }

    async _stitchCaptureSlices(iframeWin, slices, width, height) {
      const images = [];
      for (const slice of slices) {
        const image = await new Promise((resolve, reject) => { const img = new iframeWin.Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = slice.data; });
        images.push(image);
      }
      const segments = [{ image: images[0], sourceY: 0, sourceHeight: images[0].height }];
      for (let index = 1; index < images.length; index += 1) {
        const delta = slices[index].top - slices[index - 1].top;
        if (delta <= 0) continue;
        const pixelsPerCss = images[index].height / Math.max(1, height);
        const newHeight = Math.min(images[index].height, Math.max(1, Math.round(delta * pixelsPerCss)));
        segments.push({ image: images[index], sourceY: images[index].height - newHeight, sourceHeight: newHeight });
      }
      const rawHeight = segments.reduce((sum, segment) => sum + segment.sourceHeight, 0);
      const outputScale = Math.min(1, 30000 / Math.max(1, rawHeight));
      const canvas = iframeWin.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(images[0].width * outputScale));
      canvas.height = Math.max(1, Math.round(rawHeight * outputScale));
      const ctx = canvas.getContext("2d");
      let destinationY = 0;
      for (const segment of segments) {
        const destinationHeight = Math.max(1, Math.round(segment.sourceHeight * outputScale));
        ctx.drawImage(segment.image, 0, segment.sourceY, segment.image.width, segment.sourceHeight, 0, destinationY, canvas.width, destinationHeight);
        destinationY += destinationHeight;
      }
      this.capturedImage = canvas.toDataURL("image/png");
      this.capturePreviewImage.src = this.capturedImage;
      this.capturePreview.style.display = "inline-flex";
      this.selectionLabel.textContent = `PDF 长截图 (${canvas.width}x${canvas.height})`;
    }

    captureRegion(iframeWin, x, y, w, h, updateUI = true) {
      try {
        const iframeDoc = iframeWin.document;
        const reader = this.controller.getReader();
        let canvas = null;

        // Strategy 1: via PDFViewerApplication pageView canvas (most reliable)
        const app = reader ? this._getPdfViewerApplication(reader) : null;
        if (app?.pdfViewer) {
          const pageIndex = (app.pdfViewer.currentPageNumber || 1) - 1;
          const pageView = app.pdfViewer.getPageView?.(pageIndex)
            || app.pdfViewer._pages?.[pageIndex];
          if (pageView) {
            const directCanvas = pageView.canvas || pageView.div?.querySelector("canvas");
            if (directCanvas?.width > 0 && directCanvas?.height > 0) {
              const r = directCanvas.getBoundingClientRect();
              if (r.top < y + h && r.bottom > y && r.left < x + w && r.right > x) {
                canvas = directCanvas;
              }
            }
          }
        }

        // Strategy 2: DOM query with intersection check
        if (!canvas) {
          const selectors = [
            ".page[data-page-number] .canvasWrapper canvas",
            ".page[data-page-number] canvas",
            ".page canvas",
            ".canvasWrapper canvas",
            "#viewer canvas",
            "#viewerContainer canvas",
            "canvas",
          ];
          for (const sel of selectors) {
            const candidates = iframeDoc.querySelectorAll(sel);
            for (const c of candidates) {
              const r = c.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && r.top < y + h && r.bottom > y && r.left < x + w && r.right > x) {
                canvas = c;
                break;
              }
            }
            if (canvas) break;
          }
        }

        // Strategy 3: pick largest visible canvas as last resort
        if (!canvas) {
          const all = iframeDoc.querySelectorAll("canvas");
          let bestArea = 0;
          for (const c of all) {
            const area = c.width * c.height;
            if (area > bestArea && c.width > 0) {
              bestArea = area;
              canvas = c;
            }
          }
        }

        if (!canvas) {
          this.renderStatus("未找到 PDF 画布，请确认 PDF 页面已渲染完成", true);
          return null;
        }

        const canvasRect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / canvasRect.width;
        const scaleY = canvas.height / canvasRect.height;
        const sx = Math.max(0, (x - canvasRect.left) * scaleX);
        const sy = Math.max(0, (y - canvasRect.top) * scaleY);
        const sw = Math.min(w * scaleX, canvas.width - sx);
        const sh = Math.min(h * scaleY, canvas.height - sy);

        if (sw <= 0 || sh <= 0) {
          this.renderStatus("选区超出画布范围", true);
          return null;
        }

        const tempCanvas = iframeDoc.createElement("canvas");
        tempCanvas.width = Math.round(sw);
        tempCanvas.height = Math.round(sh);
        const ctx = tempCanvas.getContext("2d");
        ctx.drawImage(canvas, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, tempCanvas.width, tempCanvas.height);
        const dataURL = tempCanvas.toDataURL("image/png");
        if (updateUI) {
          this.capturedImage = dataURL;
          this.capturePreviewImage.src = dataURL;
          this.capturePreview.style.display = "inline-flex";
          this.selectionLabel.textContent = `PDF 截图 (${tempCanvas.width}x${tempCanvas.height})`;
          this.renderStatus("截图完成，发送时将作为图像上下文");
        }
        return dataURL;
      } catch (error) {
        this._capturingImage = false;
        this._captureCleanup?.();
        this.renderStatus("截图失败: " + error.message, true);
        return null;
      }
    }

    showCapturePreview() {
      if (!this.capturedImage) return;
      const panel = createElement(this.doc, "div", "zotagent-image-preview");
      const close = createElement(this.doc, "button", "zotagent-icon-button", "×");
      close.title = "关闭预览";
      close.addEventListener("click", () => panel.remove());
      const image = createElement(this.doc, "img");
      image.src = this.capturedImage;
      image.alt = "PDF 截图";
      panel.append(close, image);
      this.element.appendChild(panel);
    }

    addMessage(role, text) {
      const item = { role, text, agent: this.agent };
      this.messages.push(item);
      const element = createElement(this.doc, "div", `zotagent-message is-${role}`);
      element.textContent = text;
      this.messagesElement.appendChild(element);
      this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
      return { item, element };
    }

    renderStatus(text, isError) {
      this.statusElement.textContent = text;
      this.statusElement.classList.toggle("is-error", Boolean(isError));
      this.statusElement.classList.toggle(
        "is-active",
        !isError && /正在|运行中|调用|执行|输出|连接|启动/.test(text),
      );
    }

    selectedModel() {
      // An empty OpenCode preference asks Runtime to resolve the latest recent
      // model; the other Agents continue using their native configuration.
      return this.agent === "opencode" ? String(pref("opencodeModel", "")).trim() || null : null;
    }

    updateModelLabel(model) {
      this.currentModel = model || null;
    }

    showApprovalUI(event) {
      this.dismissApproval();
      const raw = event.data?.raw || {};
      const toolName = raw.tool || raw.name || "unknown tool";
      const toolInput = raw.input || raw.command || raw.path || "";

      const container = createElement(this.doc, "div", "zotagent-approval");
      const label = createElement(this.doc, "div", "zotagent-approval-label");
      label.textContent = `审批请求: ${toolName}`;
      if (toolInput) {
        const detail = createElement(this.doc, "pre", "zotagent-approval-detail");
        detail.textContent = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
        container.appendChild(detail);
      }
      const actions = createElement(this.doc, "div", "zotagent-approval-actions");
      const approveBtn = createElement(this.doc, "button", "zotagent-approve-button", "允许");
      approveBtn.addEventListener("click", async () => {
        try {
          const res = await this.runtime.approve(this.requestID, true);
          this.dismissApproval();
          this.renderStatus(res?.ok === false ? "审批失败" : "已批准，Agent 继续执行...");
        } catch {
          this.dismissApproval();
          this.renderStatus("审批失败", true);
        }
      });
      const denyBtn = createElement(this.doc, "button", "zotagent-deny-button", "拒绝");
      denyBtn.addEventListener("click", async () => {
        try {
          const res = await this.runtime.approve(this.requestID, false);
          this.dismissApproval();
          this.renderStatus(res?.ok === false ? "拒绝失败" : "已拒绝工具调用");
        } catch {
          this.dismissApproval();
          this.renderStatus("拒绝失败", true);
        }
      });
      actions.append(approveBtn, denyBtn);
      container.append(label, actions);
      this.approvalElement = container;
      this.statusElement.parentNode.insertBefore(container, this.statusElement);
      this.renderStatus("Agent 正在等待审批");
    }

    dismissApproval() {
      if (this.approvalElement) {
        this.approvalElement.remove();
        this.approvalElement = null;
      }
    }

    async send() {
      const question = this.promptInput.value.trim();
      if (this._ptyMode || this._ptySwitching) { this.renderStatus("请在原生终端输入，或先返回对话后发送", true); return; }
      if (!question || this._requestState !== "idle") return;
      this.updateContext();
      const format = Zotero.ZotAgent.archiveFormat;
      const primaryDocument = format.documentSnapshot(this.context?.topItem);
      const contexts = [this.context && { ...this.context, includeFullText: this.fullTextCheckbox.checked }, ...this.extraItems.map(item => ({ ...item }))].filter(Boolean);
      const batch = {
        id: `${this.id}-${Date.now()}-${++dialogSequence}`, submittedAt: Date.now(),
        agent: this.agent, model: this.selectedModel(), question,
        cwd: this.cwdInput.value.trim() || pref("defaultWorkingDirectory", ""),
        primaryDocument, references: this.extraItems.map(item => format.documentSnapshot(item.topItem)), contexts,
        selection: this.selectionInput.value.trim(), selectionLabel: this.selectionLabel.textContent,
        selectionDocument: this.selectionSnapshot?.document || null,
        image: this.capturedImage || null, separate: this._multiMode === "separate" && contexts.length > 1,
        nativeSessionID: this.sessions[this.agent] || null, cancelled: false,
        archiveTarget: primaryDocument ? Zotero.ZotAgent.archive.targetFor(primaryDocument) : Promise.resolve(null),
      };
      batch.archiveTarget.catch(() => {});
      this._activeBatch = batch;
      this._requestState = "preparing";
      this.sendButton.disabled = true; this.stopButton.disabled = false;
      this.promptInput.value = "";
      this.addMessage("user", batch.separate ? `[分别处理 ${contexts.length} 篇] ${question}` : question);
      try {
        if (batch.separate) await this.sendSeparate(batch);
        else await this.executeQuestion(batch, contexts);
      } finally {
        if (this._activeBatch === batch) {
          this._activeBatch = null; this.requestID = null; this._requestState = "idle";
          this.sendButton.disabled = false; this.stopButton.disabled = true;
        }
      }
    }

    async sendSeparate(batch) {
      let succeeded = 0, failed = 0;
      for (let index = 0; index < batch.contexts.length; index++) {
        if (batch.cancelled) break;
        const context = batch.contexts[index];
        const record = await this.executeQuestion(batch, [context], index);
        if (record.status === "completed") succeeded++;
        else if (record.status !== "cancelled") failed++;
      }
      if (this._activeBatch === batch) {
        const cancelled = batch.contexts.length - succeeded - failed;
        this.renderStatus(`分别处理${cancelled ? "中断" : "完成"}: ${succeeded} 成功, ${failed} 失败${cancelled ? `, ${cancelled} 取消` : ""}`, failed > 0);
      }
    }

    async executeQuestion(batch, contexts, index = 0) {
      const format = Zotero.ZotAgent.archiveFormat;
      const request = {
        id: `${batch.id}-${index}`, submittedAt: batch.submittedAt, startedAt: Date.now(),
        windowID: this.id, agent: batch.agent, model: null, question: batch.question,
        primaryDocument: batch.primaryDocument, references: batch.references,
        targetDocument: batch.separate ? format.documentSnapshot(contexts[0]?.topItem) : null,
        selection: batch.separate ? "" : batch.selection, selectionLabel: batch.selectionLabel,
        selectionDocument: batch.selectionDocument,
        imageSnapshots: !batch.separate && batch.image ? [batch.image] : [],
        answer: "", status: "preparing", fullTextAttachments: [], operation: {}, finalized: false,
      };
      batch.request = request;
      this.requestID = request.id;
      const assistant = this.addMessage("assistant", "");
      assistant.item.agent = batch.agent;
      const visible = () => this._activeBatch === batch && !request.finalized;
      const check = () => { if (batch.cancelled || request.finalized) { const error = new Error("用户已中断"); error.name = "AbortError"; throw error; } };
      try {
        check();
        const fullTexts = [];
        for (const entry of contexts) {
          if (!entry.includeFullText) continue;
          const info = { title: entry.title || "未命名文献", documentKey: entry.topItem?.key, extractedChars: 0, state: "extracting" };
          request.fullTextAttachments.push(info);
          if (visible()) this.renderStatus("正在从 Zotero 提取 PDF 全文...");
          // Prefer the active main PDF and Zotero's preferred reference attachment.
          const attachment = await preferredPDF(entry, entry.topItem?.id === batch.contexts[0]?.topItem?.id);
          const extracted = attachment ? await extractPdfText(attachment) : { text: "" };
          check();
          info.extractedChars = Array.from(extracted.text).length;
          info.state = "prepared";
          if (extracted.text) fullTexts.push({ title: info.title, text: extracted.text });
        }
        check();
        if (this.fullTextStatus) this.fullTextStatus.textContent = request.fullTextAttachments.map(e => `${e.title}：${format.fullTextDescription(e)}`).join("\n");
        const prompt = this.buildRequestPrompt(batch, request, contexts, fullTexts);
        const payload = { windowID: this.id, requestID: request.id, agent: batch.agent,
          nativeSessionID: batch.separate ? null : batch.nativeSessionID, cwd: batch.cwd,
          model: batch.model, prompt, files: [], image: request.imageSnapshots[0] || null };
        request.status = "running";
        if (visible()) { this._requestState = "running"; this.renderStatus("Agent 运行中..."); }
        const result = await this.runtime.run(payload, event => {
          if (!visible() || batch.cancelled || event.requestID !== request.id) return;
          if (event.type === "request.started") {
            request.cwd = event.data?.cwd || batch.cwd;
            for (const entry of request.fullTextAttachments) if (entry.extractedChars) entry.state = "received";
          }
          if (event.type === "input.submitted") {
            for (const entry of request.fullTextAttachments) if (entry.extractedChars) entry.state = "submitted";
            if (this.fullTextStatus) this.fullTextStatus.textContent = request.fullTextAttachments.map(e => `${e.title}：${format.fullTextDescription(e)}`).join("\n");
          }
          if (event.type === "session.updated" && event.nativeSessionID) {
            request.nativeSessionID = event.nativeSessionID;
            if (!batch.separate) {
              this.sessions[batch.agent] = event.nativeSessionID;
              this.sessionDirectories[batch.agent] = request.cwd || batch.cwd;
              SessionHistory.upsert({ agent: batch.agent, nativeSessionID: event.nativeSessionID, windowID: this.id, cwd: request.cwd || batch.cwd,
                title: batch.primaryDocument?.title || "普通聊天", documentKey: batch.primaryDocument?.key || null,
                documentLibraryID: batch.primaryDocument?.libraryID ?? null,
                references: batch.references.map(d => ({ libraryID: d.libraryID, key: d.key })),
              });
            }
          }
          if (event.type === "message.delta" && event.data?.text) {
            request.answer += event.data.text;
            assistant.item.text = request.answer;
            assistant.element.textContent = request.answer;
            this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
          }
          if (event.type === "model.updated" && event.data?.model) { request.model = event.data.model; this.updateModelLabel(event.data.model); }
          const messages = { "tool.started": "Agent 正在调用工具...", "tool.completed": "工具调用完成", "command.started": "Agent 正在执行命令...", "command.output": "命令输出中...", "file.diff": "文件变更...", "artifact.created": "已创建文件" };
          if (messages[event.type]) this.renderStatus(messages[event.type]);
          if (event.type === "approval.requested") this.renderStatus("结构化请求无法回传审批，请停止后在原生终端另行执行", true);
          if (event.type === "error") this.renderStatus(event.data?.message || "Agent 返回错误", true);
          if (event.type === "request.completed" && event.data.code !== 0) request.failureSummary = `退出码 ${event.data.code}: ${event.data.stderr || "Agent 未成功完成"}`;
        }, request.operation);
        check();
        request.status = result.status;
        request.endedAt = result.endedAt;
        request.failureSummary = result.error || request.failureSummary;
      } catch (error) {
        if (!request.finalized) {
          request.status = batch.cancelled || error.name === "AbortError" ? "cancelled" : error.disconnected ? "disconnected" : "failed";
          request.endedAt = Date.now(); request.failureSummary = error.message;
          if (request.operation.sent) for (const entry of request.fullTextAttachments) if (entry.state === "prepared" && entry.extractedChars) entry.state = "sending";
        }
      } finally {
        this.finalizeRequest(batch, request);
      }
      if (this._activeBatch === batch && !batch.cancelled) {
        this.renderStatus(request.status === "completed" ? "完成" : request.failureSummary || format.labels[request.status], request.status !== "completed");
        if (request.status === "completed" && request.answer) {
          try {
            if (pref("autoInsertAtCursor", false) && !NoteService.insertAtActiveCursor(request.answer)) this.renderStatus(NoteService.lastInsertError, true);
            if (pref("autoSaveNotes", false) && contexts[0]?.topItem) await NoteService.createChildNote(contexts[0], request.answer);
          } catch (error) { this.renderStatus(`回答完成，单独保存/插入失败：${error.message}`, true); }
        }
        const session = this.sessions[batch.agent];
        if (!batch.separate && session) SessionHistory.updateMessages(batch.agent, session, this.messages.filter(m => !m.agent || m.agent === batch.agent).map(m => ({ role: m.role, text: m.text, agent: batch.agent })));
      }
      return request;
    }

    buildRequestPrompt(batch, request, contexts, fullTexts) {
      const format = Zotero.ZotAgent.archiveFormat;
      const documents = contexts.map(c => format.documentSnapshot(c.topItem)).filter(Boolean);
      const blocks = [];
      if (documents.length) blocks.push("## Zotero 文献上下文\n" + documents.map((d, i) => `[S${i + 1}] ${d.title} | ${d.authors} | ${d.year}${d.doi ? ` | DOI: ${d.doi}` : ""}`).join("\n"));
      for (const entry of fullTexts) blocks.push(`## PDF 全文: ${entry.title}\n${entry.text}`);
      if (request.imageSnapshots.length) blocks.push("## PDF 截图\n已附加 PDF 区域截图作为图像输入。");
      if (request.selection) blocks.push(`## 用户选择并确认的 PDF 文本 (${request.selectionLabel})${request.selectionDocument ? `\n来源：${request.selectionDocument.title}` : ""}\n${request.selection}`);
      blocks.push("## 用户问题\n" + batch.question);
      return blocks.join("\n\n");
    }

    finalizeRequest(batch, request) {
      if (request.finalized) return request.archiveTask;
      request.finalized = true;
      request.endedAt ||= Date.now();
      if (!request.primaryDocument) { this.updateArchiveBar(); return; }
      const { operation, finalized, archiveTask, ...data } = request;
      const record = JSON.parse(JSON.stringify(data));
      request.archiveTask = Zotero.ZotAgent.archive.save(record, batch.archiveTarget).then(() => {
        if (!this._destroyed) this.updateArchiveBar("历史已归档");
      }).catch(error => {
        if (!this._destroyed) this.updateArchiveBar("归档失败，可重试：" + error.message);
        Zotero.logError(error);
      });
      return request.archiveTask;
    }

    async stop() {
      const batch = this._activeBatch;
      if (!batch || batch.cancelled) return;
      batch.cancelled = true;
      const request = batch.request;
      if (request && !request.finalized) {
        request.status = "cancelled";
        request.endedAt = Date.now();
        request.failureSummary = "用户中断";
        request.operation.cancelled = true;
        this.finalizeRequest(batch, request);
        void this.runtime.cancel(request.id);
      }
      this._activeBatch = null; this.requestID = null; this._requestState = "idle";
      this.sendButton.disabled = false; this.stopButton.disabled = true;
      this.renderStatus("已中断，已保留收到的回答");
    }

    lastAnswer() {
      return [...this.messages].reverse().find((message) => message.role === "assistant" && message.text)?.text || "";
    }

    async copyLastAnswer() {
      const answer = this.lastAnswer();
      if (!answer) return this.renderStatus("没有可复制的回答", true);
      if (Zotero.Utilities?.Internal?.copyTextToClipboard) {
        Zotero.Utilities.Internal.copyTextToClipboard(answer);
      } else {
        await this.win.navigator.clipboard.writeText(answer);
      }
      this.renderStatus("Markdown 已复制");
    }

    async insertLastAnswer() {
      const answer = this.lastAnswer();
      if (!answer) return this.renderStatus("没有可插入的回答", true);
      try {
        const reader = this.controller.getReader?.();
        if (NoteService.insertIntoReaderCursor(reader, answer)) {
          this.renderStatus("已插入当前注释光标");
          return;
        }
        if (await NoteService.insertIntoAnnotation(this.captureTarget, this.captureAttachmentID, answer)) {
          this.renderStatus("已插入当前高亮/下划线注释");
          return;
        }
      } catch (error) {
        Zotero.logError(error);
      }
      const inserted = NoteService.insertAtActiveCursor(answer);
      this.renderStatus(inserted ? "已插入当前笔记" : NoteService.lastInsertError, !inserted);
    }

    async saveLastAnswer() {
      const answer = this.lastAnswer();
      if (!answer) return this.renderStatus("没有可保存的回答", true);
      try {
        await NoteService.saveWithConfirmation(this, this.context, answer);
      } catch (error) {
        this.renderStatus(error.message, true);
      }
    }

    showHistoryPanel() {
      if (this._historyPanel) {
        this._historyPanel.remove();
        this._historyPanel = null;
        return;
      }
      const entries = SessionHistory.load();
      const panel = createElement(this.doc, "div", "zotagent-history-panel");
      const header = createElement(this.doc, "div", "zotagent-history-header");
      const title = createElement(this.doc, "strong", "", "对话历史");
      const closeBtn = createElement(this.doc, "button", "zotagent-icon-button", "×");
      closeBtn.addEventListener("click", () => {
        panel.remove();
        this._historyPanel = null;
      });
      header.append(title, closeBtn);
      panel.appendChild(header);

      if (!entries.length) {
        panel.appendChild(createElement(this.doc, "div", "zotagent-history-empty", "暂无历史记录"));
      } else {
        const list = createElement(this.doc, "div", "zotagent-history-list");
        for (const entry of entries) {
          const row = createElement(this.doc, "div", "zotagent-history-row");
          const agentLabel = { opencode: "OpenCode", codex: "Codex", "claude-code": "Claude" }[entry.agent] || entry.agent;
          const info = createElement(this.doc, "div", "zotagent-history-info");
          info.innerHTML = `<strong>${escapeHTML(agentLabel)}</strong> <span>${escapeHTML(entry.title || "")}</span>`;
          const time = createElement(this.doc, "div", "zotagent-history-time");
          time.textContent = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "";
          const btns = createElement(this.doc, "div", "zotagent-history-btns");
          const restore = createElement(this.doc, "button", "zotagent-small-button", "恢复");
          restore.addEventListener("click", () => {
            this.restoreSession(entry);
            panel.remove();
            this._historyPanel = null;
          });
          const del = createElement(this.doc, "button", "zotagent-small-button", "删除");
          del.addEventListener("click", () => {
            SessionHistory.remove(entry.agent, entry.nativeSessionID);
            row.remove();
          });
          btns.append(restore, del);
          row.append(info, time, btns);
          list.appendChild(row);
        }
        panel.appendChild(list);
      }
      this.messagesElement.parentNode.insertBefore(panel, this.messagesElement);
      this._historyPanel = panel;
    }

    restoreSession(entry) {
      if (this._requestState !== "idle" || this._ptyMode || this._ptySwitching) { this.renderStatus("请先停止当前任务并返回结构化对话，再恢复历史会话", true); return; }
      this.agent = entry.agent;
      this.sessions[entry.agent] = entry.nativeSessionID;
      this.sessionDirectories[entry.agent] = entry.cwd || "";
      if (entry.cwd) this.cwdInput.value = entry.cwd;
      const agentSelect = this.element.querySelector(".zotagent-agent-select");
      if (agentSelect) agentSelect.value = entry.agent;
      this.element.dataset.agent = entry.agent;
      this.messagesElement.innerHTML = "";
      this.messages = [];
      if (entry.documentKey && entry.documentLibraryID != null) {
        try {
          const item = Zotero.Items.getByLibraryAndKey(entry.documentLibraryID, entry.documentKey);
          if (item && !item.deleted) {
            this.updateContext(item);
          } else {
            this.updateContext(null);
            this.renderStatus("原始文献已不存在，本次不会自动归档", true);
          }
        } catch {
          this.updateContext(null);
          this.renderStatus("无法恢复文献上下文，本次不会自动归档", true);
        }
      }
      if (!entry.documentKey || entry.documentLibraryID == null) this.updateContext(null);
      if (this.context) {
        for (const reference of entry.references || []) {
          const item = Zotero.Items.getByLibraryAndKey(reference.libraryID, reference.key);
          if (!item || item.deleted || item.id === this.context.topItem.id) continue;
          const attachmentID = item.getAttachments?.()[0];
          this.extraItems.push({ topItem: item, title: item.getField("title"), attachment: attachmentID ? Zotero.Items.get(attachmentID) : null, includeFullText: false });
        }
        this.renderExtraItems();
      }
      if (entry.messages?.length) {
        for (const msg of entry.messages) {
          this.addMessage(msg.role, msg.text);
        }
      }
      this.renderStatus(`已恢复 ${entry.agent} 会话`);
    }

    showSaveConfirmation(context, markdown, resolve) {
      this.dismissSaveConfirmation();
      const panel = createElement(this.doc, "div", "zotagent-save-confirm");
      const label = createElement(this.doc, "div", "zotagent-save-confirm-label");
      const items = context?.items || [context];
      const targetName = items.length > 1
        ? `${items.length} 篇文献（综合笔记关联全部来源）`
        : (context?.title || "当前条目");
      label.textContent = `保存到: ${targetName}`;

      const btns = createElement(this.doc, "div", "zotagent-save-confirm-btns");
      const confirmBtn = createElement(this.doc, "button", "zotagent-primary-button", "确认保存");
      confirmBtn.style.minHeight = "24px";
      confirmBtn.style.fontSize = "11px";
      confirmBtn.addEventListener("click", async () => {
        panel.remove();
        this._saveConfirmPanel = null;
        try {
          if (items.length > 1) {
            await NoteService.createCombinedNote(context, markdown);
          } else {
            await NoteService.createChildNote(context, markdown);
          }
          this.renderStatus("已保存");
          resolve(true);
        } catch (e) {
          this.renderStatus(e.message, true);
          resolve(false);
        }
      });
      const cancelBtn = createElement(this.doc, "button", "zotagent-secondary-button", "取消");
      cancelBtn.style.minHeight = "24px";
      cancelBtn.style.fontSize = "11px";
      cancelBtn.addEventListener("click", () => {
        panel.remove();
        this._saveConfirmPanel = null;
        this.renderStatus("已取消保存");
        resolve(false);
      });
      btns.append(confirmBtn, cancelBtn);
      panel.append(label, btns);
      this.statusElement.parentNode.insertBefore(panel, this.statusElement);
      this._saveConfirmPanel = panel;
    }

    dismissSaveConfirmation() {
      if (this._saveConfirmPanel) {
        this._saveConfirmPanel.remove();
        this._saveConfirmPanel = null;
      }
    }

    async togglePtyMode() {
      if (this._ptySwitching) return;
      if (this._requestState !== "idle") { this.renderStatus("请等待当前回答结束，或点击停止后再打开原生终端", true); return; }
      this._ptySwitching = true;
      this.modeToggle.disabled = true;
      try {
        if (this._ptyMode) {
          this._ptyMode = false;
          this.ptyContainer.style.display = "none";
          this.messagesElement.style.display = "";
          this.selectionBox.style.display = "";
          this.renderStatus("已切换回结构化视图");
          await this.closePty();
        } else {
          this._ptyMode = true;
          this.ptyContainer.style.display = "";
          this.messagesElement.style.display = "none";
          this.selectionBox.style.display = "none";
          const label = { "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode" }[this.agent] || this.agent;
          this.renderStatus(`${label} 原生终端`);
          await this.startPty();
        }
      } finally {
        this._ptySwitching = false;
        this.modeToggle.disabled = false;
        this.modeToggle.textContent = this._ptyMode ? "返回对话" : "打开原生终端";
        this.promptInput.disabled = Boolean(this._ptyMode);
        this.sendButton.disabled = Boolean(this._ptyMode);
        this.cwdInput.disabled = Boolean(this._ptyMode);
        this.element.querySelector(".zotagent-agent-select").disabled = Boolean(this._ptyMode);
      }
    }

    async startPty() {
      try {
        await RuntimeManager.ensureRunning();
        await this.controller.xtermReady;
        if (this._destroyed) return;
        const Terminal = this.controller.xtermTerminal;
        if (typeof Terminal !== "function") throw new Error("终端渲染器加载失败");
        this._terminal?.dispose();
        this._terminal = new Terminal({
          cursorBlink: true,
          convertEol: false,
          fontFamily: '"Cascadia Code", Consolas, monospace',
          fontSize: 12,
          theme: { background: "#f7fbfd", foreground: "#24515a", cursor: "#159f91", selectionBackground: "#cde9e5" },
        });
        this.ptyOutput.replaceChildren();
        this._terminal.open(this.ptyOutput);
        this._terminal.onData((data) => this.sendPtyInput(data));
        const response = await Promise.race([
          fetch(this.runtime.endpoint("/v1/pty/create"), {
            method: "POST",
            headers: this.runtime.headers(),
            body: JSON.stringify({
              agent: this.agent,
              cwd: this.sessions[this.agent] ? this.sessionDirectories[this.agent] || this.cwdInput.value.trim() || pref("defaultWorkingDirectory", "") : this.cwdInput.value.trim() || pref("defaultWorkingDirectory", ""),
              sessionID: this.sessions[this.agent] || null,
              cols: this._terminal.cols,
              rows: this._terminal.rows,
            }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("PTY 创建超时")), 8000)),
        ]);
        if (!response.ok) throw new Error(`终端创建失败: ${response.status} · ${await response.text()}`);
        const data = await response.json();
        this._ptyID = data.ptyID;
        if (this._destroyed) { await this.closePty(); return; }
        this.showTerminalInfo(data);
        this.ptyInput.style.display = "none";
        this._terminal.focus();
        if (this.win.ResizeObserver) {
          this._terminalResizeObserver?.disconnect();
          this._terminalResizeObserver = new this.win.ResizeObserver(() => this.fitTerminal());
          this._terminalResizeObserver.observe(this.ptyOutput);
        }
        this.fitTerminal();
        const label = { "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode" }[this.agent] || this.agent;
        this.renderStatus(`${label} 原生终端已连接`);
        this.streamPtyOutput();
      } catch (error) {
        this._terminal?.dispose();
        this._terminal = null;
        this._ptyMode = false;
        this.ptyContainer.style.display = "none";
        this.messagesElement.style.display = "";
        this.selectionBox.style.display = "";
        this.ptyInput.style.display = "";
        this.renderStatus("原生终端启动失败: " + error.message, true);
      }
    }

    showTerminalInfo(data) {
      if (data.resumeMode === "picker") {
        const command = this.agent === "codex" ? "codex resume --all --include-non-interactive" : "CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume";
        const lines = ["已打开原生会话恢复列表，请选择一条历史对话。",
          `环境：${data.platform || "未知"}${data.wslDistro ? ` / ${data.wslDistro}` : ""}`,
          `工作目录：${data.cwd}`, `CLI：${data.executable || ""}`,
          data.previousNativeSessionID ? `当前结构化聊天的会话 ID（供核对）：${data.previousNativeSessionID}` : "当前结构化聊天尚无会话 ID。",
          data.platform === "windows" && this.agent === "claude-code" ? 'PowerShell：$env:CLAUDE_CODE_ENTRYPOINT="sdk-cli"; claude --resume' : command,
          this.agent === "codex" ? "列表包含非交互会话及其他工作目录的会话；这里选择后不保证后续 /resume 保持相同筛选。" : "已为此终端启用 SDK 会话显示；Claude 默认按目录筛选，可在恢复列表按 Ctrl+A 显示所有项目。",
          "为避免重复写入，关闭此原生终端后才能在其他窗口继续向同一 Agent 提问。原生终端中的新增消息不会自动归档。"];
        this.terminalInfoText.textContent = lines.join("\n");
        this.terminalInfo.title = "原生会话恢复列表";
        return;
      }
      const id = data.nativeSessionID;
      const command = id && this.agent === "codex" ? `codex resume ${id}` : id && this.agent === "claude-code" ? `claude --resume ${id}` : "未指定会话 ID，打开的是独立原生终端。";
      const lines = [id ? `恢复会话：${id}` : "独立原生会话", `环境：${data.platform || "未知"}${data.wslDistro ? ` / ${data.wslDistro}` : ""}`,
        `工作目录：${data.cwd}`, `CLI：${data.executable || ""}`, command,
        "请在相同环境和上述工作目录执行恢复命令；恢复不会重新提交 PDF 全文。原生终端中的新增消息不会自动归档。"];
      if (this.agent === "codex") lines.push("查看包含结构化会话的列表：codex resume --all --include-non-interactive", "手动停止后出现 Conversation interrupted 属正常中断记录；可以在终端继续提问。");
      this.terminalInfoText.textContent = lines.join("\n");
      this.terminalInfo.title = id ? `会话 ${id}` : "当前未恢复结构化会话";
    }

    async streamPtyOutput() {
      if (!this._ptyID) return;
      try {
        const response = await fetch(
          this.runtime.endpoint(`/v1/pty/read?id=${encodeURIComponent(this._ptyID)}`),
          { headers: this.runtime.headers() },
        );
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "pty.output" || event.type === "pty.stderr") {
                this._terminal?.write(event.data);
              }
              if (event.type === "pty.closed") {
                this.renderStatus(`原生终端已关闭 (退出码 ${event.code})`);
                this._ptyID = null;
              }
            } catch {}
          }
          if (done) break;
        }
      } catch {
        if (this._ptyID) this.renderStatus("原生终端连接断开", true);
      }
    }

    sendPtyInput(text) {
      if (!this._ptyID) return;
      fetch(this.runtime.endpoint("/v1/pty/write"), {
        method: "POST",
        headers: this.runtime.headers(),
        body: JSON.stringify({ ptyID: this._ptyID, input: text }),
      }).catch(() => {});
    }

    fitTerminal() {
      const terminal = this._terminal;
      if (!terminal || !this._ptyID || !this._ptyMode) return;
      const screen = terminal.element?.querySelector(".xterm-screen")?.getBoundingClientRect();
      if (!screen?.width || !screen.height) return;
      const style = this.win.getComputedStyle(this.ptyOutput);
      const width = this.ptyOutput.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
      const height = this.ptyOutput.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0);
      if (width <= 0 || height <= 0) return;
      const cols = Math.max(2, Math.floor(width / (screen.width / terminal.cols)));
      const rows = Math.max(1, Math.floor(height / (screen.height / terminal.rows)));
      if (cols === terminal.cols && rows === terminal.rows) return;
      terminal.resize(cols, rows);
      fetch(this.runtime.endpoint("/v1/pty/resize"), { method: "POST", headers: this.runtime.headers(),
        body: JSON.stringify({ ptyID: this._ptyID, cols, rows }) }).catch(() => {});
    }

    async closePty() {
      this._terminalResizeObserver?.disconnect();
      if (this._ptyID) {
        try {
          await fetch(this.runtime.endpoint("/v1/pty/close"), {
            method: "POST",
            headers: this.runtime.headers(),
            body: JSON.stringify({ ptyID: this._ptyID }),
          });
        } catch {}
      }
      this._ptyID = null;
      this._terminal?.dispose();
      this._terminal = null;
      this.ptyInput.style.display = "";
    }

    destroy() {
      this.stop();
      this._destroyed = true;
      this._contentObserver?.disconnect();
      this._contentResizeObserver?.disconnect();
      if (this._fitFrame) this.win.cancelAnimationFrame?.(this._fitFrame);
      this.win.removeEventListener("resize", this._scheduleFit);
      this.win.removeEventListener("pointerup", this._rememberManualSize);
      this.win.removeEventListener("pointercancel", this._rememberManualSize);
      this.win.removeEventListener("blur", this._rememberManualSize);
      this._archiveUnsubscribe?.();
      this._captureCleanup?.();
      this._terminalResizeObserver?.disconnect();
      if (this._ptyID) this.closePty();
      this.element.remove();
      this.controller.dialogs.delete(this.id);
    }
  }

  const DEFAULT_SHORTCUT = { key: "Y", modifiers: "accel,shift" };

  function parseShortcut(str) {
    if (!str) return DEFAULT_SHORTCUT;
    const parts = str.split("+").map((s) => s.trim().toLowerCase());
    const key = (parts.pop() || "Y").toUpperCase();
    const modifiers = parts
      .map((m) => (m === "ctrl" || m === "cmd" ? "accel" : m))
      .join(",");
    return { key, modifiers: modifiers || "accel,shift" };
  }

  class MainWindowController {
    constructor(win) {
      this.win = win;
      this.doc = win.document;
      this.dialogs = new Map();
      this.lastSelectionKey = "";
      this.mount();
    }

    mount() {
      const style = createElement(this.doc, "link");
      style.id = "zotagent-styles";
      style.rel = "stylesheet";
      style.href = "chrome://zotagent/content/styles.css";
      this.doc.documentElement.appendChild(style);

      const xtermStyle = createElement(this.doc, "link");
      xtermStyle.id = "zotagent-xterm-styles";
      xtermStyle.rel = "stylesheet";
      xtermStyle.href = "chrome://zotagent/content/vendor/xterm.css";
      this.doc.documentElement.appendChild(xtermStyle);
      this.xtermReady = new Promise((resolve, reject) => {
        if (typeof this.win.Terminal === "function") {
          this.xtermTerminal = this.win.Terminal;
          return resolve();
        }
        const script = createElement(this.doc, "script");
        script.id = "zotagent-xterm-script";
        script.src = "chrome://zotagent/content/vendor/xterm.js";
        script.addEventListener("load", () => {
          if (typeof this.win.Terminal !== "function") {
            reject(new Error("xterm.js 未导出 Terminal"));
            return;
          }
          // Keep xterm private to ZotAgent instead of leaving a global that can
          // collide with another Zotero plugin using the same library.
          this.xtermTerminal = this.win.Terminal;
          try { delete this.win.Terminal; } catch { this.win.Terminal = undefined; }
          resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error("xterm.js 加载失败")), { once: true });
        this.doc.documentElement.appendChild(script);
      });

      this.layer = createElement(this.doc, "div", "zotagent-layer");
      this.layer.id = "zotagent-layer";
      this.doc.documentElement.appendChild(this.layer);

      this.mountMainToolbarButton();
      this.mountReaderToolbarButton();
      this.mountReaderSelectionListener();
      this.mountShortcut();

      const toolsMenu = this.doc.querySelector("#menu_ToolsPopup");
      if (toolsMenu) {
        this.menuItem = this.doc.createXULElement("menuitem");
        this.menuItem.id = "zotagent-menu-new-window";
        this.menuItem.setAttribute("label", "新建 ZotAgent 对话框");
        this.menuItem.addEventListener("command", () => this.addDialog());
        toolsMenu.appendChild(this.menuItem);
      }

      this.selectionTimer = this.win.setInterval(() => this.pollSelection(), 450);
      this.contextTimer = this.win.setInterval(() => {
        for (const dialog of this.dialogs.values()) dialog.updateContext();
      }, 1200);
    }

    mountMainToolbarButton() {
      this.doc.querySelector("#zotagent-toolbar-button")?.remove();
      const btn = this.doc.createXULElement("toolbarbutton");
      btn.id = "zotagent-toolbar-button";
      btn.setAttribute("class", "zotero-tb-button");
      btn.setAttribute("tooltiptext", "ZotAgent");
      btn.setAttribute("tabindex", "-1");
      btn.setAttribute("image", "chrome://zotagent/content/icon.svg");
      btn.addEventListener("command", () => this.addDialog());
      this.mainToolbarButton = btn;

      const syncBtn = this.doc.querySelector("#zotero-tb-sync");
      if (syncBtn?.parentNode) {
        syncBtn.parentNode.insertBefore(btn, syncBtn);
        return;
      }
      const tabsToolbar = this.doc.querySelector("#zotero-tabs-toolbar");
      if (tabsToolbar) {
        tabsToolbar.appendChild(btn);
        return;
      }
      const itemsToolbar = this.doc.querySelector("#zotero-items-toolbar");
      if (itemsToolbar) {
        itemsToolbar.appendChild(btn);
        return;
      }
      this._toolbarObserver = new this.win.MutationObserver(() => {
        const target = this.doc.querySelector("#zotero-tb-sync")?.parentNode
          || this.doc.querySelector("#zotero-tabs-toolbar");
        if (target) {
          const sync = this.doc.querySelector("#zotero-tb-sync");
          if (sync) target.insertBefore(btn, sync);
          else target.appendChild(btn);
          this._toolbarObserver?.disconnect();
          this._toolbarObserver = null;
        }
      });
      this._toolbarObserver.observe(this.doc.documentElement, {
        childList: true, subtree: true,
      });
    }

    mountReaderToolbarButton() {
      this._renderToolbarHandler = (event) => {
        const { doc, append } = event;
        const btn = doc.createElement("button");
        btn.className = "zotagent-reader-toolbar-btn";
        btn.title = "ZotAgent";
        btn.innerHTML = `<img src="chrome://zotagent/content/icon.svg" width="16" height="16" style="vertical-align:middle;" />`;
        btn.addEventListener("click", () => this.addDialog());
        const wrapper = doc.createElement("div");
        wrapper.className = "zotagent-reader-toolbar-wrapper";
        wrapper.style.order = "-1";
        wrapper.appendChild(btn);
        append(wrapper);
      };
      Zotero.Reader.registerEventListener(
        "renderToolbar",
        this._renderToolbarHandler,
        PLUGIN_ID,
      );
    }

    _normalizeSelectedText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    _readerSelectionCandidates(reader) {
      const internal = reader?._internalReader;
      const state = internal?._state;
      // Never fall back to the other split view: it can retain an old selection.
      const view = internal?._lastView;
      const secondary = view && view === internal?._secondaryView
        ? true
        : view && view === internal?._primaryView
          ? false
          : internal?._lastViewPrimary === false || state?.primary === false;
      return secondary
        ? [state?.secondaryViewSelectionPopup?.annotation, internal?._secondaryView?._selectionPopup?.annotation]
        : [state?.primaryViewSelectionPopup?.annotation, internal?._primaryView?._selectionPopup?.annotation];
    }

    _readReaderSelection(reader, event = null) {
      const eventAnnotation = event?.params?.annotation || null;
      const eventText = this._normalizeSelectedText(
        eventAnnotation?.text || event?.params?.text || event?.params?.selectedText,
      );
      if (eventText) {
        // Once native events work for this reader, polling must not overwrite
        // them with stale popup state (or overwrite the user's manual edits).
        this._selectionEventReaders ||= new WeakSet();
        if (reader) this._selectionEventReaders.add(reader);
        return { text: eventText, annotation: eventAnnotation };
      }
      if (reader && this._selectionEventReaders?.has(reader)) {
        return { text: "", annotation: null };
      }

      // Zotero PDF selections are not necessarily DOM selections. In some
      // PDFs getSelection() returns unrelated text-layer offsets or old text.
      // Only use native popup annotations, including on the polling fallback.
      for (const annotation of this._readerSelectionCandidates(reader)) {
        const text = this._normalizeSelectedText(annotation?.text);
        if (text) return { text, annotation };
      }
      return { text: "", annotation: null };
    }

    _publishReaderSelection(reader, text, annotation = null) {
      if (!text || !this.dialogs.size) return;
      const pageIndex = readPosition(annotation);
      const key = `${reader?._item?.id || reader?.itemID || ""}:${pageIndex}:${text}`;
      if (key === this.lastSelectionKey) return;
      this.lastSelectionKey = key;
      const snapshot = {
        text,
        pageIndex,
        attachmentID: reader?._item?.id || reader?.itemID || null,
        annotation,
        document: Zotero.ZotAgent.archiveFormat?.documentSnapshot(reader?._item?.parentItemID ? Zotero.Items.get(reader._item.parentItemID) : reader?._item),
      };
      for (const dialog of this.dialogs.values()) dialog.receiveSelection(snapshot);
    }

    mountReaderSelectionListener() {
      this._textSelectionHandler = (event) => {
        try {
          const selection = this._readReaderSelection(event.reader, event);
          this._publishReaderSelection(event.reader, selection.text, selection.annotation);
        } catch (error) {
          Zotero.debug(`[ZotAgent] PDF selection event failed: ${error.message}`);
        }
      };
      Zotero.Reader.registerEventListener(
        "renderTextSelectionPopup",
        this._textSelectionHandler,
        PLUGIN_ID,
      );
    }

    mountShortcut() {
      const shortcutStr = pref("shortcut", "Ctrl+Shift+Y");
      const { key, modifiers } = parseShortcut(shortcutStr);
      const modList = modifiers.split(",").map((m) => m.trim().toLowerCase());

      this._shortcutHandler = (event) => {
        if (event.defaultPrevented) return;
        const target = event.target;
        const editable = target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.localName || target?.tagName || "");
        if (editable) return;
        const pressedKey = event.key.toUpperCase();
        if (pressedKey !== key.toUpperCase()) return;
        const needCtrl = modList.includes("accel") || modList.includes("control");
        const needShift = modList.includes("shift");
        const needAlt = modList.includes("alt");
        const ctrlOk = needCtrl ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey);
        const shiftOk = needShift ? event.shiftKey : !event.shiftKey;
        const altOk = needAlt ? event.altKey : !event.altKey;
        if (ctrlOk && shiftOk && altOk) {
          event.preventDefault();
          this.toggleDialog();
        }
      };
      this.doc.addEventListener("keydown", this._shortcutHandler, true);
    }

    toggleDialog() {
      const existing = [...this.dialogs.values()];
      if (!existing.length) {
        this.addDialog();
        return;
      }
      const allMinimized = existing.every((d) => d.element.classList.contains("is-minimized"));
      for (const d of existing) {
        if (allMinimized) d.element.classList.remove("is-minimized");
        else d.element.classList.add("is-minimized");
      }
    }

    addDialog() {
      const dialog = new AgentDialog(this);
      this.dialogs.set(dialog.id, dialog);
      return dialog;
    }

    getReader() {
      try {
        if (this.win.Zotero_Tabs?.selectedType !== "reader") return null;
        return Zotero.Reader.getByTabID(this.win.Zotero_Tabs.selectedID);
      } catch {
        return null;
      }
    }

    getActiveContext() {
      try {
        if (this.win.Zotero_Tabs?.selectedType === "reader") {
          const attachment = this.getReader()?._item;
          if (!attachment) return null;
          const topItem = attachment.parentItemID
            ? Zotero.Items.get(attachment.parentItemID)
            : attachment;
          const attachmentPath = attachment.getFilePath?.() || "";
          return {
            title: topItem.getField("title") || attachment.getField("title"),
            topItem,
            attachment,
            attachmentPath,
            wslPath: windowsToWSLPath(attachmentPath),
          };
        }
        const selected = this.win.ZoteroPane?.getSelectedItems?.() || [];
        const items = selected
          .map((item) => (item.isAttachment?.() && item.parentItemID ? Zotero.Items.get(item.parentItemID) : item))
          .filter((item) => item && !item.isNote?.());
        if (!items.length) return null;
        return {
          title: items[0].getField("title"),
          topItem: items[0],
          items: items.map((item) => ({ title: item.getField("title"), topItem: item })),
        };
      } catch (error) {
        Zotero.logError(error);
        return null;
      }
    }

    pollSelection() {
      try {
        const reader = this.getReader();
        const activeIframe = getReaderIframeWindow(reader);
        for (const dialog of this.dialogs.values()) {
          if (dialog._capturingImage && dialog._captureReaderWindow !== activeIframe) {
            dialog._captureCleanup?.();
            dialog.renderStatus("已停止截图：阅读器已切换");
          }
        }
        const view = reader?._internalReader?._lastView;
        const annotationTarget = view?._annotationPopup?.annotation || null;
        if (annotationTarget) {
          for (const dialog of this.dialogs.values()) {
            dialog.captureTarget = annotationTarget;
            dialog.captureAttachmentID = reader?._item?.id || null;
          }
        }
        const selection = this._readReaderSelection(reader);
        this._publishReaderSelection(reader, selection.text, selection.annotation);
      } catch (error) {
        Zotero.debug(`[ZotAgent] PDF selection polling failed: ${error.message}`);
      }
    }

    destroy() {
      this.win.clearInterval(this.selectionTimer);
      this.win.clearInterval(this.contextTimer);
      for (const dialog of [...this.dialogs.values()]) dialog.destroy();
      this.menuItem?.remove();
      this.mainToolbarButton?.remove();
      this._toolbarObserver?.disconnect();
      if (this._renderToolbarHandler) {
        Zotero.Reader.unregisterEventListener("renderToolbar", this._renderToolbarHandler);
      }
      if (this._textSelectionHandler) {
        Zotero.Reader.unregisterEventListener("renderTextSelectionPopup", this._textSelectionHandler);
      }
      if (this._shortcutHandler) {
        this.doc.removeEventListener("keydown", this._shortcutHandler, true);
      }
      this.layer?.remove();
      this.doc.querySelector("#zotagent-styles")?.remove();
      this.doc.querySelector("#zotagent-xterm-styles")?.remove();
      this.doc.querySelector("#zotagent-xterm-script")?.remove();
      this.xtermTerminal = null;
    }
  }

  const hooks = {
    async onStartup() {
      await Zotero.uiReadyPromise;
      if (shuttingDown) return;
      preferencePaneID = Zotero.PreferencePanes.register({
        pluginID: PLUGIN_ID,
        src: "chrome://zotagent/content/preferences.xhtml",
        label: "ZotAgent",
        image: "chrome://zotagent/content/icon.svg",
      });
      const mainWin = Zotero.getMainWindow();
      if (mainWin && !controllers.has(mainWin)) {
        controllers.set(mainWin, new MainWindowController(mainWin));
      }
      RuntimeManager.ensureRunning().catch((error) => {
        Zotero.debug(`[ZotAgent] automatic Runtime startup failed: ${error.message}`);
      });
    },

    async onMainWindowLoad(win) {
      if (controllers.has(win)) return;
      controllers.set(win, new MainWindowController(win));
    },

    async onMainWindowUnload(win) {
      controllers.get(win)?.destroy();
      controllers.delete(win);
    },

    async onShutdown() {
      shuttingDown = true;
      for (const controller of controllers.values()) controller.destroy();
      controllers.clear();
      await Zotero.ZotAgent.archive?.drain();
      // Release only the authenticated instance started by this plugin session.
      if (runtimeProcesses.size && RuntimeManager._health?.service === "zotagent") {
        try { await RuntimeManager.request("/v1/runtime/stop", { method: "POST", body: JSON.stringify({ instanceID: RuntimeManager._health.instanceID, force: true }) }); }
        catch (error) { Zotero.debug("[ZotAgent] Runtime shutdown: " + error.message); }
      }
      if (preferencePaneID && Zotero.PreferencePanes.unregister) {
        Zotero.PreferencePanes.unregister(preferencePaneID);
      }
    },
  };

  Zotero.ZotAgent = { hooks, controllers, runtimeManager: RuntimeManager, utils: { markdownToNoteHTML } };
})();
