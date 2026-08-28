# Phase 0 验证清单

所有验证先在独立 Zotero profile 中进行。

## 1. 静态验证

- `npm test` 全部通过；
- `npm run build` 生成 XPI；
- `npm run verify` 通过 manifest 和脚本语法检查；
- XPI 根目录包含 `manifest.json`、`bootstrap.js`、`prefs.js` 和 `content/`。

## 2. Runtime 验证

- 无 Token 请求返回 `401`；
- `/v1/agents` 返回三个实际版本；
- 停止请求后无遗留 Agent 进程；
- 不同 `windowID/requestID` 的事件不串流；
- 新建和恢复请求返回稳定的原生 session ID。

## 3. Zotero 9 验证

- XPI 可在 Zotero `9.0.6` 加载和卸载；
- 工具菜单和右下角按钮都能新建窗口；
- 多窗口可拖动、缩放、最小化和关闭；
- 窗口外 PDF 选词、缩放和批注不受影响；
- 当前文献标题正确；
- PDF 选区同时进入所有目标窗口，编辑互不影响；
- 回答可保存为正确条目的子笔记；
- 活动原生笔记和 Better Notes 的光标插入分别验证。

## 4. Agent 等价验证

对 OpenCode、Codex、Claude Code 分别执行：

- 连续两轮原生会话；
- 一次真实工具调用；
- 一次停止；
- 一次原生会话恢复；
- 对比 Zotero 与终端加载的 cwd、配置、MCP 和 skills。

审批回传和只在 TTY 中提供的能力标记为阻塞项，必须由 PTY 通道解决，不能用自动批准替代。

## 5. 目标插件组合

移除 Awesome GPT 和 llm-for-zotero 后，验证以下插件共存：

- Zotero Attanger
- Better BibTeX
- Ethereal Reference
- Ethereal Style
- Translate for Zotero
- Actions and Tags
- Better Notes
- PDF Figure
- Green Frog

Attanger 验证必须覆盖默认存储附件、链接附件和外部盘符附件。
