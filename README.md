# ZotAgent

> 将 Codex、Claude Code 与 OpenCode 直接接入 Zotero，在阅读文献的同时使用完整的本地 Agent 能力。

ZotAgent 是一个面向学术阅读与研究工作的 Zotero 插件。它不是在 Zotero 中重新实现一套聊天机器人，而是把已经安装在电脑上的 **Codex CLI、Claude Code 和 OpenCode** 连接到 Zotero 阅读环境中：Zotero 负责文献、PDF、选区、批注和笔记，Agent 继续使用各自原生的模型、配置、工具、Skills、MCP 与会话系统。

项目同时面向 **Windows 与 WSL** 环境。Agent 可按实际安装位置配置为 Windows 或 WSL 命令，Runtime Host 负责鉴权、进程管理、流式输出和原生终端通信。

当前版本：**0.4.0**（开发预览；已知问题见 [版本说明](docs/RELEASE-0.4.0.md)）

## 为什么使用 ZotAgent

传统 AI 阅读插件通常只能把少量文本发送给固定模型；直接使用命令行 Agent 又需要在 Zotero、终端、PDF 和笔记之间来回切换。ZotAgent 将两者结合：

- 保留 Zotero 对文献库、PDF 文本、选区、注释和笔记的管理能力；
- 保留 Codex、Claude Code、OpenCode 的原生模型、工具调用、项目目录和会话记忆；
- 在同一个文献页面完成提问、对照阅读、截图、整理答案和写回笔记。

## 功能概览

### 文献上下文

1. **自动识别并锁定当前文献**
   新建对话框时自动绑定当前 PDF 或条目，并在顶部显示主文献标题，减少误读风险。主文献一经绑定便保持锁定，不会因 Zotero 主页面的选择变化而被替换。

2. **PDF 选区自动同步**
   在 PDF 中划选一句话，选中的文本会自动出现在所有已打开的 ZotAgent 对话框中，可以直接围绕它提问。

3. **选区可编辑**
   自动同步的文字不是只读内容。发送前可以修改、补充或清空选区，也可以保留文献上下文后询问其他问题。

4. **全文注入由用户控制**
   “附加 PDF 全文”默认关闭。需要总结或深度分析时再开启，由 Zotero 在本地解析 PDF 文本并注入 Agent 上下文，避免每轮对话重复浪费上下文窗口。

5. **多文献综合阅读**
   主文献保持锁定；在 Zotero 主页面多选其他条目后，通过“导入选中文献”加入参考文献池。每篇参考文献可独立决定是否注入全文，并可选择“综合分析”或“分别处理”。

### 笔记与批注

6. **将回答保存为 Markdown 笔记**
   Agent 回答以 Markdown 为中间格式，可复制 Markdown，也可转换为 Zotero 支持的笔记格式后保存为当前条目的子笔记。

7. **插入当前光标**
   可以把最后一次回答插入活动 Zotero 笔记的光标位置；在 PDF 高亮、下划线或注释编辑弹窗中工作时，也会优先尝试写入当前注释位置。

8. **自动保存与自动插入**
   设置中可以启用“生成完成后自动保存子笔记”或“自动插入活动笔记光标”，减少重复整理步骤。

### 多 Agent 工作区

9. **一个界面切换三个 Agent**
   每个对话框都可以在 OpenCode、Codex 和 Claude Code 之间切换。Agent 默认使用各自 CLI 的配置和模型；Windows 默认使用本机后端，WSL 后端需在高级设置中手动启用。

10. **同一文献打开多个对话框**
    可以同时打开多个独立窗口，例如让 Claude Code 总结、Codex 核查论证、OpenCode 组织对比表。PDF 选区会广播到所有接收选区的窗口。

11. **原生会话彼此隔离**
    每个窗口按 Agent 保存原生 session ID。Claude Code、Codex 和 OpenCode 继续使用各自的会话与记忆系统，不把某个 Agent 的历史混入另一个 Agent。

12. **原生终端模式**
    点击“打开原生终端”即可在对话框中使用当前 Agent 的交互式终端界面，适合需要原生命令、模型切换或复杂工具交互的任务。

13. **会话管理**
    插件记录会话与窗口映射，可以查看历史、恢复会话或删除不再需要的记录。

### 图像上下文与界面

