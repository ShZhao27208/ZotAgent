## 0.7.2 - 2026-10-29

### 改进
- 保留底部“复制 Markdown、插入光标、保存子笔记”按钮，操作最新回答；新增每条 Agent 回答的右键菜单，操作所选回答。
- 保存子笔记时同时保存对应用户问题和 Agent 回答，采用独立标题及边框区分；自动保存同样包含问题。
- 回答绑定原问题和文献，历史恢复保留对应关系，避免保存旧回答时误用最新问题或文献。
- 添加 Apache License 2.0、包许可证标识及安装包许可证文件；保留并补充新版双语 README。

### 发布整理
- 正式发布 0.7.2；补充本地环境、缓存、报告及系统临时文件忽略规则，清除重复 README 和 Windows 下载标记。
- 清除 Runtime 源码目录中的嵌套工具缓存；构建过滤隐藏文件和临时文件，防止本地状态进入分发包。
- 安装包校验新增项目与依赖许可证检查，以及本地文件误打包检查。

### 验证边界
- Zotero 实际界面中的右键菜单、光标插入及笔记显示尚未实测。

## 0.7.0 - 2026-10-23

### Agent 环境
- Windows 与 WSL 的 Agent 路径分别保存（每个 Agent 两个字段），切换运行环境不再清空另一边；连接后两个系统同时检测并分别回填，已填写的路径不会被覆盖。
- 各 Agent 可分别选择 Windows 或 WSL 并同时使用。“自动”优先使用后端所在系统，未安装时改用另一系统；恢复会话时留在会话所属的系统。
- WSL 后端现在也能通过 Windows 互操作启动 Windows Agent；Windows 后端仍通过 `wsl.exe` 启动 WSL Agent。工作目录在 `C:\…`、`/mnt/c/…`、`\\wsl.localhost\…` 之间自动转换。
- “检测连接”同时列出 Windows 与 WSL 的 Node.js。WSL 后端的 Node 可留空，由 WSL 登录环境（含 NVM）查找，不再误用 `/mnt/…/node.exe`。
- 路径默认值改为空。旧版本残留的 `codex`、`claude` 等命令名按“自动检测”处理，不再阻止检测结果回填；旧设置自动迁移。

### 归档笔记
- 去掉表格外框：每条记录上下各用两条分隔线与其他记录隔开，记录内部各部分之间用一条分隔线。排序时分隔线随记录移动；已有的无框记录和 0.6.x 带框记录照常识别。Markdown 导出时双线合并为一条。

### 修复与维护
- Windows 上经 `cmd.exe` 启动 npm 包装脚本时，参数中的引号、`&`、`|`、`%变量%` 原样传递，不再被 cmd 解释。
- Runtime 健康检查报告的版本号与插件一致（此前固定为 0.6.1）；协议版本升至 8。
- 请求参数错误返回 400，内部系统错误返回 500 并写入 Runtime 日志；数据目录只在一处计算。
- 依赖版本固定，新增 `npm run coverage`（Node 内置覆盖率）。旧发布与修复说明文档不再随仓库发布。

### 验证边界
- 在 WSL 中实测：同时检测到 Windows 与 WSL 的 OpenCode、两个系统的 Node，并从 WSL 后端成功启动 Windows OpenCode（`--version`）。cmd 转义在 Windows Node 下用 npm 风格包装脚本实测通过。Windows Zotero 界面内的交互与归档显示尚未实测。

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
- This version snapshots the current implementation at the user’s request before addressing those issues.

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
