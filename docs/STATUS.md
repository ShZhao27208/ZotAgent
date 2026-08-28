# 实施状态

更新时间：2026-07-17

## 已完成

- 项目、Manifest V2、bootstrap 生命周期和设置页；
- 多浮动窗口、窗口级 Agent/模型/cwd；
- 当前文献检测和 PDF 选区独立广播；
- Runtime Host Bearer Token 鉴权和 NDJSON 流；
- OpenCode、Codex、Claude Code 结构化 Adapter；
- 原生 session ID 创建、提取和恢复参数；
- 取消请求、进程树清理、CLI 路径同步；
- Markdown 复制、活动光标插入和条目子笔记；
- 零依赖构建和 XPI 打包。

## 已验证

- Node 测试：7/7 通过；
- XPI CRC 和目录：通过；
- Runtime `/v1/agents` 实机检测：
  - OpenCode `1.17.20`
  - Codex CLI `0.144.4`
  - Claude Code `2.1.211`
- Zotero `9.0.6` 使用隔离 profile 和隔离数据库成功启动；
- AddonManager 能识别 `zotagent@shzhao.local` 和开发代理路径。

## 待验证

- 在隔离 Zotero 的附加组件管理器中手动确认启用后，检查 bootstrap 和 UI；
- 真实模型请求的 JSON/JSONL 事件形状；
- Zotero 原生笔记与 Better Notes 光标事务；
- Translate for Zotero、PDF Figure、Ethereal Reference 选区共存；
- Attanger 外部附件路径。

## 阻塞最终满血等价的工作

- PTY 终端视图；
- Agent 原生审批请求回传；
- 结构化/PTY 同一 session 切换；
- 窗口、消息显示缓存和 session 映射持久化；
- 多文献全文提取与 token 预算。
