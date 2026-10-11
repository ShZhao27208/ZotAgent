## 0.6.2 - 2026-10-11

### 改进
- 每次问答以一个外框整体包围，内部按“记录标题、用户问题、Agent 回答、上下文与记录信息”排列四个独立框；框之间不插入空白段落。
- 标题突出 Agent 和问题主题；问题与回答前置，文献、时间、选区及截图统一放到最后。
- 回答内部标题降级，保持归档层级清晰；保留完整问题及回答，不调用模型、不额外消耗 token。
- 兼容已有记录的排序、去重和手动编辑；Markdown 导出展开边框并保留四段结构。

### 验证边界
- 新布局用于新归档记录，不批量改写已有笔记；Zotero 原生编辑器中的保存重开显示效果尚未实测。

## 0.6.1 - 2026-10-09

### 改进
- 归档笔记中每条记录的“问题”（含选区和截图）与“回答”分别显示在独立边框内，层次更清晰。边框由插件在保存时生成，不经过 Agent，不消耗 token。
- 边框使用 Zotero 笔记原生支持的单格表格，手动编辑和重新保存后仍保留；已有记录不改写。
- 导出 Markdown 时展开边框，问题和回答仍为普通标题、列表和表格。

## 0.6.0 - 2026-10-09

### 修复
- 原生终端创建超时会真正中止请求；Runtime 在 CLI 路径解析后发现连接已断开则不创建终端。等待上限由 8 秒提高到 20 秒，覆盖 WSL 首次检测。
- 创建后 30 秒内无人读取输出的终端自动关闭，不再残留并锁住同一 Agent 的全部会话。
- Agent 路径检测（三个 CLI 的 `--version`）只在 Runtime 实例变化、相关设置变化或手动检测时执行，不再在每条消息前重复运行；检测失败下次自动重试。
- OpenCode 模型列表持久化到数据目录，Runtime 重启后首条消息无需等待 `opencode models`；缓存过期时先使用旧列表并在后台刷新。所选模型或最近模型不在缓存中时先重新查询一次再判断。
- 补充孤儿终端、检测去重、模型列表持久化与过期刷新回归测试。

## 0.5.1 - 2026-10-09

### 修复
- Runtime 在模型准备前立即刷新 NDJSON 响应头，避免慢 OpenCode 查询撞上前端 10 秒连接超时；错误与完成事件使用完整请求标识。
- 准备任务纳入状态、会话占用和安全停止；取消或断线后不再启动 Agent，最后一个模型查询订阅者取消时结束查询进程。
- 模型列表缓存 5 分钟并合并并发查询，最近模型仍每次读取；显式选定模型时跳过最近记录查询。单条查询超时为 45 秒。
- 移除发送前重复路径检测；配置未改变时不清空检测/模型缓存。
- Runtime 协议升级为 7，健康检查包含源码构建指纹；内置部署按版本和指纹隔离，避免同版本安装复用旧代码。
- 补充慢启动、准备失败/取消/断线、并发缓存、停止保护及同版本升级回归。

## 0.5.0 - 2026-10-08

### 新功能
- 主文献和已导入参考文献一键附加 / 取消全文。
- PDF 文本批量导出为独立 Markdown：文献清单、用户选择文件夹、同名编号及逐篇失败提示。
- 设置页 Runtime 启动 / 停止 / 重启，按身份验证停止，有任务先确认，手动停止后禁止自动拉起。
- OpenCode 动态模型 ID 下拉菜单，默认跟随同一环境的最近使用模型。

### 修复
- 文献操作分组、模型旁刷新及三个统一检测按钮；导出选择面板独立滚动，底部按钮固定可见。
- 内容尺寸自适应与手动尺寸优先，消除尺寸观察反馈造成的缩放震荡。
- 去掉 OpenCode `--dir`、Codex 冗余目录参数和 Claude 文本输入 / 图片目录授权冗余参数；保留 cwd、结构化输出、图片及会话所需参数。
- 路径检测保留手动配置，无效路径报错，空值或自动查找才写回。
- Enter 发送、Shift+Enter 换行，兼容输入法确认与按键重复。
- 模型不存在或最近记录不可读时提示选择，不回退到旧默认配置。
- 优先当前阅读 PDF / Zotero 首选 PDF；插件关闭时释放自身启动且可认证的 Runtime。

# Changelog

## 0.4.0 - 2026-09-26

### Features

- Add shared native conversation archive notes, terminal-state records, embedded screenshots, note rotation, naming and ordering settings, and Markdown export.
- Submit all extracted PDF text for all three agents, with explicit counts and submission state.

### Fixes

- Add per-request frontend cancellation and frozen document/archive ownership; restore historical document bindings and handle failed batches.
- Send Claude screenshots as structured image input; retain multiple visible text blocks and track temporary-file ownership.
- Preserve actual push records when regenerating version history.

### Validation and known issues

