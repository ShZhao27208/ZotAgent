(function () {
  "use strict";
  const ROOT = "extensions.zotagent.";

  function get(name) {
    return Zotero.Prefs.get(ROOT + name, true);
  }

  function set(name, value) {
    Zotero.Prefs.set(ROOT + name, value, true);
  }

  function isSelect(el) {
    const tag = (el.localName || el.tagName || "").toLowerCase();
    return tag === "select";
  }

  function isCheckbox(el) {
    return el.localName === "checkbox" || (el.localName === "input" && el.type === "checkbox");
  }

  async function testAgent(doc, agentName) {
    const result = doc.querySelector("#zotagent-agent-result");
    result.textContent = `正在检测 ${agentName}...`;
    try {
      await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
      refreshDetectedFields(doc);
      const response = await Zotero.ZotAgent.runtimeManager.request("/v1/agents");
      if (!response.ok) throw new Error(`Runtime ${response.status}`);
      const agents = await response.json();
      const info = agents[agentName];
      if (!info) {
        result.textContent = `${agentName}: 未在 Runtime 中注册`;
        return;
      }
      const lines = [`${agentName}:`];
      lines.push(`  状态: ${info.available ? "✓ 可用" : "✗ 不可用"}`);
      lines.push(`  当前使用: ${info.platform === "windows" ? "Windows" : "WSL (Linux)"}`);
      if (info.version) lines.push(`  版本: ${info.version}`);
      if (info.executable) lines.push(`  路径: ${info.executable}`);
      if (info.error) lines.push(`  错误: ${info.error}`);
      for (const [system, found] of Object.entries(info.installations || {})) {
        lines.push(`  ${system === "windows" ? "Windows" : "WSL"} 安装: ${found || "未找到"}`);
      }
      lines.push(`  结构化输出: ✓ 支持`);
      lines.push(`  Session 恢复: ✓ 支持 (--resume / --session)`);
      if (agentName === "claude-code") {
        lines.push(`  原生终端: ✓ 支持交互会话`);
        lines.push(`  Stream JSON: ✓ --output-format stream-json --verbose`);
      }
      if (agentName === "codex") {
        lines.push(`  JSONL 输出: ✓ --json`);
      }
      if (agentName === "opencode") {
        lines.push(`  JSON 输出: ✓ --format json`);
      }
      result.textContent = lines.join("\n");
      if (agentName === "opencode") await refreshModels(doc);
    } catch (error) {
      result.textContent = `检测失败: ${error.message}\n请确认 Runtime Host 已启动`;
    }
  }

  async function refreshModels(doc, force = false) {
    const select = doc.querySelector("#zotagent-opencode-model");
    if (select._refreshing) return;
    select._refreshing = true;
    const status = doc.querySelector("#zotagent-agent-result");
    const environment = () => JSON.stringify(["runtimeHost", "runtimeEndpoint", "wslDistro", "opencodePathWindows", "opencodePathWSL", "opencodePlatform"].map(get));
    const originalEnvironment = environment();
    try {
      await Zotero.ZotAgent.runtimeManager.ensureRunning();
      const response = await Zotero.ZotAgent.runtimeManager.request("/v1/opencode/models" + (force ? "?refresh=1" : ""), {}, 155000);
      const data = await response.json();
      if (environment() !== originalEnvironment) return;
      if (!response.ok) throw new Error(data.error || `Runtime ${response.status}`);
      // Discard a result if the user chose another model while it was loading.
      const current = String(get("opencodeModel") || "");
      select.replaceChildren();
      const add = (value, label) => { const option = doc.createElementNS("http://www.w3.org/1999/xhtml", "option"); option.value = value; option.textContent = label; select.append(option); };
      add("", "跟随 OpenCode 最近使用的模型" + (data.recent ? `（${data.recent}）` : "（暂无可读记录）"));
      for (const model of data.models) add(model, model);
      if (current && !data.models.includes(current)) add(current, current + "（已不在可用列表中，请重新选择）");
      select.value = current;
      status.textContent = `已读取 ${data.models.length} 个模型 ID` + (data.recentError ? "；最近模型读取失败：" + data.recentError : "");
    } catch (error) { status.textContent = "模型刷新失败，已保留选择：" + error.message; }
    finally {
      select._refreshing = false;
      if (environment() !== originalEnvironment) refreshModels(doc);
    }
  }

  function refreshDetectedFields(doc) {
    for (const element of doc.querySelectorAll("[data-pref]")) {
      if (!isCheckbox(element) && doc.activeElement !== element) {
        element.value = get(element.dataset.pref) ?? "";
      }
    }
  }

  function runtimeStatus() {
    const manager = Zotero.ZotAgent.runtimeManager, health = manager._health || {};
    const endpoint = manager.endpoint();
    const port = endpoint.match(/:(\d+)(?:\/|$)/)?.[1] || (endpoint.startsWith("https:") ? "443" : "80");
    const host = health.platform === "windows" ? "Windows" : health.wslDistro ? `WSL · ${health.wslDistro}` : health.platform || "未知";
    return `Runtime 已连接 · ${host} · 监听端口 ${port}${health.pid ? ` · PID ${health.pid}` : ""}\n${endpoint}`;
  }

  function load(win) {
    const doc = win.document;
    const format = Zotero.ZotAgent.archiveFormat;
    const archiveSettings = doc.querySelector("#zotagent-archive-settings");
    if (archiveSettings) {
      archiveSettings.replaceChildren();
      const make = tag => doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
      const naming = format.settings();
      const templateLabel = make("label"); templateLabel.textContent = "命名模板"; templateLabel.htmlFor = "zotagent-archive-template";
      const template = make("input"); template.id = templateLabel.htmlFor; template.dataset.pref = "archiveNameTemplate";
      template.placeholder = "{title}_ {tags}_ {author}_ {date}";
      template.value = naming.archiveNameTemplate;
      const tokenLabel = make("label"); tokenLabel.textContent = "插入字段"; tokenLabel.htmlFor = "zotagent-archive-token";
      const picker = make("select"); picker.id = tokenLabel.htmlFor;
      const hint = make("option"); hint.value = ""; hint.textContent = "选择字段，在光标处插入…"; picker.append(hint);
      for (const [token, label] of Object.entries(format.namingTokens)) {
        const option = make("option"); option.value = `{${token}}`; option.textContent = `{${token}} · ${label}`; picker.append(option);
      }
      picker.addEventListener("change", () => {
        if (!picker.value) return;
        const start = template.selectionStart ?? template.value.length, end = template.selectionEnd ?? start;
        const token = picker.value;
        template.value = template.value.slice(0, start) + token + template.value.slice(end);
        set("archiveNameTemplate", template.value); picker.value = "";
        template.focus(); template.setSelectionRange(start + token.length, start + token.length); preview();
      });
      archiveSettings.append(templateLabel, template, tokenLabel, picker);
      for (const [name, [label, fallback, choices]] of Object.entries(format.choices)) {
        const title = make("label"); title.textContent = label; title.htmlFor = "zotagent-" + name;
        const select = make("select"); select.id = title.htmlFor; select.dataset.pref = name;
        for (const choice of choices) {
          const [value, text] = Array.isArray(choice) ? choice : [choice, choice || "不显示"];
          const option = make("option"); option.value = value; option.textContent = text; select.append(option);
        }
        if (get(name) === undefined) set(name, fallback);
        archiveSettings.append(title, select);
      }
    }
    const preview = () => {
      const element = doc.querySelector("#zotagent-archive-name-preview");
      if (element) element.textContent = "名称预览：" + format.noteName({ title: "示例研究文献", shortTitle: "示例文献", tags: "综述, 待读", author: "张", authors: "张, 李", year: "2026", doi: "10.example/demo", key: "ABCD1234" });
    };
    Zotero.ZotAgent.runtimeManager.selectRuntimeProfile();
    Zotero.ZotAgent.runtimeManager.normalizePaths();
    for (const element of doc.querySelectorAll("[data-pref]")) {
      const name = element.dataset.pref;
      const value = get(name);
      if (isCheckbox(element)) {
        element.checked = Boolean(value);
      } else if (isSelect(element)) {
        const strValue = String(value ?? "");
        element.value = strValue;
        if (element.options) {
          for (const opt of element.options) {
            opt.selected = opt.value === strValue;
          }
        }
      } else {
        element.value = value ?? "";
      }

      element.addEventListener("change", () => {
        const previous = get(name);
        const environmentChange = ["runtimeHost", "wslDistro", "opencodePlatform", "codexPlatform", "claudePlatform"].includes(name);
        if (environmentChange) {
          const busy = Zotero.ZotAgent.runtimeManager._pending || [...Zotero.ZotAgent.controllers.values()].some(controller => [...controller.dialogs.values()].some(dialog => dialog._activeBatch || dialog._ptyID));
          if (busy) {
            element.value = previous;
            doc.querySelector("#zotagent-runtime-result").textContent = "请等待连接完成，或先停止当前回答并关闭原生终端，再切换运行环境。";
            return;
          }
        }
        set(name, isCheckbox(element) ? element.checked : element.value);
        if (environmentChange) {
          // Both systems keep their own path, so switching never erases the other one.
          const changedAgent = { opencodePlatform: "opencode", codexPlatform: "codex", claudePlatform: "claude-code" }[name];
          for (const controller of Zotero.ZotAgent.controllers.values()) {
            for (const dialog of controller.dialogs.values()) {
              // Native session IDs belong to the selected installation.
              if (changedAgent) { dialog.sessions[changedAgent] = null; dialog.sessionPlatforms[changedAgent] = null; }
              else { dialog.sessions = Object.create(null); dialog.sessionPlatforms = Object.create(null); }
            }
          }
          if (name === "runtimeHost" || name === "wslDistro") Zotero.ZotAgent.runtimeManager.selectRuntimeProfile();
          refreshDetectedFields(doc);
          refreshModels(doc);
          doc.querySelector("#zotagent-runtime-result").textContent = "运行环境已保存。点击“连接并检测”以检测所选环境的 Agent；下一次发送也会应用此设置。";
        }
        if (name === "archiveSort") {
          const status = doc.querySelector("#zotagent-archive-settings-status");
          status.textContent = "正在重排当前归档笔记...";
          Zotero.ZotAgent.archive.reorderCurrent(element.value).then(() => { status.textContent = "排序已更新"; })
            .catch(error => { status.textContent = "部分笔记未能重排：" + error.message + "。请关闭编辑窗口后重试。"; });
        }
        if (name.startsWith("archiveName")) preview();
      });
      if (!isSelect(element) && !isCheckbox(element) && name !== "wslDistro") {
        element.addEventListener("input", () => { set(name, element.value); if (name.startsWith("archiveName")) preview(); });
      }
    }

    const modelSelect = doc.querySelector("#zotagent-opencode-model");
    const initialModel = String(get("opencodeModel") || "");
    if (initialModel) {
      const option = doc.createElementNS("http://www.w3.org/1999/xhtml", "option");
      option.value = initialModel; option.textContent = initialModel + "（待检测）"; modelSelect.append(option); modelSelect.value = initialModel;
    }
    modelSelect.addEventListener("focus", () => refreshModels(doc));
    modelSelect.addEventListener("mousedown", () => refreshModels(doc));
    doc.querySelector("#zotagent-refresh-models")?.addEventListener("command", () => refreshModels(doc, true));
    for (const action of ["stop", "restart"]) doc.querySelector("#zotagent-" + action + "-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      try {
        if (!await Zotero.ZotAgent.runtimeManager.stop(win)) return;
        result.textContent = "Runtime 已停止，端口已释放；点击启动后才能继续提问。";
        if (action === "restart") { await Zotero.ZotAgent.runtimeManager.start(); result.textContent = runtimeStatus(); }
      } catch (error) { result.textContent = "操作失败：" + error.message; }
    });
    preview();
    const status = doc.querySelector("#zotagent-runtime-result");
    if (status) status.textContent = "正在连接 Runtime 并检测 Agent...";
    Zotero.ZotAgent.runtimeManager.ensureRunning().then((state) => {
      refreshDetectedFields(doc);
      if (state.status !== "disabled") refreshModels(doc);
      if (status) status.textContent = state.status === "disabled"
        ? "Runtime 自动启动已关闭，可点击立即启动"
        : runtimeStatus();
    }).catch((error) => {
      refreshDetectedFields(doc);
      if (status) status.textContent = "自动连接失败: " + error.message;
    });

    doc.querySelector("#zotagent-start-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      result.textContent = get("runtimeHost") === "wsl" ? "正在启动 WSL Runtime..." : "正在部署并启动本机 Runtime...";
      try {
        const state = await Zotero.ZotAgent.runtimeManager.start();
        refreshDetectedFields(doc);
        const tokenInput = doc.querySelector("#zotagent-runtime-token");
        if (tokenInput) tokenInput.value = get("runtimeToken") || "";
        result.textContent = runtimeStatus();
      } catch (error) {
        refreshDetectedFields(doc);
        result.textContent = "启动失败: " + error.message;
      }
    });

    doc.querySelector("#zotagent-test-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      result.textContent = "检测中...";
      try {
        await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
        refreshDetectedFields(doc);

        const response = await Zotero.ZotAgent.runtimeManager.request("/v1/agents");
        if (!response.ok) throw new Error(`Runtime ${response.status}`);
        const agents = await response.json();
        const lines = Object.entries(agents).map(
          ([name, status]) => `${name}: ${status.available ? "✓ " + status.version : "✗ " + (status.error || "不可用")}`,
        );

        const health = await Zotero.ZotAgent.runtimeManager.request("/v1/health");
        if (health.ok) {
          const hData = await health.json();
          lines.unshift(runtimeStatus() + `\n活跃请求 ${hData.runningRequests}`);
        }
        const nodes = await Zotero.ZotAgent.runtimeManager.request("/v1/nodes", {}, 22000);
        if (nodes.ok) {
          const found = await nodes.json();
          lines.push(`Node.js: Windows ${found.windows || "未找到"} · WSL ${found.wsl || "未找到"}`);
        }
        result.textContent = lines.join("\n");
      } catch (error) {
        result.textContent = "连接失败: " + error.message;
      }
    });

    doc.querySelector("#zotagent-test-opencode")?.addEventListener("command", () => testAgent(doc, "opencode"));
    doc.querySelector("#zotagent-test-codex")?.addEventListener("command", () => testAgent(doc, "codex"));
    doc.querySelector("#zotagent-test-claude")?.addEventListener("command", () => testAgent(doc, "claude-code"));
  }

  Zotero.ZotAgentPrefs = { load };
})();