14. **截图与长截图**
    可在 PDF 页面框选区域，预览截图后交给支持视觉输入的模型；长截图模式可在滚动阅读时收集连续区域。最终视觉能力取决于所选 Agent、模型和 CLI 对图片输入的支持。

15. **可拖动的浮动界面**
    对话框可以在文献页面上自由拖动、缩放、最小化和关闭。浮层只在自身区域接收鼠标操作，不阻挡其他文献阅读区域。

## 工作方式

```text
Zotero PDF / 条目 / 选区 / 截图
                 |
                 v
        ZotAgent 插件界面
                 |
       Bearer Token + NDJSON
                 |
                 v
      Runtime Host (Node.js)
          /       |       \
         v        v        v
     OpenCode   Codex   Claude Code
```

- Zotero 插件负责界面、文献上下文、PDF 选区和笔记写入；
- Runtime Host 默认监听 `127.0.0.1:24119`，负责鉴权和本地进程管理；
- Agent Adapter 将统一请求转换为各 CLI 的原生 JSON/JSONL/stream-json 调用；
- 原生终端通过本地伪终端与 Zotero 内嵌终端通信。

## 环境要求

- Zotero 7 或更高版本；当前 manifest 允许 Zotero `6.999` 至 `10.*`；
- Windows 10/11；使用 WSL Runtime 时需要 WSL2；
- Node.js `24` 或更高版本；
- 至少安装并完成登录以下一个 CLI：OpenCode、Codex CLI 或 Claude Code。

三个 Agent 不要求同时安装。未安装的 Agent 可以保留不用。

## 安装

### 使用构建好的 XPI

1. 获取 `dist/zotagent-<版本>.xpi`。
2. 打开 Zotero 的 `工具 -> 插件`。
3. 点击右上角菜单，选择“从文件安装插件”。
4. 选择 XPI，安装后重启 Zotero。
5. 打开 `编辑 -> 设置 -> ZotAgent` 查看自动连接和 Agent 检测结果。

Windows 安装包包含 Runtime 源码和 Windows x64/ARM64 PTY 依赖，不包含 Node.js。首次启动自动解压到 Zotero 数据目录的 `zotagent/runtime/<版本>/`，通过 PATH、常见安装位置查找本机 Node.js 24+ 并保存路径。无需 WSL，也无需保留构建源码目录。

默认使用 Windows 原生后端。0.4.2 的配置入口区分两种方式：后端保持“自动”，仅将某个 Agent 环境选择为 WSL，由 Windows 后端调用该发行版中的 CLI；或者将整个后端切换到“WSL（手动高级配置）”，并配置 WSL 内的 Runtime 源码、依赖和 Node 路径。0.4.2 包含环境切换、OpenCode 完整输入、命名模板和聊天布局修复；0.4.0 安装包不包含这些修复。

### 从源码构建


```bash
git clone git@github.com:ShZhao27208/ZotAgent.git
cd ZotAgent
npm install
npm test
npm run build
npm run verify
```

构建产物位于：

```text
dist/zotagent-<package.json 中的版本>.xpi
```

## 首次配置

进入 `Zotero 设置 -> ZotAgent`。

### Runtime Host

Windows 默认无需填写 Runtime 路径：插件自动安装内置后端并查找本机 Node。安装 Node 后需重启 Zotero刷新 PATH；未检测到时可在高级设置填写 `node.exe` 的 Windows 绝对路径，然后点击“连接并检测”（旧版按钮名为“立即启动”）。默认只监听本机，Token 自动生成。

“WSL（手动高级配置）”仅供已安装 WSL 的用户选择，需要在 WSL 安装 Node、Runtime 依赖，并指定脚本与 Node 路径。它不是 Windows 安装的前置条件。

### 本机 WSL 后端填写示例

以下路径于 2026-09-26 在本机核对存在；其他电脑请用下方命令查询自己的路径。在 `Zotero 设置 → ZotAgent` 中先选择后端启动位置，再填写路径，避免切换环境时配置被对应环境的已保存值替换。

| 设置项 | 本机填写值 |
| --- | --- |
| 后端启动位置 | WSL（手动高级配置） |
| WSL 发行版 | `Ubuntu` |
| Runtime 脚本 | `/home/shzhao/AGitRep/SelfRep/ZotAgent/runtime/src/index.js` |
| Runtime Node.js | `/home/shzhao/.nvm/versions/node/v24.18.0/bin/node` |
| 默认工作目录 | `/home/shzhao` |
| 三个 Agent 的运行环境 | WSL (Linux)，或者自动（跟随 WSL 后端） |

