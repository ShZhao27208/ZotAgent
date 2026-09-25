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
      lines.push(`  平台: ${info.platform === "windows" ? "Windows" : "WSL (Linux)"}`);
      if (info.version) lines.push(`  版本: ${info.version}`);
      if (info.executable) lines.push(`  路径: ${info.executable}`);
      if (info.error) lines.push(`  错误: ${info.error}`);
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
    } catch (error) {
      result.textContent = `检测失败: ${error.message}\n请确认 Runtime Host 已启动`;
    }
  }

  function refreshDetectedFields(doc) {
    for (const element of doc.querySelectorAll("[data-pref]")) {
      if (!isCheckbox(element) && !isSelect(element) && doc.activeElement !== element) {
        element.value = get(element.dataset.pref) ?? "";
      }
    }
  }

  function load(win) {
    const doc = win.document;
    const format = Zotero.ZotAgent.archiveFormat;
    const archiveSettings = doc.querySelector("#zotagent-archive-settings");
    if (archiveSettings) {
      archiveSettings.replaceChildren();
      const make = tag => doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
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
      const label = make("label"); label.textContent = "自定义前缀"; label.htmlFor = "zotagent-archive-custom-prefix";
      const input = make("input"); input.id = label.htmlFor; input.dataset.pref = "archiveNameCustomPrefix";
      archiveSettings.append(label, input);
    }
    const preview = () => {
      const element = doc.querySelector("#zotagent-archive-name-preview");
      if (element) element.textContent = "名称预览：" + format.noteName({ title: "示例研究文献", shortTitle: "示例文献", author: "张", year: "2026", doi: "10.example/demo", key: "ABCD1234" });
    };
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
        set(name, isCheckbox(element) ? element.checked : element.value);
        if (name === "archiveSort") {
          const status = doc.querySelector("#zotagent-archive-settings-status");
          status.textContent = "正在重排当前归档笔记...";
          Zotero.ZotAgent.archive.reorderCurrent(element.value).then(() => { status.textContent = "排序已更新"; })
            .catch(error => { status.textContent = "部分笔记未能重排：" + error.message + "。请关闭编辑窗口后重试。"; });
        }
        if (name.startsWith("archiveName")) preview();
      });
      if (!isSelect(element) && !isCheckbox(element)) {
        element.addEventListener("input", () => { set(name, element.value); if (name.startsWith("archiveName")) preview(); });
      }
    }

    preview();
    const status = doc.querySelector("#zotagent-runtime-result");
    if (status) status.textContent = "正在连接 Runtime 并检测 Agent...";
    Zotero.ZotAgent.runtimeManager.ensureRunning().then((state) => {
      refreshDetectedFields(doc);
      if (status) status.textContent = state.status === "disabled"
        ? "Runtime 自动启动已关闭，可点击立即启动"
        : "Runtime 已连接，Agent 路径已自动检测";
    }).catch((error) => {
      refreshDetectedFields(doc);
      if (status) status.textContent = "自动连接失败: " + error.message;
    });

    doc.querySelector("#zotagent-start-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      result.textContent = get("runtimeHost") === "wsl" ? "正在启动 WSL Runtime..." : "正在部署并启动本机 Runtime...";
      try {
        const state = await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
        refreshDetectedFields(doc);
        const tokenInput = doc.querySelector("#zotagent-runtime-token");
        if (tokenInput) tokenInput.value = get("runtimeToken") || "";
        result.textContent = state.status === "running"
          ? "Runtime 已在运行，连接正常"
          : "Runtime 已启动并通过鉴权检测";
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
          lines.unshift(`Runtime: ✓ PID ${hData.pid}, 活跃请求 ${hData.runningRequests}`);
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
