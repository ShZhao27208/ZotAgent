# 0.4.4 — 原生终端默认显示插件会话

## 修改

- Codex 点击“打开原生终端”后直接执行 `codex --cd <原工作目录> resume --all --include-non-interactive`，从包含非交互会话、跨目录历史的原生列表中选择对话。结构化聊天继续使用 `codex exec`，不迁移 App Server。
- Claude Code 点击同一按钮时，仅在终端子进程设置 `CLAUDE_CODE_ENTRYPOINT=sdk-cli`，执行 `claude --resume`。Windows、WSL、Windows Runtime 启动 WSL Agent 均传递该设置。普通恢复列表过滤 SDK 来源是之前真实插件对话不可见的原因，此方案不改写历史文件或系统环境。
- 会话信息明确显示“恢复列表”，原结构化会话 ID 仅供核对，不声称列表已选中或恢复成功。列表中的选择不会更改结构化聊天原有的会话绑定。
- 因原生列表不向插件报告选择结果，打开期间禁止其他窗口向同一 Agent 提交结构化请求或再打开该 Agent 的终端；关闭后解除。其他 Agent 可正常使用。
- Runtime 协议升为 5，防止更新后复用不支持恢复列表的旧服务。README 补充独立 WSL / PowerShell 命令与兼容边界。

## 验证

- 完整回归：149 项，148 通过，1 项 Windows CMD 专用测试跳过。新增/更新验证包含两个 Agent 的实际启动参数、Claude 子进程环境、跨环境传递、跨窗口占用保护及关闭后解除、前端恢复列表信息。
- 构建、语法及 XPI/内置 Runtime 内容一致性检查通过，新增 Codex Adapter 产物一致性检查。
- 本机 Claude Code 2.1.282 原生 CLI 检查：在临时配置目录，用本地固定响应服务生成测试对话，再以 SDK 来源测试转录验证 `CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume`。真实 TUI 列出测试会话，选中后显示原问题和回答。恢复阶段模型地址设为不可用的本地端口，不提交新问题。
- 未下载浏览器、未启动 Zotero 测试窗口，未调用付费模型。Codex 启动参数依据本机 0.156.1 帮助和官方 CLI 文档，并由模拟 CLI 集成测试验证；真实 Windows Zotero 中的终端展示仍由用户验收。

## 边界与验收

- Claude 的入口变量是针对 2.1.282 实现验证的兼容办法，不是官方承诺稳定的列表参数。默认按项目筛选，恢复列表按 Ctrl+A 显示所有项目。Claude 会排除当前已打开的会话。
- 原来约 14.7KB、名称为 `(session)` 的空初始化记录可能仍可见，它们没有问题和回答。本次使真正有内容的 SDK 会话进入列表，不为这些空记录伪造内容。
- Codex 两个参数控制启动恢复列表，不承诺在已打开的 Codex 内再次执行 `/resume` 仍保持同样筛选；重新选择时关闭并重开插件原生终端即可。
- 仍不自动归档原生终端新增的消息。
- 安装新版、重启 Zotero；若使用手动启动的外置 Runtime，也停止旧服务后用更新后的脚本重启。依次打开 Codex 和 Claude 原生终端，选择包含插件问题的历史，核对输入、回答和继续对话。Claude 必要时按 Ctrl+A。

安装包：`dist/zotagent-0.4.4.xpi`，14,081,854 字节。

SHA-256：`95b2aca4ad38640e04e950f49aa581655eac621ecf1d43e5ac3199f97234a3f5`。