Runtime 脚本填写 `index.js` 文件，Node 填写可执行文件，默认工作目录填写已存在的文件夹。WSL 字段使用 `/home/...` 格式，不填写 Windows 资源管理器显示的 `\wsl.localhost\Ubuntu\...`，也不要在字段值外加引号。工作目录是 Agent 工作的位置，不是 Runtime 源码的位置；需要处理某个项目时，可改为该项目的 WSL 目录。

在 **Ubuntu / WSL 终端**查询并核对：

```bash
cd /home/shzhao/AGitRep/SelfRep/ZotAgent
realpath runtime/src/index.js
command -v node
node --version
printf '%s\n' "$HOME"
command -v opencode
command -v codex
command -v claude
```

本机 `command -v node` 返回上表中的路径，版本为 `v24.18.0`。NVM 升级或切换 Node 版本后，应重新查询，更新 ZotAgent 的 Node 路径。在 **Windows PowerShell** 中可先查看发行版，再进入 Ubuntu 执行上述命令：

```powershell
wsl --list --verbose
wsl -d Ubuntu
```

如果迁移源码或在新 WSL 环境安装依赖，在该项目目录中执行：

```bash
npm ci
```

`npm ci` 会按锁文件重新安装项目依赖。本机已经有 Linux `node-pty` 依赖，无需仅为填写设置重复安装。Windows XPI 内附的 Windows PTY 二进制不能替代 WSL/Linux 依赖。

保存后点击“连接并检测”，再点各 Agent 的测试按钮。Endpoint 与 Token 通常沿用该环境的配置；Token 由插件生成，不需要粘贴到聊天或错误反馈中。

### Windows Claude Code 路径与安装

**本机检查结果（2026-09-26）：Windows PowerShell 的命令搜索及常见安装目录未找到 Claude Code。** WSL 内已经安装 Claude Code，但这不等于 Windows 也已安装，不能把 `/home/.../claude` 填到运行环境为 Windows 的路径字段。

先在 **Windows PowerShell** 查询：

```powershell
Get-Command claude,claude.exe,claude.cmd -All -ErrorAction SilentlyContinue |
  Select-Object Name,CommandType,Source,Path
where.exe claude
Test-Path "$env:USERPROFILE\.local\bin\claude.exe"
```

若查询没有结果，可使用 Claude Code 官方 Windows 安装脚本（由你手动执行；文档编辑不会自动安装）：

```powershell
irm https://claude.ai/install.ps1 | iex
```

安装后重新打开 PowerShell，查询和检查：

```powershell
Get-Command claude -All | Select-Object Name,Source,Path
& "$env:USERPROFILE\.local\bin\claude.exe" --version
```

原生安装的常见路径是 `%USERPROFILE%\.local\bin\claude.exe`。本机对应以下值，**仅在安装完成且 `Test-Path` 返回 `True` 后填写**：

```text
C:\Users\ShZhao27208\.local\bin\claude.exe
```

若使用 npm 安装方式，可在 Windows PowerShell 执行以下命令并查询实际位置；两种安装方式选择其一即可：

```powershell
npm install -g @anthropic-ai/claude-code
$claudeCmd = Join-Path (npm prefix -g).Trim() 'claude.cmd'
$claudeCmd
Test-Path $claudeCmd
& $claudeCmd --version
```

npm 安装时 ZotAgent 可填写上面输出的 `claude.cmd` 路径；不要假定 npm 全局目录一定在 AppData。首次使用需先在 Windows 终端运行 `claude`（或 `& $claudeCmd`），按 CLI 提示完成登录/配置；再重启 Zotero，后端选择“自动”、Claude Code 运行环境选择“Windows”，填写实际路径并点击“测试 Claude Code”。`--version` 成功仅确认程序可以启动，仍需一次简短提问确认模型配置可用。

如果只使用本机现有的 WSL Claude Code，无需额外安装 Windows 版。Claude Code 运行环境选择 `WSL (Linux)`，其已确认的本机命令路径为：

```text
/home/shzhao/.nvm/versions/node/v24.18.0/bin/claude
```

该命令指向 Linux 可执行文件；即使内部目标文件名带 `.exe`，也不能据此当作 Windows 程序使用。