- Last automated run: 124 passed, 1 skipped (125 total). No new test run performed after the user requested tests stop.
- Native Zotero 10.0.3 archive smoke test failed its saved-record-count assertion; real editor, image export and sync acceptance remain incomplete.
- Windows/WSL environment and path mismatch, Windows OpenCode exit code 1, and incomplete PowerShell prompt transmission remain under investigation.
- This version snapshots the current implementation at the user’s request before addressing those issues. See `docs/RELEASE-0.4.0.md`.

## 0.3.10 - 2026-09-24

### Fixes

- Correct CMD outer quoting and disable Node argument re-escaping for Agent version checks and structured requests. Pass the raw CMD command line to Windows PTY.
- Report stderr when Agent version checks fail instead of only showing unavailable.
- Reproduced the old failure using Windows Node and an installed OpenCode npm wrapper; corrected invocation returns version 1.18.32. Add Windows regression coverage for spaced wrapper paths and arguments.

## 0.3.9 - 2026-09-24

### Fixes

- Remove the remaining jar manifest read through `Zotero.File.getContentsAsync`, which forwards to HTTP and triggers `nsIURI.username`. Use the version supplied by Zotero bootstrap instead.
- Save detected Node immediately and label installer errors by stage.
- Correct the test double to reproduce Zotero URI forwarding; verify failure before the fix and successful installation after it, plus bootstrap version propagation. Windows Zotero end-to-end verification remains pending.

## 0.3.8 - 2026-09-24

### Fixes

- Extract the embedded Runtime directly from the local XPI instead of using the download helper, avoiding unsupported jar URI credential access (`nsIURI.username`).
- Correct Windows startup wording and refresh automatically saved paths even if the subsequent connection fails.
- Add regression coverage that rejects HTTP download/URI credential access for packaged resources. Real Windows Zotero verification is still pending.

## 0.3.7 - 2026-09-24

### Fixes

- Bundle Runtime source and Windows x64/ARM64 node-pty dependencies in the XPI, excluding Node.js and build-machine absolute paths.
- Install the backend under the Zotero data directory, discover existing Windows Node.js, and launch natively by default. Keep WSL as an explicit manual option.
- Preserve Windows paths and use the Windows user directory for sessions and temporary files.

### Validation

- Automated installer tests cover a copied XPI, Unicode/spaces in the data path, repeat startup, and missing Node. Actual Zotero Windows installation remains a manual verification.


## 0.3.6 - 2026-09-23

### Improvements

- Run structured Agent requests, version checks, and PTY sessions through the user's current default Shell with its login configuration.
- Use automatic runtime environment defaults instead of requiring WSL-specific platform settings for every Agent.
- Keep OpenCode on its native default model unless a temporary override is explicitly configured, and show detected model information in the dialog.
- Preserve CMD AutoRun configuration when launching Windows commands.

### Validation

- 95 Node.js tests pass; XPI build and verification pass.

## 0.3.5 - 2026-09-21

### Fixes

- Restore the September 10 direct `env → Node → Runtime` launch strategy with literal arguments and an explicit Node directory in PATH.
- Resolve the default Node command to the local build metadata instead of relying on Bash or NVM shell initialization.
- Pass the configured local Endpoint port to Runtime. Recover an unreachable default port 24119 through 24129, saving the new address only after authentication succeeds. Preserve custom endpoints and report Token conflicts.

### Validation

- Windows launched the direct command on port 24129; authenticated health and all three Agent version checks succeeded.
- Added tests for literal arguments, absolute Node paths, custom ports, authenticated fallback, and failure rollback.

## 0.3.4 - 2026-09-21

### Fixes

- Bound health, configuration, and CLI discovery requests with Zotero HTTP timeouts; expose failed discovery instead of waiting indefinitely.
- Normalize saved Linux paths pasted with backslashes and a missing leading slash.
- Launch Bash through `wsl.exe --exec` to prevent the default WSL shell from expanding startup variables prematurely.
- Repair an incorrectly capitalized home directory only when Runtime confirms the configured directory does not exist.
- Provide explicit bootstrap timers and report early WSL process exits.

### Validation

- Launched Runtime from Windows using the normalized saved paths on an isolated test port; authenticated health and all three CLI version checks passed.
- Stopped the test Runtime after validation. Zotero UI installation validation remains manual.

## 0.3.3 - 2026-09-21

### Fixes

- Preserve the local runtime source location in source-built XPI packages after Zotero installs them.
- Initialize NVM and common CLI paths when launching WSL runtime; quote shell arguments and share concurrent startup attempts.
- Detect installed agents on connection and refresh preferences without requiring a chat request.
- Discover native and NVM CLI installations when the shell PATH is incomplete.
- Fill an unset working directory from the authenticated runtime while preserving explicit user settings.

### Validation

- Add regression coverage for installed XPI startup, quoted paths, concurrent connections, CLI discovery, and default working directory recovery.
- Locally built XPI packages still require the source checkout and its installed dependencies. Windows Zotero UI validation remains manual.
