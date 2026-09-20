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

  function runtimeHeaders() {
    return {
      authorization: "Bearer " + String(get("runtimeToken") || ""),
      "content-type": "application/json",
    };
  }

  function runtimeEndpoint(path) {
    return String(get("runtimeEndpoint") || "").replace(/\/$/, "") + path;
  }

  async function testAgent(doc, agentName) {
    const result = doc.querySelector("#zotagent-agent-result");
    result.textContent = `正在检测 ${agentName}...`;
    try {
      await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
      refreshDetectedFields(doc);
      const response = await fetch(runtimeEndpoint("/v1/agents"), {
        headers: runtimeHeaders(),
      });
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
      });
      if (!isSelect(element) && !isCheckbox(element)) {
        element.addEventListener("input", () => set(name, element.value));
      }
    }

    const status = doc.querySelector("#zotagent-runtime-result");
    if (status) status.textContent = "正在连接 Runtime 并检测 Agent...";
    Zotero.ZotAgent.runtimeManager.ensureRunning().then((state) => {
      refreshDetectedFields(doc);
      if (status) status.textContent = state.status === "disabled"
        ? "Runtime 自动启动已关闭，可点击立即启动"
        : "Runtime 已连接，Agent 路径已自动检测";
    }).catch((error) => {
      if (status) status.textContent = "自动连接失败: " + error.message;
    });

    doc.querySelector("#zotagent-start-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      result.textContent = "正在启动 WSL Runtime...";
      try {
        const state = await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
        refreshDetectedFields(doc);
        const tokenInput = doc.querySelector("#zotagent-runtime-token");
        if (tokenInput) tokenInput.value = get("runtimeToken") || "";
        result.textContent = state.status === "running"
          ? "Runtime 已在运行，连接正常"
          : "Runtime 已启动并通过鉴权检测";
      } catch (error) {
        result.textContent = "启动失败: " + error.message;
      }
    });

    doc.querySelector("#zotagent-test-runtime")?.addEventListener("command", async () => {
      const result = doc.querySelector("#zotagent-runtime-result");
      result.textContent = "检测中...";
      try {
        await Zotero.ZotAgent.runtimeManager.ensureRunning(true);
        refreshDetectedFields(doc);

        const response = await fetch(runtimeEndpoint("/v1/agents"), {
          headers: runtimeHeaders(),
        });
        if (!response.ok) throw new Error(`Runtime ${response.status}`);
        const agents = await response.json();
        const lines = Object.entries(agents).map(
          ([name, status]) => `${name}: ${status.available ? "✓ " + status.version : "✗ " + (status.error || "不可用")}`,
        );

        const health = await fetch(runtimeEndpoint("/v1/health"), {
          headers: runtimeHeaders(),
        });
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
