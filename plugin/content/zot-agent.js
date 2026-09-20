(function () {
  "use strict";

  const PLUGIN_ID = "zotagent@shzhao.local";
  const PREF_ROOT = "extensions.zotagent.";
  const controllers = new Map();
  const pdfTextCache = new Map();
  let dialogSequence = 0;
  let preferencePaneID = null;

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
    pdfTextCache.set(id, result);
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
      return String(pref("runtimeEndpoint", "http://127.0.0.1:24119"))
        .replace(/\/$/, "") + path;
    },

    async probe() {
      try {
        const response = await fetch(this.endpoint("/v1/health"), {
          headers: { authorization: `Bearer ${this.token()}` },
        });
        if (response.ok) return "running";
        if (response.status === 401) return "unauthorized";
        return "unavailable";
      } catch {
        return "offline";
      }
    },

    async healthy() { return (await this.probe()) === "running"; },

    launch() {
      let runtimePath = String(pref("runtimeScriptPath", "")).trim();
      if (!runtimePath.startsWith("/")) {
        throw new Error("Runtime 脚本路径必须是 WSL 绝对路径");
      }
      const nodePath = String(pref("runtimeNodePath", "node")).trim() || "node";
      if (nodePath !== "node" && !nodePath.startsWith("/")) {
        throw new Error("Node.js 路径必须是 WSL 绝对路径");
      }
      const nodeDirectory = nodePath.startsWith("/")
        ? nodePath.replace(/\/[^/]+$/, "")
        : "";
      const runtimePathValue = [
        nodeDirectory,
        "/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin",
      ].filter(Boolean).join(":");
      const distro = String(pref("wslDistro", "Ubuntu")).trim() || "Ubuntu";
      const executable = Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsIFile);
      executable.initWithPath("C:\\Windows\\System32\\wsl.exe");
      if (!executable.exists()) throw new Error("未找到 wsl.exe");

      const process = Components.classes["@mozilla.org/process/util;1"]
        .createInstance(Components.interfaces.nsIProcess);
      process.init(executable);
      const args = [
        "-d", distro, "--", "env", `ZOTAGENT_TOKEN=${this.token()}`,
        `PATH=${runtimePathValue}`,
        nodePath, runtimePath,
      ];
      const observer = {
        observe() { runtimeProcesses.delete(process); },
      };
      runtimeProcesses.add(process);
      const run = process.runwAsync || process.runAsync;
      run.call(process, args, args.length, observer, false);
    },

    async ensureRunning(force = false) {
      const current = await this.probe();
      if (current === "running") return { status: "running" };
      if (current === "unauthorized") {
        throw new Error("端口上已有 Runtime，但 Token 不匹配；请停止旧 Runtime 后重试");
      }
      if (!force && !pref("autoStartRuntime", true)) return { status: "disabled" };
      this.launch();
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (await this.healthy()) return { status: "started" };
      }
      throw new Error("Runtime 启动超时，请检查 WSL、Node 和脚本路径");
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
      if (tableRows.length < 2) return;
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
    const match = normalized.match(/^([A-Za-z]):\/(.*)/);
    if (!match) return winPath;
    return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
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
      try {
        const executables = {};
        const platforms = {};
        const opencode = String(pref("opencodePath", "")).trim();
        const codex = String(pref("codexPath", "")).trim();
        const claude = String(pref("claudePath", "")).trim();
        if (opencode) executables.opencode = opencode;
        if (codex) executables.codex = codex;
        if (claude) executables["claude-code"] = claude;
        const opP = String(pref("opencodePlatform", "wsl"));
        const cxP = String(pref("codexPlatform", "wsl"));
        const clP = String(pref("claudePlatform", "wsl"));
        if (opP) platforms.opencode = opP;
        if (cxP) platforms.codex = cxP;
        if (clP) platforms["claude-code"] = clP;
        if (!Object.keys(executables).length && !Object.keys(platforms).length) return;
        const response = await Promise.race([
          fetch(this.endpoint("/v1/config/agents"), {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ executables, platforms }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
        ]);
        if (!response.ok) {
          Zotero.debug(`[ZotAgent] syncAgentPaths failed: ${response.status}`);
        }
      } catch (error) {
        Zotero.debug(`[ZotAgent] syncAgentPaths error: ${error.message}`);
      }
      try {
        const agentsRes = await fetch(this.endpoint("/v1/agents"), { headers: this.headers() });
        if (agentsRes.ok) this.dialog._agentCapabilities = await agentsRes.json();
      } catch {}
    }

    async run(payload, onEvent) {
      await RuntimeManager.ensureRunning();
      await this.syncAgentPaths();
      this.currentController = this.makeAbortController();
      const signal = this.currentController?.signal || undefined;
      const connectTimeout = setTimeout(() => {
        if (!this.connected) this.currentController?.abort();
      }, 10000);
      this.connected = false;
      let response;
      try {
        response = await fetch(this.endpoint("/v1/run"), {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(payload),
          signal,
        });
      } catch (fetchErr) {
        clearTimeout(connectTimeout);
        if (fetchErr.name === "AbortError") {
          throw new Error(`连接超时: 无法连接 ${this.endpoint("/v1/run")} — 请确认 Runtime 已启动且 Endpoint/Token 配置正确`);
        }
        throw new Error(`网络错误: ${fetchErr.message} — Endpoint: ${this.endpoint("")}`);
      }
      this.connected = true;
      clearTimeout(connectTimeout);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Runtime ${response.status}: ${detail}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.trim()) {
            try { onEvent(JSON.parse(line)); }
            catch (error) { Zotero.debug(`[ZotAgent] invalid runtime event: ${error.message}`); }
          }
        }
        if (done) break;
      }
      if (buffer.trim()) {
        try { onEvent(JSON.parse(buffer)); }
        catch (error) { Zotero.debug(`[ZotAgent] invalid runtime event: ${error.message}`); }
      }
      this.currentController = null;
    }

    async cancel(requestID) {
      this.currentController?.abort();
      this.currentController = null;
      try {
        await fetch(this.endpoint(`/v1/requests/${requestID}/cancel`), {
          method: "POST",
          headers: this.headers(),
        });
      } catch (_) {}
    }

    async approve(requestID, approved) {
      try {
        await fetch(this.endpoint(`/v1/requests/${requestID}/approve`), {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({ approved }),
        });
      } catch (_) {}
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
      this.messages = [];
      this.requestID = null;
      this.lastProcessError = "";
      this.receiveSelections = Boolean(pref("receiveSelections", true));
      this.extraItems = [];
      this.primaryContext = null;
      this.runtime = new RuntimeClient(this);
      this.element = this.build();
      this.controller.layer.appendChild(this.element);
      this.updateContext();
    }

    build() {
      const root = createElement(this.doc, "section", "zotagent-dialog");
      root.id = this.id;
      root.dataset.agent = this.agent;
      root.style.left = `${40 + (dialogSequence % 5) * 34}px`;
      root.style.top = `${72 + (dialogSequence % 4) * 28}px`;

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
      this.cwdInput.placeholder = "WSL 工作目录";
      this.cwdInput.title = "该对话框的 WSL 工作目录";
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
        this.selectionLabel.textContent = "PDF 选区";
        this.capturedImage = null;
        this.capturePreview.style.display = "none";
        this.captureTarget = null;
      });
      const captureBtn = createElement(this.doc, "button", "zotagent-small-button", "截图");
      captureBtn.title = "框选 PDF 区域截图";
      captureBtn.addEventListener("click", () => this.startAreaCapture());
      this.selectionBox.append(this.selectionLabel, captureBtn, this.capturePreview, this.selectionInput, clearSelection);

      this.refBar = createElement(this.doc, "div", "zotagent-ref-bar");
      this.fullTextCheckbox = createElement(this.doc, "input");
      this.fullTextCheckbox.type = "checkbox";
      this.fullTextCheckbox.id = `${this.id}-fulltext`;
      const fullTextLabel = createElement(this.doc, "label", "zotagent-fulltext-label", "附加 PDF 全文");
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
      this.refBar.append(this.fullTextCheckbox, fullTextLabel, importBtn, this.multiModeSelect);

      this.messagesElement = createElement(this.doc, "div", "zotagent-messages");
      this.statusElement = createElement(this.doc, "div", "zotagent-status", "就绪");

      const composer = createElement(this.doc, "div", "zotagent-composer");
      this.promptInput = createElement(this.doc, "textarea", "zotagent-prompt-input");
      this.promptInput.placeholder = "向当前 Agent 提问";
      this.promptInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) this.send();
      });
      this.sendButton = createElement(this.doc, "button", "zotagent-primary-button", "发送");
      this.sendButton.addEventListener("click", () => this.send());
      this.stopButton = createElement(this.doc, "button", "zotagent-secondary-button", "停止");
      this.stopButton.disabled = true;
      this.stopButton.addEventListener("click", () => this.stop());
      const modeToggle = createElement(this.doc, "button", "zotagent-secondary-button", "打开原生终端");
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
      this.ptyContainer.append(this.ptyOutput, this.ptyInput);

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

      root.append(
        header,
        executionBar,
        this.contextBar,
        this.selectionBox,
        this.refBar,
        this.extraItemsList,
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
          root.style.top = `${Math.max(0, rect.top + moveEvent.clientY - startY)}px`;
        };
        const stop = () => {
          this.win.removeEventListener("pointermove", move);
          this.win.removeEventListener("pointerup", stop);
        };
        this.win.addEventListener("pointermove", move);
        this.win.addEventListener("pointerup", stop, { once: true });
      });
    }

    updateContext() {
      if (this.primaryContext) return;
      const active = this.controller.getActiveContext();
      this.context = active ? (this.primaryContext = active.items?.[0]
        ? { ...active, ...active.items[0], items: [active.items[0]] }
        : { ...active, items: [active] }) : null;
      if (!this.context) {
        this.contextBar.textContent = "未绑定文献";
        this.contextBar.title = "";
        this._multiMode = null;
        return;
      }
      this.contextBar.innerHTML = "";
      this.contextBar.append(
        createElement(this.doc, "span", "zotagent-primary-label", "主文献: "),
        createElement(this.doc, "strong", "", this.context.title || "未命名文献"),
      );
      this.contextBar.title = this.context.attachmentPath || this.context.title || "";
      this.multiModeSelect.style.display = "inline-block";
      this.renderExtraItems();
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

    buildPrompt(question) {
      const blocks = [];
      const allItems = this.context ? [{ title: this.context.title, topItem: this.context.topItem }] : [];
      for (const entry of this.extraItems) {
        allItems.push({ title: entry.title, topItem: entry.topItem });
      }
      if (allItems.length) {
        const descriptions = allItems.map((item, index) => {
          const parts = [`[S${index + 1}] ${item.title || "未命名文献"}`];
          const topItem = item.topItem;
          if (topItem) {
            const doi = topItem.getField?.("DOI");
            const year = topItem.getField?.("year") || topItem.getField?.("date")?.slice(0, 4);
            const creators = topItem.getCreators?.()?.map((c) => c.lastName || c.name).slice(0, 3);
            if (creators?.length) parts.push(`Authors: ${creators.join(", ")}`);
            if (year) parts.push(`Year: ${year}`);
            if (doi) parts.push(`DOI: ${doi}`);
          }
          return parts.join(" | ");
        });
        blocks.push("## Zotero 文献上下文\n" + descriptions.join("\n"));
      }
      if (this.pdfText) {
        const label = this.context?.title || "当前文献";
        blocks.push(`## PDF 全文: ${label}\n` + this.pdfText);
      }
      for (const extra of this.extraPdfTexts || []) {
        blocks.push(`## PDF 全文: ${extra.title}\n` + extra.text);
      }
      if (this.capturedImage) {
        const canPassImage = this._agentCapabilities?.[this.agent]?.supportsImages;
        blocks.push(canPassImage
          ? "## PDF 截图\n[已附加 PDF 区域截图作为图像上下文]"
          : "## PDF 截图\n[注意: 当前 Agent 不支持图像输入，截图未传递]");
      }
      if (this.selectionInput.value.trim()) {
        const pageInfo = this.selectionLabel.textContent !== "PDF 选区"
          ? ` (${this.selectionLabel.textContent.replace("PDF 选区 - ", "")})`
          : "";
        blocks.push("## 用户选择并确认的 PDF 文本" + pageInfo + "\n" + this.selectionInput.value.trim());
      }
      blocks.push("## 用户问题\n" + question.trim());
      return blocks.join("\n\n");
    }

    addMessage(role, text) {
      const item = { role, text };
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
      return this.agent === "opencode" ? String(pref("opencodeModel", "")).trim() || null : null;
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
      approveBtn.addEventListener("click", () => {
        this.runtime.approve(this.requestID, true);
        this.dismissApproval();
        this.renderStatus("已批准，Agent 继续执行...");
      });
      const denyBtn = createElement(this.doc, "button", "zotagent-deny-button", "拒绝");
      denyBtn.addEventListener("click", () => {
        this.runtime.approve(this.requestID, false);
        this.dismissApproval();
        this.renderStatus("已拒绝工具调用");
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
      if (!question || this.requestID) return;
      this.updateContext();

      this.pdfText = "";
      this.extraPdfTexts = [];
      const wantFullText = this.fullTextCheckbox.checked;
      const attachment = this.context?.attachment;
      if (wantFullText && attachment) {
        this.renderStatus("正在从 Zotero 提取 PDF 全文...");
        const extracted = await extractPdfText(attachment);
        if (extracted.text) {
          const maxChars = 60000;
          this.pdfText = extracted.text.length > maxChars
            ? `${extracted.text.slice(0, maxChars)}\n\n[全文超过当前上下文上限，已截断；请使用定向问题继续读取。]`
            : extracted.text;
        } else {
          this.renderStatus("Zotero 未提取到 PDF 文本，将仅使用选区/截图", true);
        }
      }

      for (const entry of this.extraItems) {
        if (!entry.includeFullText || !entry.attachment) continue;
        const extracted = await extractPdfText(entry.attachment);
        if (extracted.text) {
          const maxChars = 60000;
          const text = extracted.text.length > maxChars
            ? `${extracted.text.slice(0, maxChars)}\n\n[已截断]`
            : extracted.text;
          this.extraPdfTexts.push({ title: entry.title, text });
        }
      }

      if (this._multiMode === "separate" && this.context?.items?.length > 1) {
        await this.sendSeparate(question);
        return;
      }

      this.addMessage("user", question);
      const assistant = this.addMessage("assistant", "");
      this.promptInput.value = "";
      this.requestID = `${this.id}-${Date.now()}`;
      this.sendButton.disabled = true;
      this.stopButton.disabled = false;
      this.renderStatus("Agent 运行中...");

      const cwd = this.cwdInput.value.trim() || pref("defaultWorkingDirectory", "");
      if (!cwd) {
        this.renderStatus("请先设置工作目录 (defaultWorkingDirectory)");
        this.sendButton.disabled = false;
        this.stopButton.disabled = true;
        return;
      }

      const payload = {
        windowID: this.id,
        requestID: this.requestID,
        agent: this.agent,
        nativeSessionID: this.sessions[this.agent] || null,
        cwd,
        model: this.selectedModel(),
        prompt: this.buildPrompt(question),
        files: [],
        image: this.capturedImage || null,
      };

      try {
        await this.runtime.run(payload, (event) => {
          if (event.windowID !== this.id || event.requestID !== this.requestID) return;
          if (event.type === "session.updated" && event.nativeSessionID) {
            this.sessions[this.agent] = event.nativeSessionID;
            SessionHistory.upsert({
              agent: this.agent,
              nativeSessionID: event.nativeSessionID,
              windowID: this.id,
              cwd: this.cwdInput.value.trim(),
              title: this.contextBar.textContent || "未命名会话",
            });
          }
          if (event.type === "message.delta" && event.data?.text) {
            assistant.item.text += event.data.text;
            assistant.element.textContent = assistant.item.text;
            this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
          }
          if (event.type === "tool.started") this.renderStatus("Agent 正在调用工具...");
          if (event.type === "tool.completed") this.renderStatus("工具调用完成");
          if (event.type === "command.started") this.renderStatus("Agent 正在执行命令...");
          if (event.type === "command.output") this.renderStatus("命令输出中...");
          if (event.type === "file.diff") this.renderStatus("文件变更...");
          if (event.type === "artifact.created") this.renderStatus("已创建文件");
          if (event.type === "usage.updated" && event.data?.raw) {
            const u = event.data.raw;
            const tokens = u.input_tokens || u.tokens_used || u.usage?.total_tokens;
            if (tokens) this.renderStatus(`已用 ${tokens} tokens`);
          }
          if (event.type === "approval.requested") this.showApprovalUI(event);
          if (event.type === "process.stderr") {
            const line = event.data?.line || "";
            this.lastProcessError = `${this.lastProcessError || ""}${line}\n`.slice(-4000);
            if (/error|fatal|panic|exception/i.test(line)) this.renderStatus(line, true);
          }
          if (event.type === "error") this.renderStatus(event.data.message, true);
          if (event.type === "request.completed") {
            const failed = event.data.code !== 0;
            const detail = event.data.stderr || this.lastProcessError;
            this.renderStatus(failed && detail ? `退出码 ${event.data.code}: ${detail.trim().split(/\r?\n/).at(-1)}` : (failed ? `退出码 ${event.data.code}` : "完成"), failed);
          }
        });
        const answer = this.lastAnswer();
        if (answer && pref("autoInsertAtCursor", false)) {
          const inserted = NoteService.insertAtActiveCursor(answer);
          if (!inserted) this.renderStatus(NoteService.lastInsertError, true);
        }
        if (answer && pref("autoSaveNotes", false) && this.context?.topItem) {
          await NoteService.createChildNote(this.context, answer);
          this.renderStatus("完成并已自动保存子笔记");
        }
        if (this.sessions[this.agent]) {
          SessionHistory.updateMessages(
            this.agent,
            this.sessions[this.agent],
            this.messages.map((m) => ({ role: m.role, text: m.text })),
          );
        }
      } catch (error) {
        if (error.name === "AbortError") {
          this.renderStatus("连接超时：请确认 Runtime Host 已启动", true);
        } else {
          this.renderStatus(error.message, true);
        }
      } finally {
        this.requestID = null;
        this.sendButton.disabled = false;
        this.stopButton.disabled = true;
      }
    }

    async sendSeparate(question) {
      const items = [this.context, ...this.extraItems].filter(Boolean);
      const wantFullText = this.fullTextCheckbox.checked;
      this.addMessage("user", `[分别处理 ${items.length} 篇] ${question}`);
      this.promptInput.value = "";
      this.sendButton.disabled = true;
      this.stopButton.disabled = false;

      try { for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const title = item.title || `文献 ${i + 1}`;
        this.renderStatus(`分别处理 (${i + 1}/${items.length}): ${title}`);
        const assistant = this.addMessage("assistant", "");
        this.requestID = `${this.id}-${Date.now()}-${i}`;

        const singleContext = {
          title: item.title,
          topItem: item.topItem,
          attachmentPath: item.topItem?.getAttachments?.()[0]
            ? Zotero.Items.get(item.topItem.getAttachments()[0])?.getFilePath?.() || ""
            : "",
        };
        singleContext.wslPath = windowsToWSLPath(singleContext.attachmentPath);

        let fullTextBlock = "";
        if (wantFullText) {
          const att = item.topItem?.getAttachments?.()[0]
            ? Zotero.Items.get(item.topItem.getAttachments()[0]) : null;
          if (att) {
            const extracted = await extractPdfText(att);
            if (extracted.text) {
              const maxChars = 60000;
              const text = extracted.text.length > maxChars
                ? `${extracted.text.slice(0, maxChars)}\n\n[已截断]` : extracted.text;
              fullTextBlock = `\n\n## PDF 全文: ${title}\n${text}`;
            }
          }
        }

        const prompt = `## Zotero 当前文献\n${title}${fullTextBlock}\n\n## 用户问题\n${question}`;
        const payload = {
          windowID: this.id,
          requestID: this.requestID,
          agent: this.agent,
          nativeSessionID: null,
          cwd: this.cwdInput.value.trim() || pref("defaultWorkingDirectory", ""),
          model: this.selectedModel(),
          prompt,
          files: [],
          image: null,
        };

        try {
          await this.runtime.run(payload, (event) => {
            if (event.requestID !== this.requestID) return;
            if (event.type === "message.delta" && event.data?.text) {
              assistant.item.text += event.data.text;
              assistant.element.textContent = assistant.item.text;
              this.messagesElement.scrollTop = this.messagesElement.scrollHeight;
            }
            if (event.type === "error") this.renderStatus(event.data.message, true);
          });
          if (assistant.item.text && pref("autoSaveNotes", false)) {
            await NoteService.createChildNote(singleContext, assistant.item.text);
          }
        } catch (error) {
          this.addMessage("assistant", `[${title}] 失败: ${error.message}`);
        }
      } } finally {
      this.requestID = null;
      this.sendButton.disabled = false;
      this.stopButton.disabled = true;
      this.renderStatus(`分别处理完成 (${items.length} 篇)`);
      }
    }

    async stop() {
      if (!this.requestID) return;
      const requestID = this.requestID;
      this.renderStatus("正在停止...");
      await this.runtime.cancel(requestID);
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
      this.agent = entry.agent;
      this.sessions[entry.agent] = entry.nativeSessionID;
      if (entry.cwd) this.cwdInput.value = entry.cwd;
      const agentSelect = this.element.querySelector(".zotagent-agent-select");
      if (agentSelect) agentSelect.value = entry.agent;
      this.element.dataset.agent = entry.agent;
      this.messagesElement.innerHTML = "";
      this.messages = [];
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
      if (this._ptyMode) {
        this._ptyMode = false;
        this.ptyContainer.style.display = "none";
        this.messagesElement.style.display = "";
        this.selectionBox.style.display = "";
        this.renderStatus("已切换回结构化视图");
        if (this._ptyID) await this.closePty();
      } else {
        this._ptyMode = true;
        this.ptyContainer.style.display = "";
        this.messagesElement.style.display = "none";
        this.selectionBox.style.display = "none";
        const label = { "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode" }[this.agent] || this.agent;
        this.renderStatus(`${label} 原生终端`);
        await this.startPty();
      }
    }

    async startPty() {
      try {
        await RuntimeManager.ensureRunning();
        await this.controller.xtermReady;
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
              cwd: this.cwdInput.value.trim() || pref("defaultWorkingDirectory", ""),
              sessionID: this.sessions[this.agent] || null,
              cols: this._terminal.cols,
              rows: this._terminal.rows,
            }),
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("PTY 创建超时")), 8000)),
        ]);
        if (!response.ok) throw new Error(`PTY 创建失败: ${response.status}`);
        const data = await response.json();
        this._ptyID = data.ptyID;
        this.ptyInput.style.display = "none";
        this._terminal.focus();
        const label = { "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode" }[this.agent] || this.agent;
        this.renderStatus(`${label} 原生终端已连接`);
        this.streamPtyOutput();
      } catch (error) {
        this._terminal?.dispose();
        this._terminal = null;
        this.ptyInput.style.display = "";
        this.renderStatus("原生终端启动失败: " + error.message, true);
      }
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

    async closePty() {
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
      if (this.requestID) this.runtime.cancel(this.requestID);
      this._captureCleanup?.();
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
      for (const controller of controllers.values()) controller.destroy();
      controllers.clear();
      if (preferencePaneID && Zotero.PreferencePanes.unregister) {
        Zotero.PreferencePanes.unregister(preferencePaneID);
      }
    },
  };

  Zotero.ZotAgent = { hooks, controllers, runtimeManager: RuntimeManager };
})();