### Agent 命令

为每个 Agent 配置：

- 可执行文件的绝对路径；
- 运行环境：默认自动检测，也可以选择 `WSL (Linux)` 或 `Windows`；
- 默认 Agent；
- 可选的 OpenCode 临时模型，格式为 `provider/model`。留空时使用 OpenCode 自己的默认模型。

示例：

```text
OpenCode:    /home/user/.nvm/versions/node/v24.x/bin/opencode
Codex CLI:   /home/user/.nvm/versions/node/v24.x/bin/codex
Claude Code: /home/user/.nvm/versions/node/v24.x/bin/claude
```

Windows CLI 路径只有在自动检测失败时才需要填写；配置后分别点击三个“测试”按钮确认可用性。

## 使用指南

### 单文献提问

1. 在 Zotero 中打开 PDF。
2. 通过阅读器工具栏、`工具 -> 新建 ZotAgent 对话框` 或快捷键 `Ctrl+Shift+Y` 打开窗口。
3. 检查顶部“主文献”标题是否正确。
4. 划选 PDF 文字，选区会自动进入面板。
5. 必要时修改选区，输入问题并发送。

### 注入 PDF 全文

对于“总结全文”“提取研究方法”“评价论文贡献”等任务，勾选“附加 PDF 全文”后发送。普通问答、局部解释或已建立上下文的后续对话可以保持关闭，以减少上下文占用。

### 多文献综合分析

1. 在当前对话框中确认主文献已经锁定。
2. 回到 Zotero 主页面，多选需要比较的其他文献。
3. 点击对话框中的“导入选中文献”。
4. 在参考文献列表中为需要全文的条目单独勾选全文。
5. 选择“综合分析”后提出对比、归纳或研究趋势问题。

选择“分别处理”时，插件会为主文献和参考文献逐篇执行同一个问题。

### 写回 Zotero

- `复制 Markdown`：保留回答原始 Markdown；
- `插入光标`：插入当前活动笔记或 PDF 注释编辑位置；
- `保存子笔记`：保存为当前主文献的 Zotero 子笔记；
- 设置中的自动保存/自动插入适用于需要连续整理的工作流。

### 使用原生终端

在 Agent 下拉框中选择目标 Agent，然后点击“打开原生终端”。已有 Claude/Codex 结构化会话时，终端按会话 ID 和原工作目录恢复；没有会话时使用当前窗口目录启动。Claude Code 首次进入陌生目录时可能要求确认信任；OpenCode 和其他 Agent 的模型或安全确认由其原生界面管理。

## 会话与数据边界

- 文献和笔记通过 Zotero API 读取或写入；
- PDF 全文由 Zotero PDFWorker 在本地解析；
- 会话索引保存在 `~/.local/share/zotero-full-agent/sessions.json`；
- 截图临时文件位于 `~/.local/share/zotero-full-agent/tmp`；
- Agent 的完整记忆仍由各自原生系统管理；
- Runtime 只监听本机地址，并要求 Bearer Token；
- Token、PDF 全文和完整 prompt 不应写入普通日志或提交到 Git。

## 常见问题

### Runtime 无法连接

连接检查使用明确的超时，不会无限停留在“正在连接”。默认 `127.0.0.1:24119` 启动后仍无响应时，插件会尝试 `24129`，仅在原 Token 鉴权成功后保存新 Endpoint。自定义 Endpoint 不会自动替换；启动端口始终与本地 Endpoint 一致。设置中粘贴的 `home\用户\...` 路径会转换为 `/home/用户/...`；Linux 路径区分大小写。Runtime 确认主目录不存在且仅大小写不匹配时，插件会采用真实主目录。

Windows 默认自动部署后端，请确认已安装 Node.js 24+ 并重启 Zotero；手动 WSL 模式才需要检查发行版和脚本路径。确认 Endpoint 和 Token 正确。若提示 Token 不匹配，通常是旧 Runtime 仍占用端口；停止旧进程后重新启动。

### Agent 显示不可用

在 WSL 或 Windows 终端直接运行对应的 `--version`，确认 CLI 已安装、路径正确且完成登录，然后在 ZotAgent 设置中重新检测。

### OpenCode 模型服务失败

