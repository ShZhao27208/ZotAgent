# Windows / WSL 与 OpenCode 输入修复工作记录

本轮顺序：先将 0.4.0 快照提交为 `9ab91882bf001f189617b9f1c56df0941e7e21b1`，推送分支与标签、上传预览版安装包、在 VERSION-HISTORY.md 记录实际结果；之后开始本文件所述修复。这些后续修改汇入 0.4.2，不包含在 GitHub 0.4.0 安装包内；实际推送结果见 VERSION-HISTORY.md。

## 已定位的代码问题

- 前端 `syncAgentPaths()` 在 Windows 后端时不发送用户选择的 Agent 平台，导致 WSL 下拉选择无效。
- `processInvocation()` 以默认命令名覆盖适配器已检测到的绝对路径；程序展示的路径与启动目标可能不同。
- 检测结果只有在 `available` 为真时才回填路径，失败时旧 WSL 路径继续显示在 Windows 配置中。
- Runtime 健康检测不校验宿主平台，也不检查协议版本；切换设置后仍可能复用旧 Windows 服务。
- OpenCode 的完整多行 prompt 经 Shell 参数和 Windows npm `.cmd` 再次解析，存在换行丢失的传输缺陷。官方 `packages/opencode/src/cli/cmd/run.ts` 包含 `await Bun.stdin.text()` 输入路径，支持使用 stdin。

退出码 1 的所有现场原因尚未实测确认；上述代码问题不能代替具体 CLI 的错误诊断。

## 本地修改

- 每个 Agent 的环境选择发送给 Runtime；Windows 后端通过 `wsl.exe -d <发行版>` 检测并调用 WSL 内 CLI，并对截图文件路径和工作目录做转换。
- Windows 本机直接启动解析到的 `.exe`；标准 npm 包根据 bin 元数据定位真实原生程序或 Node 入口，避免不必要的 `.cmd` 包装器。
- OpenCode prompt 改为完整 stdin，参数中不再携带问题和 PDF 全文；请求体仍保留 4 MiB 限制。
- 错误输出同时保留失败进程的非 JSON stdout，减少只有退出码的信息缺失。
- Windows 与各 WSL 后端配置分别保存；连接时检查实际宿主和协议；对旧默认端口上的服务使用独立端口，不终止旧进程。自定义 Endpoint 不自动改写。
- 前端显示对应环境的检测路径；切换运行环境时清除不适用的原生 session ID。连接或任务进行中避免切换环境。
- 异步 WSL 路径检测结束后再次检查连接是否已关闭，避免停止之后继续启动 Agent。

## 验证进展与边界

- 用户已在本机验收：基本归档、Claude/Codex 截图识别和笔记嵌图、新建笔记，以及此前测试清单的功能 9/10；用户要求不再扩展测试原清单第 8 项。
- 旧原生笔记容器 `div.zotero-note` 的兼容问题已修正；保留用户编辑与归档边界的回归测试通过。
- 本轮仅运行自动化逻辑测试及构建验证，不再启动独立 Zotero 窗口，不下载浏览器。Windows 专用测试在 WSL 环境跳过；额外 Windows smoke 脚本留作可选诊断，本轮未运行。
- Windows 后端支持 Windows / WSL Agent 混用。WSL 后端直接调用 Windows Agent 暂不支持，会明确提示切换到 Windows 后端；WSL 后端仍需其源码、Linux 依赖和 Node 路径。
- 整体切换 WSL 后端与只在 Windows 后端选择 WSL Agent 是不同操作；后一种不需要在 WSL 再配置 Runtime。
- 0.4.1 为本地验收包，新的完整批次版本为 0.4.2；协议标记升为 3，避免热更新后静默复用旧 Runtime。
- 新增模板命名、隐藏启动和布局修改，以及 OpenCode 模型诊断，详见 RELEASE-0.4.2.md。原生终端历史可见性仍需单独核对，不宣称本轮已修复。
