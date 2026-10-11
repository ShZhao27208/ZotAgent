<div align="center">

# ZotAgent

**让文献阅读、Agent 工作与研究笔记，在 Zotero 中连成一体。**

将 **Codex · Claude Code · OpenCode** 接入 Zotero，随读随问、对照分析、沉淀记录。

[下载安装](https://github.com/ShZhao27208/ZotAgent/releases) · [功能一览](#功能一览) · [开始使用](#开始使用) · [版本说明](CHANGELOG.md)

当前版本 **0.6.2** · 开发预览版 · 主要面向 Windows / WSL

</div>

---

## 项目定位

ZotAgent 是面向学术阅读与研究工作的 **Zotero Agent 工作台**。

它将电脑上已安装的 Codex CLI、Claude Code 和 OpenCode 直接接入 Zotero：由 Zotero 提供文献管理、PDF 阅读、文本提取、批注和笔记能力，由 Agent 负责理解、分析与执行任务。你可以围绕一句话提问、讨论一幅图、比较多篇论文，再把有价值的结果写回文献。

项目的核心是：**结合 Zotero 与原生 Agent 的优势，在尽可能保留 Agent 能力的同时，让它们自然融入阅读过程。**

从正在读的内容出发，到可以继续使用的研究记录，整个过程都围绕文献展开。

## 项目优势

### 原生 Agent，直接进入阅读现场

连接你已经使用的三个 Agent，沿用各自的登录、模型配置和原生会话系统。工具、Skills、MCP 等能力由对应 CLI 的配置、调用模式和权限决定；需要原生命令或更完整的交互时，可以直接切换到内嵌终端。

### 文献上下文，随取随用

划选一句话，文字就出现在面板；需要整篇理解时，由 Zotero 的 PDFWorker 提取文本，直接附加到问题中。减少复制粘贴、导出文件和重复解析的步骤，让 Agent 更直接地获得阅读材料。实际提取质量、回答准确率与速度仍取决于 PDF、CLI 和模型。

### 多种视角，共用一个阅读工作区

同一文献可以打开多个对话框，分别选择不同 Agent、处理不同问题；也可以加入多篇参考文献，进行综合比较或逐篇分析。窗口可以移动、调整大小和最小化，便于对照原文阅读。

### 讨论留痕，结果回到文献

插件自动保存问题、回答、来源和时间，将多个窗口、多个 Agent 的记录汇集到主文献下。归档由插件直接完成，**不额外调用模型，也不消耗 Agent 的生成 token**。重要回答还可以单独收藏，形成“完整过程记录 + 重点研究笔记”的层次。

## 0.5.0 本轮更新

本轮根据实际使用反馈完成以下功能和修复，具体操作见下文：

- 修复分发安装中 OpenCode `Unrecognized flag: --dir in command run`：使用进程工作目录启动，移除冗余目录参数。三个 Agent 保留结构化输出、会话恢复和图片等必要参数。
- OpenCode 使用动态模型 ID 下拉菜单，支持跟随同一环境最近使用的模型；不再将显示名称作为模型 ID，也不自动退回过期默认模型。
- 设置页仅保留“检测 OpenCode / 检测 Codex / 检测 Claude Code”；空路径自动检测并回填，已填写路径按原值验证。模型刷新按钮位于模型菜单旁。
- 增加全文批量勾选与 PDF 文本逐篇 Markdown 导出；按用户反馈分组文献操作，并修复导出选择面板被原布局遮挡的问题。
- 增加 Runtime 安全启动、停止、重启与手动停止状态保护。
- 输入框改为 Enter 发送、Shift+Enter 换行，保护中文输入法确认操作。
- 增加内容尺寸适配，并修复自动布局与手动缩放相互触发造成的震荡，手动尺寸保持优先。

验证：161 项回归测试中 160 项通过，1 项 Windows 专用测试在 Linux/WSL 跳过；构建与安装包一致性检查通过。本机 OpenCode 使用 `opencode/space-bunny-free` 完成真实最小问答。Windows Zotero 的实际交互仍需按[版本说明](docs/RELEASE-0.5.1.md)复验。

## 功能一览

### 01 · 随读随问，始终知道在讨论哪篇文献

- **识别当前文献**：创建对话框时自动绑定当前 PDF 对应的主文献，在面板顶部显示标题。绑定后保持锁定，避免切换 Zotero 条目时误换讨论对象。
- **同步 PDF 选区**：在 PDF 中划选文字，所有开启“接收选区”的对话框都会收到这段内容，无需逐个粘贴。
- **发送快捷键**：Enter 发送，Shift+Enter 换行；中文输入法确认候选词时不发送。原生终端按 CLI 自身规则处理。
- **发送前自由编辑**：可以修改、补充或清空面板中的选区，也可以直接询问其他问题。修改面板文本不会改动 PDF 原文。
- **即时停止与保留回答**：点击停止时立即记录用户中断时间，阻止尚未开始的后续执行阶段，并向运行中的任务发出取消请求；已经收到的回答会保留。实际进程退出取决于 CLI 的响应。

### 02 · 从一句话，到整篇论文与多文献分析

| 能力 | 使用方式 |
| --- | --- |
| 可选全文上下文 | 自行勾选“附加主文献全文”，由 Zotero 在本地提取 PDF 文本后交给 Agent。 |
| 全文不主动截断 | 三个 Agent 使用相同规则，提交全部提取文本，并显示提取量与提交状态。 |
| 主文献与参考文献池 | 保持主文献明确，将 Zotero 中选中的其他文献导入当前对话。 |
| 全选全文 / 取消全选 | 一次切换当前主文献和已导入参考文献的全文勾选状态，不立即发送。 |
| 导出 PDF 文本 | 选择文献和输出文件夹，每篇分别保存 Markdown；含元数据与原始提取文本，不调用 Agent。同名自动编号，单篇失败不影响其他篇。 |
| 每篇独立控制全文 | 可以只发送需要的文献全文，其余文献保留元数据。 |
| 综合分析 | 将多篇文献放入同一次提问，用于方法对比、结论归纳与关联分析。 |
| 分别处理 | 对主文献及参考文献逐篇执行同一个问题。 |

文献操作区分为三行：第一行“导入选中文献 / 导出 PDF 文本”，第二行控制主文献全文及“全选全文 / 取消全选”，第三行选择综合分析或分别处理。全选范围是当前对话的主文献和已导入参考文献，不会自动发送。

**导出步骤**：点击“导出 PDF 文本” → 在独立面板中选择文献 → 点击底部“选择文件夹并导出” → 选择保存位置。文献列表单独滚动，底部按钮保持可见，避免被聊天区遮挡。主文献优先使用已绑定的阅读 PDF，参考文献优先 Zotero 首选 PDF；找不到 PDF 或提取不到文本时单独提示，不生成空文件。导出只保存元数据和原始提取文本，不进行 OCR 或 AI 整理。

全文成功提交给 CLI 后，会显示类似提示：

> 已附加 PDF 提取文本：共提取 95320 字符，本次提交全部 95320 字符。
>
> 提交内容仍受请求体大小、Agent CLI 和模型上下文限制。

“全部提交”指插件把提取文本交给 CLI，不代表模型一定接纳或处理了全部内容。当前 Runtime 请求体上限为 **4 MiB**，包含问题、全文与图片编码；超限时明确报错，不静默截断。扫描版 PDF 或复杂版式可能无法提取出完整、准确的文本，可结合截图提问。

### 03 · 截图与浮动工作区，贴合阅读操作

- **区域截图**：框选 PDF 中的图表、公式或局部内容，预览后随问题发送给支持视觉输入的模型。
- **长截图**：滚动收集连续区域，适合超出单屏的图表和段落；完成后确认发送。
- **可移动窗口**：在文献上拖动对话框、调整大小、缩放或最小化，保留对原文的阅读与操作空间。
- **内容自适应**：导入多篇文献、展开面板或窗口尺寸变化时适度扩展对话框，标题自动换行，尺寸限制在当前窗口内；内容过多时滚动，不缩小字体。
- **手动尺寸优先**：拖拽调整大小时暂停自动适配，松手后保留手动尺寸，后续内容通过内部滚动展示。自动模式按需扩展，避免反复收缩；最小化时不自动展开。
- **多窗口并行**：同一文献可以开启多个对话框，各自提问、选择 Agent、调整选区，适合分工处理总结、解释、核查和比较。

图片是否能够被理解，取决于当前 Agent CLI 和所选模型的视觉能力。

### 04 · 三个 Agent，自由切换与原生会话管理

| 能力 | 说明 |
| --- | --- |
| 同一界面切换 Agent | 每个对话框可选择 OpenCode、Codex 或 Claude Code，无需同时安装全部三个。 |
| 独立会话 | 各窗口按 Agent 保存原生会话 ID；切换 Agent 不会自动混入另一个 Agent 的历史。 |
| 历史管理 | 查看插件会话索引、恢复对应会话和文献绑定、删除不需要的索引记录。删除索引不等于删除 CLI 原生历史。 |
| 原生终端 | 在面板内使用 Agent 的交互界面、命令和工具。Codex / Claude 默认先打开包含插件历史的恢复列表。 |
| 环境配置 | 在 Zotero 设置中配置 CLI 路径、运行环境、默认 Agent 和工作目录，支持 Windows 与 WSL 的相应组合。 |

**Agent 原生会话与 Zotero 归档笔记是两套用途不同的记录。** 前者用于 Agent 接续工作，后者用于研究过程留存。共用一篇归档笔记不会让三个 Agent 自动共享上下文，也不会自动把笔记内容再次发送给模型。

原生终端中的新增消息不自动归档。Codex / Claude 的恢复列表允许选择任意会话，打开期间会阻止其他窗口向同一 Agent 提交结构化请求；关闭该终端后即可继续。

### 05 · 从完整对话，到可整理、可导出的研究笔记

#### 自动归档：把讨论过程保存在主文献下

归档使用 **Zotero 原生子笔记**，可直接编辑，随 Zotero 的笔记与附件同步设置同步到其他设备；需要文件时再导出 Markdown。

- **同一主文献共用目标**：三个 Agent、多个对话框的结构化聊天都保存到当前选中的同一篇归档笔记，逐条标注回答来自哪个 Agent。
- **检测并选择已有笔记**：前端显示主文献下的子笔记数量，可从下拉列表选择保存目标，默认沿用上次目标。没有可用归档目标时自动创建；选择普通子笔记时保留已有正文并追加记录。
- **完成或中断后一次写入**：保存已收到的完整可见回答；用户中断时保存已收到的部分。没有具体回答时注明尚无可见回答，不归档思考过程。
- **来源与时间清晰可辨**：Agent、文献和时间等信息使用标题、加粗、颜色和底纹区分，便于回看与检索。
- **排序可配置**：在设置中选择按提问时间或回答结束时间排列，适应多个 Agent 同时工作的情况。
- **截图随记录保存**：本次提问的截图嵌入原生笔记，Markdown 导出时一并导出图片文件。
- **保存异常可重试**：归档失败时显示状态并提供重试入口；没有绑定主文献也可普通聊天，但会明确提示“本次不会自动归档”。

每条记录包括：

| 信息 | 归档内容 |
| --- | --- |
| 问题 | 用户提出的问题、确认后的选区及其来源。 |
| 回答 | Agent 已输出的可见回答，不包含思考过程。 |
| Agent 与状态 | 回答来自哪个 Agent，以及完成、中断或失败等状态。 |
| 时间 | 提问时间、回答完成时间；中断时记录用户中断时间。 |
| 文献 | 绑定的主文献、附加的参考文献及相关元数据。 |
| 全文附件 | 是否附加全文、提取字符数和提交状态；不重复保存整篇 PDF 文本。 |
| 图片 | 本次提问附带的截图。 |

#### 分篇与命名：按自己的研究习惯组织记录

点击记忆栏的 **“新建”**，即可在主文献下开始一篇新归档笔记。同一主文献的其他窗口会同步目标：**点击前已经提交的问题，结束后仍写入旧笔记；点击后提交的问题写入新笔记。** 手动切换已有子笔记也遵循相同规则。

笔记名称默认使用具体的 **年、月、日、时、分**。也可以自由输入命名模板，并通过“插入字段”下拉菜单组合文献与时间字段：

```text
{title}_ {tags}_ {author}_ {date}
研究笔记_{YYYY}-{MM}-{DD}_{HH}{mm}_{sequence}
{date}{time}
```

| 类别 | 可插入字段 |
| --- | --- |
| 文献 | `{title}` 标题、`{shortTitle}` 短标题、`{tags}` 标签、`{author}` 第一作者、`{authors}` 全部作者 |
| 标识 | `{year}` 发表年份、`{doi}` DOI、`{key}` 条目 key |
| 创建时间 | `{date}` 日期、`{time}` 时间、`{weekday}` 星期 |
| 时间分量 | `{YYYY}` 年、`{MM}` 月、`{DD}` 日、`{HH}` 时、`{mm}` 分、`{ss}` 秒 |
| 序号 | `{sequence}` 笔记序号 |

还可下拉选择日期格式、时间格式、时区、标题长度与序号补零。命名设置仅影响之后新建的笔记，重名自动追加编号。

#### 精选回答：写入你正在整理的位置

除了完整对话归档，还可以单独处理有价值的回答：

| 操作 | 结果 |
| --- | --- |
| 复制 Markdown | 复制回答的 Markdown 内容，便于粘贴到其他工具。 |
| 保存子笔记 | 将回答转换为 Zotero 笔记格式，单独保存在主文献下。 |
| 插入光标 | 将回答写入当前可编辑笔记，或 PDF 批注编辑位置。 |
| 自动保存 / 自动插入 | 在设置中启用后，成功回答结束时执行对应操作。 |
| 导出归档 | 将当前归档笔记导出为 Markdown，保留文字结构并导出内嵌图片；纯 Markdown 不保留字体配色。 |

单独保存回答可以与自动归档同时使用：完整记录便于追溯，精选笔记便于整理。

## 开始使用

### 1. 准备环境

| 组件 | 要求 |
| --- | --- |
| Zotero | Zotero 7 及以上；当前 Manifest 声明范围为 `6.999–10.*`，不代表所有版本组合均已实测。 |
| Node.js | **24 或更高版本**，用于运行本地 Runtime。 |
| Agent CLI | 至少安装 Codex CLI、Claude Code、OpenCode 中的一个，并在对应终端完成登录和模型配置。 |
| Windows / WSL | Windows 可直接使用本机后端；选择 WSL Agent 或 WSL 后端时需安装对应发行版。 |

先在准备使用的 Windows 或 WSL 终端中确认已安装的 CLI 能启动：

```bash
node --version
codex --version
claude --version
opencode --version
```

只需检查已安装的 Agent。版本检测通过表示程序可启动，模型可用性还取决于原生 CLI 的登录与配置。

### 2. 安装插件

1. 从 [Releases](https://github.com/ShZhao27208/ZotAgent/releases) 下载所需版本的 `zotagent-<版本>.xpi`。0.6.2 安装包可从当前源码运行 `npm run build` 生成，输出为 `dist/zotagent-0.6.2.xpi`；GitHub Release 附件以 Releases 页面实际内容为准。
2. 在 Zotero 中打开 **工具 → 插件**，通过菜单选择 **从文件安装插件**。
3. 选择 XPI，安装后重启 Zotero。
4. 进入 **Zotero → 设置 → ZotAgent**，点击 **连接并检测**。

Windows 安装包包含 Runtime 源码及 Windows x64 / ARM64 终端依赖，不包含 Node.js。插件会将后端部署到 Zotero 数据目录的 `zotagent/runtime/<版本>/`，并尝试自动查找本机 Node.js。

### 3. 选择运行环境

先选择后端启动位置，再配置各 Agent 的运行环境与路径。

| 你的使用方式 | 建议配置 |
| --- | --- |
| Windows 上安装 Agent | 后端保持“自动”，Agent 选择“Windows”或跟随后端，优先自动检测路径。 |
| Windows Zotero + WSL Agent | 后端保持“自动”，将对应 Agent 选择为“WSL (Linux)”，填写发行版及必要的 Linux CLI 路径。 |
| 整个后端运行在 WSL | 后端选择“WSL（手动高级配置）”，在 WSL 准备 Runtime 依赖，填写脚本、Node 和工作目录。 |

默认工作目录决定 Agent 在哪个文件夹工作，可选择研究项目目录。Windows 路径与 WSL 路径不能混填；WSL Runtime 目前不支持反向启动 Windows Agent，应使用 Windows 后端完成混合配置。

<details>
<summary><strong>Windows：查找 CLI 路径与安装 Claude Code</strong></summary>

在 PowerShell 查询实际命令位置：

```powershell
Get-Command node,codex,claude,opencode -All -ErrorAction SilentlyContinue |
  Select-Object Name,CommandType,Source,Path
where.exe claude
```

若 Windows 尚未安装 Claude Code，可选择官方原生安装方式：

```powershell
irm https://claude.ai/install.ps1 | iex
```

重新打开 PowerShell，确认实际路径：

```powershell
Test-Path "$env:USERPROFILE\.local\bin\claude.exe"
& "$env:USERPROFILE\.local\bin\claude.exe" --version
```

也可选择 npm 安装方式：

```powershell
npm install -g @anthropic-ai/claude-code
$claudeCmd = Join-Path (npm prefix -g).Trim() 'claude.cmd'
$claudeCmd
Test-Path $claudeCmd
& $claudeCmd --version
```

两种安装方式选择其一，向 ZotAgent 填写查询到且确实存在的绝对路径。首次运行 `claude` 完成登录，再重启 Zotero、连接并检测。WSL 中安装了 Claude，不代表 Windows 已经安装。

本项目开发机的 Windows 原生安装路径示例为 `C:\Users\ShZhao27208\.local\bin\claude.exe`，仅在安装后确认文件存在时使用，其他电脑不要直接照抄。

</details>

<details>
<summary><strong>WSL：Runtime、Node.js 与工作目录怎么填写</strong></summary>

在 PowerShell 查看发行版并进入 WSL：

```powershell
wsl --list --verbose
wsl -d Ubuntu
```

在 WSL 的 ZotAgent 源码目录安装依赖并查询路径：

```bash
npm ci
realpath runtime/src/index.js
command -v node
node --version
printf '%s\n' "$HOME"
command -v codex
command -v claude
command -v opencode
```

本项目开发机于 2026-09-26 核对的配置示例：

| 设置项 | 示例值 |
| --- | --- |
| 后端启动位置 | WSL（手动高级配置） |
| WSL 发行版 | `Ubuntu` |
| Runtime 脚本 | `/home/shzhao/AGitRep/SelfRep/ZotAgent/runtime/src/index.js` |
| Runtime Node.js | `/home/shzhao/.nvm/versions/node/v24.18.0/bin/node` |
| 默认工作目录 | `/home/shzhao` |
| WSL Claude Code | `/home/shzhao/.nvm/versions/node/v24.18.0/bin/claude` |

请以本机查询结果为准。脚本填文件、Node 填可执行文件、工作目录填已存在的文件夹；使用 `/home/...` 路径，不填资源管理器的 `\\wsl.localhost\Ubuntu\...`，字段值不加引号。NVM 升级后需重新核对 Node 与 CLI 路径。

Windows XPI 附带的终端二进制不能替代 WSL 的 Linux 依赖。只有切换整个 Runtime 到 WSL 时，才需要准备上述后端脚本和依赖；Windows 后端调用 WSL Agent 不要求另起 WSL Runtime。

</details>

### 4. 完成第一次文献对话

1. 在 Zotero 打开一篇 PDF，通过阅读器工具栏、**工具 → 新建 ZotAgent 对话框** 或默认快捷键 **Ctrl+Shift+Y** 打开面板。
2. 检查顶部主文献标题，选择 Agent，并确认归档目标子笔记。
3. 在 PDF 划选一段文字；需要时编辑面板中的选区，输入问题并发送。
4. 需要全文分析时勾选 **附加 PDF 全文**；需要讨论图表时先截图并确认预览。
5. 回答完成后查看自动归档；重要内容可再选择 **保存子笔记** 或 **插入光标**。

自动插入需要先打开可编辑的笔记或批注，并将光标放到目标位置。自动保存、自动插入和快捷键均可在 ZotAgent 设置中调整。

### 5. 多文献、多窗口与归档设置

| 想完成的任务 | 操作 |
| --- | --- |
| 对比多篇论文 | 回到 Zotero 文献库多选条目 → 面板点击“导入选中文献” → 按需勾选各篇全文 → 选择“综合分析”。 |
| 对每篇执行相同问题 | 导入参考文献后选择“分别处理”。 |
| 同时做不同任务 | 再开一个对话框，选择 Agent 并独立提问；按需开启或关闭接收选区。 |
| 延续已有记录 | 在子笔记下拉框选择目标，之后的新问题会追加到该笔记。 |
| 开始新阶段 | 点击记忆栏“新建”；已提交的问题仍归档到原笔记。 |
| 自定义名称与顺序 | 设置 → ZotAgent → 对话历史归档，编辑命名模板、下拉插入字段，选择排序方式。 |
| 导出与分享 | 点击记忆栏“导出”，生成 Markdown 及图片文件。 |

### 6. 打开原生终端与恢复历史

点击 **打开原生终端**。Codex 和 Claude Code 默认显示恢复列表，选择之前的对话即可查看历史并继续；OpenCode 打开其原生交互界面。可展开 **会话信息与恢复方法** 查看实际 CLI、环境、工作目录及原结构化会话 ID。

插件已自动执行以下恢复方式，无需每次手动输入：

| Agent | 启动方式 |
| --- | --- |
| Codex | `codex resume --all --include-non-interactive`，显示包含非交互会话的跨目录列表。 |
| Claude Code | `CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume`，为该终端启用 SDK 会话显示；列表内按 **Ctrl+A** 可查看所有项目。 |

<details>
<summary><strong>独立终端恢复与当前兼容边界</strong></summary>

在与插件一致的 WSL 环境和工作目录运行上表命令。Windows PowerShell 的 Claude 恢复方式如下，退出后还原原变量：

```powershell
$zotAgentPreviousEntrypoint = $env:CLAUDE_CODE_ENTRYPOINT
try {
    $env:CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
    claude --resume
} finally {
    $env:CLAUDE_CODE_ENTRYPOINT = $zotAgentPreviousEntrypoint
}
```

也可以直接指定会话 ID：

```bash
codex resume <会话ID>
claude --resume <会话ID>
```

Codex 结构化聊天使用 `exec`，其会话可能被普通恢复列表过滤。上述参数控制启动时的列表，不保证之后在 CLI 内再次输入 `/resume` 也保留同样筛选；重新选择时可关闭并重开插件原生终端。旧版 CLI 若不支持该参数，可更新 CLI 或按 ID 恢复。参见 [OpenAI 官方 CLI reference](https://developers.openai.com/codex/cli/reference/#codex-resume)。

Claude 的入口变量已在本机 **2.1.282** 验证，是兼容方法，并非官方承诺稳定的列表参数。Claude 会排除当前已打开的会话；名称为 `(session)`、约 14.7KB 的部分旧记录只有初始化内容，本来就没有问答。该方法让真正的 SDK 对话可见，不会为空记录补写历史。

手动停止后，Codex 恢复时可能显示 `Conversation interrupted`；这与中断一致，不能据此判断 PDF 未提交。原生恢复不会由插件重新注入全文，后续模型调用如何计费由对应服务决定。

</details>

### 7. 常见问题

<details>
<summary><strong>Runtime 连不上，或者更新后仍像旧版本</strong></summary>

Windows 下先确认 Node.js 24+ 已安装，重新启动 Zotero 后点击“启动 Runtime”；自动发现失败时填写实际 `node.exe` 路径。WSL 手动模式还需确认发行版、脚本路径和依赖。

Runtime 默认监听本机 `127.0.0.1:24119`，使用自动生成的 Token 鉴权。默认端口启动失败时可尝试备用端口，只有鉴权成功后才保存新 Endpoint；自定义 Endpoint 不会自动改写。

设置页提供启动、停止、重启按钮，显示端口与 PID。有任务时停止前确认；手动停止后本次 Zotero 会话不自动拉起。只停止通过 Token 和实例 ID 校验的 ZotAgent 服务，不按端口杀未知进程。协议 5 等旧版服务没有停止接口，需从原启动终端退出一次。

内置 Runtime 按“插件版本＋源码构建指纹”隔离部署；即使安装相同版本但 Runtime 源码不同，也不会复用旧部署目录。连接检测同时核对协议与指纹，不只检查端口是否能访问。旧服务可认证且空闲时安全停止并替换；有任务则提示先停止。自定义外置 Runtime 需更新到与安装包匹配的源码。

更新后若仍使用旧行为，退出 Zotero，停止对应端口上的旧 Runtime，安装新 XPI 后重启。手动启动的外置 Runtime 也需更新脚本并重启；0.6.2 要求 Runtime 协议 7，并核对源码构建指纹。不要在反馈中公开 Token。

</details>

<details>
<summary><strong>Agent 检测失败，或 OpenCode 默认模型报错</strong></summary>

先在所选环境直接执行对应 CLI 的 `--version`，确认路径有效。Windows 与 WSL 是不同安装环境，不能仅凭另一边能运行就认为当前配置可用。

0.5.1 修复了 Windows 上模型准备超过 10 秒时误报“Runtime 未启动”的问题：连接建立后立即显示准备状态，慢查询不会阻塞响应头；失败返回带请求标识的错误和完成事件。准备期间可以停止或关闭连接，后端不会在断线后继续启动 Agent。

模型目录在同一运行环境内缓存并保存到数据目录，Runtime 重启后直接复用；超过 5 分钟先使用旧列表并在后台刷新，所选模型不在列表中时立即重新查询。并发窗口共享查询；菜单旁“刷新”会重新拉取。最近使用的模型记录仍每次读取，显式选定模型时跳过最近记录查询。每条查询最多等待 45 秒，超时会报告具体命令；不会自动换模型重试。

OpenCode 模型改为下拉选择真实 ID。打开设置、检测连接、打开菜单和切换环境时读取当前安装的模型列表；模型菜单旁的“刷新”按钮同时更新 CLI 模型缓存。刷新失败保留原选择，已下架的模型明确标记。

默认选项“跟随 OpenCode 最近使用的模型”在每次请求前读取同一 Windows / WSL 环境的最近记录，并显式传入真实 ID。它不代表某个未提交选择的终端当前状态；没有记录、读取失败或模型不在列表中时，请从下拉菜单选择，不自动退回旧默认模型。

例如 Bunny Space Free 的真实 ID 是 `opencode/space-bunny-free`。模型在列表中不保证远端服务、登录和额度正常；这些问题仍可能导致服务端报错。

测试不会改写手动 CLI 路径，路径无效会报错。三个“检测”按钮统一按填写的路径验证；路径为空时自动查找并填入检测结果。

</details>

<details>
<summary><strong>笔记、会话和全文分别存在哪里</strong></summary>

- 文献、归档子笔记与内嵌图片由 Zotero 管理，同步遵循 Zotero 设置。
- Agent 原生会话由各 CLI 管理，Zotero 笔记同步不会同步这些 CLI 会话。
- Runtime 会话索引默认位于用户目录的 `.local/share/zotero-full-agent/sessions.json`；截图传输临时文件位于同目录下的 `tmp/`。
- PDF 文本在本地提取；提交给 Agent 后是否发送至远端、使用何种模型服务，取决于 CLI 配置。本地 Runtime 不代表模型推理完全离线。
- 自动归档仅记录全文附件状态与字符数量，不把整篇 PDF 再复制进笔记；截图可嵌入归档。

</details>

### 8. 从源码构建

```bash
git clone https://github.com/ShZhao27208/ZotAgent.git
cd ZotAgent
npm ci
npm test
npm run build
npm run verify
```

构建产物为 `dist/zotagent-<版本>.xpi`。在实际运行 Runtime 的环境安装依赖；Windows 与 Linux 的终端依赖不能互换。

| 目录 | 内容 |
| --- | --- |
| `plugin/` | Zotero 界面、设置、文献上下文与笔记归档。 |
| `runtime/` | 本地 Runtime、Agent 调用适配与终端管理。 |
| `test/` | 自动化与回归测试。 |
| `scripts/` | 构建、校验与版本历史维护。 |
| `docs/` | 设计、版本说明与验证记录。 |

[当前版本说明](CHANGELOG.md) · [版本与推送历史](docs/VERSION-HISTORY.md) · [问题反馈](https://github.com/ShZhao27208/ZotAgent/issues)

项目目前未附带开源许可证，代码使用与分发权限以仓库后续明确提供的许可证为准。