在 Zotero → 设置 → ZotAgent 的“OpenCode 临时模型”中填写 `provider/model` **实际 ID**，不能填界面显示名称。本机 WSL 检测到的有效 ID 包括 `opencode/mimo-v2.6-flash-free`；`MiMo-V2.6-Flash Free/OpenCode Zen` 不是这个模型的 ID。可在与插件所选环境一致的终端中核对：

```bash
opencode models
opencode models opencode
```

Windows PowerShell 要调用 Windows 安装的 `opencode`；WSL Agent 则在对应发行版运行上述命令。模型列表查询不发起模型推理。列表存在不代表账户额度、网络及模型服务一定可用。

留空时，ZotAgent **不传 `--model` 参数**，由 OpenCode 自身的配置、Agent 配置及插件决定；这不保证与交互终端最近选中的模型相同。本机还发现部分 OpenCode Agent 配置引用 `minimax/minimax-m2.5-free`。如果默认请求失败而明确填写 ID 成功，应核对对应环境中的 OpenCode / Agent 配置。ZotAgent 不自动改写原生配置，也不自动换模型重试。

新版会显示嵌套错误中的具体消息和模型 ID，不再把带详细原因的失败统一显示为“Agent 返回错误”。全文提交数量表示已交给 CLI 的输入数量，不代表模型一定接纳了全部上下文。

### 更新后仍出现旧行为

1. 退出 Zotero；
2. 停止占用 `24119` 的旧 Runtime；
3. 确认安装的是最新 `dist/zotagent-*.xpi`；
4. 检查 Runtime 脚本路径是否仍指向旧项目目录；
5. 重新启动 Zotero。

### 截图或视觉理解不可用

截图是否能被实际识别取决于 Agent CLI 和当前模型是否支持本地图片输入。请使用支持视觉输入的模型，并确认对应 CLI 能读取截图临时文件。

## 开发与验证

```bash
npm test          # Node.js 测试
npm run build     # 构建 XPI
npm run verify    # 校验 manifest、脚本和 XPI
npm run clean     # 清理 build/dist
```

项目结构：

```text
plugin/       Zotero 插件、设置页与界面资源
runtime/      Runtime Host、Agent Adapter 和终端管理
scripts/      构建与校验脚本
test/         单元测试和回归测试
docs/         设计与验证记录
```

## 项目状态

ZotAgent 仍处于快速迭代阶段。不同 Zotero、OpenCode、Codex CLI 和 Claude Code 版本可能改变内部接口或命令行参数。建议更新前保留旧 XPI，并在正式文献库使用前先验证当前版本的选区、笔记写入、截图和原生终端工作流。

## License

项目当前未附带开源许可证。除非仓库后续明确添加许可证，否则代码版权仍归项目作者所有。


### 记忆笔记命名与聊天窗口（0.4.2）

进入 Zotero → 设置 → ZotAgent → 对话历史归档，在“命名模板”中直接输入格式，再用“插入字段”下拉菜单将字段加入光标位置。例如：

```text
{title}_ {tags}_ {author}_ {date}
{date}{time}
研究笔记_{YYYY}-{MM}-{DD}_{HH}{mm}_{sequence}
```

支持标题、短标题、标签、第一作者、全部作者、发表年份、DOI、条目 key、创建日期/时间、星期、序号及各日期时间分量。`{date}` 为创建日期，`{year}` 为文献发表年份；新安装默认仍为年月日时分，旧版命名配置自动转换为模板。日期/时间格式、时区、标题长度和序号补零均可选择。标签用逗号连接，缺失元数据留空，固定文字和分隔符按输入保留。修改仅影响之后新建的笔记，重名仍追加编号。

聊天窗口顶部的“记忆”栏提供“打开 / 新建 / 导出”；完整笔记名可悬停查看。回答区随窗口伸缩，上方文献和选区按内容排列，空间不足时可滚动；截图不会将“清除”挤到下方。原生终端调整字符行列，不缩放字体或 PDF 选区。

由插件新启动的 Windows / WSL Runtime 使用隐藏窗口；在设置中的“连接并检测”查看环境、监听端口、PID 和连接地址。已经打开的旧控制台不会被强制关闭；保存现有工作后退出 Zotero、关闭已确认属于 ZotAgent 的旧 Runtime 控制台，再重新打开 Zotero，可验证隐藏启动。插件不会修改 WSL 的代理设置。

