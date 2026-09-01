# ZotAgent

ZotAgent 将本机 WSL 中真实的 OpenCode、Codex CLI 和 Claude Code 接入 Zotero 9。插件负责文献上下文、多对话框和笔记写入；Agent 继续使用原生配置、工具、MCP、skills 和 session。

## 当前版本

`0.3.0` 是可构建的 Phase 0/1 骨架，已包含：

- Zotero 9 Manifest V2 插件；
- 可拖动、缩放、最小化的多对话框；
- 当前文献检测和 PDF 选区广播；
- 每个窗口独立 Agent 与原生 session 映射；
- Runtime Host 的鉴权 HTTP/NDJSON 流；
- OpenCode JSON、Codex JSONL、Claude stream-json 适配器；
- 停止请求、Markdown 复制、光标插入和条目子笔记；
- 本机 Ubuntu/NVM/Agent 默认路径；
- 零外部依赖的构建、测试和 XPI 打包。

尚未完成：PTY 终端视图、Agent 审批的交互式回传、窗口状态持久化、多文献全文提取。结构化接口不能表达的功能必须在 PTY 完成后才能满足最终“满血等价”门槛。

## 本机基线

- Zotero `9.0.6`：`E:\Zotero\zotero.exe`
- WSL2：`Ubuntu`
- Node.js：`24.18.0`
- OpenCode：`1.17.20`
- Codex CLI：`0.144.4`
- Claude Code：当前检测为 `2.1.211`（以 Runtime 实时探测为准）

## 开发命令

```bash
cd /mnt/d/AselfRE/ASelfvRep/ZotAgent
npm test
npm run build
npm run verify
```

构建产物：`dist/zotagent-0.3.0.xpi`。

## 启动 Runtime Host

先设置一个随机 Token，再启动 Runtime：

```bash
cd /mnt/d/AselfRE/ASelfvRep/ZotAgent
ZOTAGENT_TOKEN='replace-with-a-random-token' npm run runtime
```

默认监听 `http://127.0.0.1:24119`。在 Zotero 的 `设置 -> ZotAgent` 中填写相同 Endpoint 和 Token，然后点击“测试运行环境”。

Runtime 默认只接受 Bearer Token 鉴权；命令使用参数数组和 `shell:false`，不会把 prompt 拼接进 shell 命令。

安装插件后，ZotAgent 默认会生成随机 Token，并通过 `wsl.exe` 自动启动 Runtime。首次使用请在设置中确认 WSL 发行版、WSL Node.js 路径和 Runtime 脚本路径；自动启动失败时可使用“立即启动”查看错误，或关闭自动启动后按上述命令手动运行。

## 安装插件

1. 创建独立 Zotero 测试 profile 和小型测试库。
2. 在该 profile 的附加组件管理器中安装 `dist/zotagent-0.3.0.xpi`。
3. 启动 Runtime Host，填写 Token 并测试三个 Agent。
4. 从 Zotero `工具 -> 新建 ZotAgent 对话框` 或右下角 `+` 打开窗口。

开发阶段不要把测试 profile 指向 `E:\Zotero_Storage\zotero.sqlite`。

直接把开发目录代理文件放进一个全新 profile 时，Zotero 9 会发现扩展但默认保持禁用，必须在附加组件管理器中确认启用。正常用户安装应使用构建出的 XPI。

## 数据边界

- 条目和笔记只通过 Zotero API 写入；
- 附件路径从 Zotero API 获取，兼容 Attanger 的链接或外部附件；
- Runtime 状态使用 `~/.local/share/zotero-full-agent`；
- 不清理或复用现有 `E:\Zotero_Storage\agent-runtime`；
- 普通日志不记录 Token、prompt、PDF 全文或完整环境变量。

## 目录

```text
plugin/       Zotero 插件源码
runtime/      WSL Runtime Host 与 Agent Adapters
scripts/      构建、XPI 打包和验证
test/         Node.js 单元与集成测试
docs/         Phase 0 验证记录
```