自动归档仅涵盖结构化聊天；在原生终端新增的消息不自动归档。0.4.4 起，Claude Code 与 Codex 的“打开原生终端”默认打开包含插件历史的恢复列表，由用户选择对话。Codex 自动执行 `codex resume --all --include-non-interactive`；Claude 自动在此终端设置 `CLAUDE_CODE_ENTRYPOINT=sdk-cli` 后执行 `claude --resume`。打开前应等待回答结束，或点击停止并等任务退出。列表支持选择任意会话，Runtime 无法得知选择结果，因此终端打开期间阻止其他窗口向同一 Agent 提交结构化问题；关闭终端后解除。终端的“会话信息与恢复方法”显示 CLI、环境、目录和原结构化会话 ID（供核对，不代表列表已选中它）。


### 选择已有子笔记与归档样式（0.4.3）

前端“子笔记 N”显示当前绑定**主文献**下未删除的子笔记数量，旁边下拉框可选择之后对话保存到哪一篇。默认保持上次选择，同一主文献的所有窗口共享选择。切换前已提交的问题仍保存到原笔记，切换后的新问题才使用新目标。选择普通子笔记时仅追加归档记录，保留已有正文。新设备没有本地归档绑定时，会优先识别已有 ZotAgent 归档笔记；没有可识别归档则创建新笔记。

笔记新增、删除和重命名后列表自动刷新。新归档条目中的 Agent 标题、问题/回答标题、主文献和时间标签使用加粗、配色和底纹区分；正文保持正常样式。已有笔记正文不批量重新排版。Markdown 导出保留标题和文字层级，纯 Markdown 不保留字体颜色。

### Codex / Claude 原生恢复列表

ZotAgent 使用 `codex exec` 创建结构化会话。本机 Codex 0.156.1 及当前官方 CLI 文档说明，恢复列表默认过滤非交互会话；工作目录还会影响列表范围。插件按钮已自动应用以下参数，独立终端也可在相同 Windows/WSL 环境运行：

```bash
codex resume --all --include-non-interactive
```

该参数控制启动时的恢复列表，不承诺之后在 Codex 内再次执行 `/resume` 也保留相同筛选。需要重新选择时，可关闭并重新打开插件原生终端。结构化聊天仍使用原来的 `codex exec`，没有迁移到 App Server。

Claude Code 2.1.282 会在普通入口的恢复列表隐藏 `sdk-cli` 等来源，而插件的 `--print` 对话正属于这一类。可以在 WSL 运行：

```bash
cd /home/shzhao  # 本机示例；其他用户应改为会话实际工作目录
CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume
```

该环境变量只作用于本次 Claude 进程。列表默认按项目目录筛选，按 **Ctrl+A** 可显示所有项目。若已在某条会话中，Claude 的 `/resume` 会排除当前会话。

Windows PowerShell 中可临时设置并在退出后还原：

```powershell
$zotAgentPreviousEntrypoint = $env:CLAUDE_CODE_ENTRYPOINT
try {
    $env:CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
    claude --resume
} finally {
    $env:CLAUDE_CODE_ENTRYPOINT = $zotAgentPreviousEntrypoint
}
```

插件会自动设置子进程环境，包括 Windows Runtime 启动 WSL Agent 的情况；无需修改系统环境变量、CLI 安装或历史文件。这个 Claude 入口变量是针对本机 2.1.282 实现验证的兼容办法，不是官方承诺稳定的 `--include-non-interactive` 参数。升级 CLI 后若行为变化，可按 ID 直接恢复。名称为 `(session)`、约 14.7KB 的空初始化记录可能仍在列表中，它们本来就没有问题和回答；此改动让真正的 SDK 对话也进入列表，不会给空记录补写内容。

也可以按“会话信息”中的准确 ID 直接恢复，不依赖列表：

```bash
codex resume <会话ID>
claude --resume <会话ID>
```

先进入该会话的原工作目录。恢复不会重复提交 PDF 全文。如果旧 CLI 不支持 `--include-non-interactive`，优先按 ID 恢复，并通过 `codex resume --help` 确认当前版本支持的选项。

手动停止后再恢复，Codex 显示 `Conversation interrupted` 与此次停止一致，不表示 PDF 没有提交；输入记录存在也不代表模型已经完成阅读或回答。可以在恢复后的终端输入下一条问题继续。

参考：[OpenAI 官方 CLI reference — codex resume](https://developers.openai.com/codex/cli/reference/#codex-resume)。
