<div align="center">
<img src="docs/logo.gif" width="160" height="160" alt="瞾 — Shuo Zhao" style="border-radius:50%;"/>

# ZotAgent

**Zotero Agent Workbench**

*Bring Codex, Claude Code and OpenCode into Zotero: ask while you read, compare papers, and keep every discussion as a research note*

[![Version](https://img.shields.io/badge/version-0.7.2-2563eb.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-release-15803d.svg)](https://github.com/ShZhao27208/ZotAgent/releases)
[![Zotero](https://img.shields.io/badge/Zotero-7%2B-b91c1c.svg)](https://www.zotero.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Agents](https://img.shields.io/badge/agents-Codex%20%7C%20Claude%20Code%20%7C%20OpenCode-7c3aed.svg)](#-supported-agents)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL-0ea5e9.svg)](#%EF%B8%8F-configuration)
[![Archive](https://img.shields.io/badge/archive-native%20Zotero%20notes-0f766e.svg)](#-what-it-does)
[![Stars](https://img.shields.io/github/stars/ShZhao27208/ZotAgent?style=social)](https://github.com/ShZhao27208/ZotAgent)

[📦 Download](https://github.com/ShZhao27208/ZotAgent/releases) · [🚀 Install](#-installation) · [📝 Changelog](CHANGELOG.md) · [📖 中文说明](#中文说明)

</div>

---

## English

**ZotAgent** is a Zotero plugin that connects the agent CLIs already installed on your computer (**Codex CLI, Claude Code and OpenCode**) to the Zotero reader. Zotero supplies the library, PDF reader, text extraction and notes; the agent understands, analyzes and carries out the task. Each agent keeps its own login, model configuration and native sessions.

> Select a sentence, ask a question, and the answer is archived under the paper. Archiving is done by the plugin: no extra model call, no extra tokens.

### ✨ What It Does

| Feature | Description |
|:--------|:------------|
| Reader-aware chat | Each panel binds to the parent item of the open PDF and stays locked to it. Selected PDF text flows into every panel that receives selections. |
| Full text on demand | Zotero's PDFWorker extracts text locally. The whole extracted text is submitted, never truncated, within the 4 MiB request limit. |
| Multi-paper analysis | Import the items selected in your library as references, then synthesize them in one prompt or run the same question on each paper. |
| PDF text export | Save the extracted text of chosen papers as one Markdown file each, with metadata. No agent call. |
| Screenshots | Region and long (scrolling) screenshots of figures and formulas, sent to vision-capable models. |
| Floating panels | Several movable, resizable panels on the same paper, each with its own agent and question. |
| Native terminal | Open the agent's own TUI inside the panel; Codex and Claude Code start in a resume list that includes plugin sessions. |
| Windows + WSL | Each agent runs on Windows or WSL, side by side. Paths are stored per system and the working directory is converted automatically. |
| Auto archive | Question, answer, sources and times are saved to a native Zotero child note, records separated by rules, sortable, exportable to Markdown with images. |
| Pick answers | Use the bottom buttons for the latest answer, or right-click a specific answer to copy Markdown, insert at the cursor, or save a child note. Saved notes include the corresponding question and answer in separate labeled frames. |

### 🤖 Supported Agents

| Agent | Check it runs | Native terminal opens with |
|:------|:--------------|:---------------------------|
| Codex CLI | `codex --version` | `codex resume --all --include-non-interactive` |
| Claude Code | `claude --version` | `CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume` |
| OpenCode | `opencode --version` | OpenCode's interactive UI; models are picked from a dropdown of real model IDs |

You only need one of them. A passing version check means the program starts; model availability still depends on the CLI's own login and configuration.

### 🚀 Installation

**Prerequisites**

- **Zotero 7+**: the manifest declares `6.999–10.*`; not every version combination has been tested
- **Node.js 24+**: runs the local Runtime that launches the agents
- **At least one agent CLI**, logged in and configured in the terminal where it will run

#### Method 1: Release XPI (Recommended)

1. Download `zotagent-<version>.xpi` from [Releases](https://github.com/ShZhao27208/ZotAgent/releases).
2. In Zotero, open **Tools → Plugins** and choose **Install Plugin From File**.
3. Select the XPI and restart Zotero.
4. Open **Zotero → Settings → ZotAgent** and click **Connect and detect**.

The XPI bundles the Runtime source and the Windows x64 / ARM64 terminal binaries, but not Node.js. The plugin deploys the Runtime to `zotagent/runtime/<version>/` in the Zotero data directory and looks for Node.js automatically.

#### Method 2: Build from Source

```bash
git clone https://github.com/ShZhao27208/ZotAgent.git
cd ZotAgent
npm ci
npm test
npm run build      # outputs dist/zotagent-<version>.xpi
npm run verify     # checks the XPI matches the sources
```

Install dependencies in the environment that will run the Runtime: Windows and Linux terminal binaries are not interchangeable.

### ⚙️ Configuration

Choose where the Runtime starts, then which system each agent runs on:

| Your setup | Recommended settings |
|:-----------|:---------------------|
| Agents installed on Windows | Runtime "Auto"; agent "Auto" or "Windows"; leave paths empty to auto-detect. |
| Windows Zotero + WSL agents | Runtime "Auto"; set the agent to "WSL (Linux)" or "Auto" and confirm the distribution. |
| Agents on both systems | Pick Windows or WSL per agent; both can run at the same time in different panels. |
| Whole Runtime inside WSL | Runtime "WSL (manual)"; install Runtime dependencies in WSL. Node may be left empty and is resolved from the WSL login shell (NVM included). |

- Each agent has a **Windows path** and a **WSL path**. Empty fields are detected and filled after connecting; filled paths are never overwritten.
- In WSL fields use `/home/...` paths, not `\\wsl.localhost\Ubuntu\...`, and no quotes.
- The Runtime listens on `127.0.0.1:24119` and authenticates with an auto-generated token. Do not post the token in issues.
- Naming templates, sort order, auto save / auto insert and shortcuts live under **Settings → ZotAgent**.

### 💬 Usage

1. Open a PDF in Zotero, then open a panel from the reader toolbar, **Tools → New ZotAgent Dialog**, or **Ctrl+Shift+Y**.
2. Check the paper title at the top, choose an agent, and confirm the archive note.
3. Select text in the PDF, edit it in the panel if needed, type a question and press **Enter** (Shift+Enter for a new line).
4. Tick **Attach PDF full text** for whole-paper questions; take a screenshot for figures.
5. After the answer, check the archive note, or right-click the answer to save or insert it.

| Task | How |
|:-----|:----|
| Compare papers | Multi-select items in the library → **Import selected** → tick full text per paper → **Synthesize**. |
| Same question on each paper | Import references, then choose **Process separately**. |
| Parallel tasks | Open another panel with a different agent; toggle selection receiving per panel. |
| Start a new note | Click **New** in the archive bar. Questions already submitted still go to the old note. |
| Export | Click **Export** in the archive bar to write Markdown plus image files. |

### 📁 Repository Structure

```
ZotAgent/
├── plugin/
│   ├── bootstrap.js            # Zotero plugin lifecycle
│   ├── manifest.json
│   ├── locale/
│   └── content/
│       ├── zot-agent.js        # Panels, reader context, Runtime client, notes
│       ├── archive-format.js   # Archive record rendering, naming, sorting
│       ├── conversation-archive.js  # Archive targets and serialized note writes
│       ├── archive-export.js   # Note → Markdown + images
│       ├── runtime-installer.js     # Runtime deployment and Node discovery
│       └── preferences.*       # Settings pane
├── runtime/src/
│   ├── index.js                # Local HTTP / WebSocket Runtime
│   ├── adapters/               # Codex, Claude Code, OpenCode adapters
│   ├── agent-launch.js         # Windows / WSL launch and path conversion
│   ├── pty-manager.js          # Native terminals (node-pty)
│   └── opencode-models.js      # OpenCode model list cache
├── scripts/                    # build, verify, version history, smoke tests
├── test/                       # node:test regression suite
└── CHANGELOG.md
```

### 🤝 Contributing

Issues and pull requests are welcome. Most useful right now:
- Test reports from real Windows Zotero setups (agent detection, archive display)
- Problems you hit while using it, posted to [issues](https://github.com/ShZhao27208/ZotAgent/issues)

---

## 中文说明

**ZotAgent** 是面向学术阅读与研究工作的 **Zotero Agent 工作台**。它把电脑上已安装的 **Codex CLI、Claude Code 和 OpenCode** 接入 Zotero：Zotero 提供文献管理、PDF 阅读、文本提取和笔记，Agent 负责理解、分析与执行任务。三个 Agent 沿用各自的登录、模型配置和原生会话。

> 划选一句话、提出问题，回答自动归档到这篇文献下。归档由插件完成，不额外调用模型，也不消耗 Agent 的 token。

### ✨ 功能概览

| 功能 | 说明 |
|:-----|:-----|
| 随读随问 | 对话框自动绑定当前 PDF 的主文献并保持锁定；PDF 选区同步到所有开启“接收选区”的对话框，发送前可自由编辑。 |
| 按需附加全文 | 由 Zotero PDFWorker 在本地提取文本，提交全部提取内容、不主动截断，并显示提取量与提交状态。请求体上限 4 MiB，超限明确报错。 |
| 多文献分析 | 导入文献库中选中的条目作为参考文献，可综合分析，也可对每篇分别执行同一问题；每篇单独控制是否附加全文。 |
| 导出 PDF 文本 | 选择文献和文件夹，每篇保存为一个含元数据的 Markdown 文件，不调用 Agent。 |
| 区域与长截图 | 框选图表、公式或滚动收集连续区域，预览确认后发给支持视觉输入的模型。 |
| 浮动多窗口 | 同一文献可开多个对话框，可移动、缩放、最小化，各自选择 Agent 和问题；内容自适应，手动尺寸优先。 |
| 原生终端 | 在面板内使用 Agent 自己的交互界面；Codex / Claude Code 默认打开包含插件历史的恢复列表。 |
| Windows + WSL 并行 | 每个 Agent 可分别运行在 Windows 或 WSL，两边路径分开保存，工作目录自动转换。 |
| 自动归档 | 问题、回答、来源和时间写入 Zotero 原生子笔记，记录之间用分隔线隔开，可排序、可导出 Markdown 和图片。 |
| 精选回答 | 底部按钮操作最新回答；右键某条回答可针对该条复制 Markdown、插入光标或保存子笔记。保存时同时包含对应问题与回答，以标题和边框区分；也可启用自动保存 / 自动插入。 |

### 🤖 支持的 Agent

| Agent | 确认能启动 | 原生终端启动方式 |
|:------|:-----------|:-----------------|
| Codex CLI | `codex --version` | `codex resume --all --include-non-interactive` |
| Claude Code | `claude --version` | `CLAUDE_CODE_ENTRYPOINT=sdk-cli claude --resume`，列表内按 **Ctrl+A** 查看所有项目 |
| OpenCode | `opencode --version` | OpenCode 原生界面；模型从真实模型 ID 下拉菜单选择 |

只需安装其中一个。版本检测通过表示程序能启动，模型是否可用仍取决于 CLI 自身的登录与配置。

**Agent 原生会话与 Zotero 归档笔记是两套记录。** 前者用于 Agent 接续工作，后者用于研究过程留存。共用一篇归档笔记不会让三个 Agent 共享上下文，也不会把笔记内容再次发送给模型。原生终端中的新消息不自动归档。

### 🚀 安装方法

**安装前提**

- **Zotero 7 及以上**：Manifest 声明范围为 `6.999–10.*`，不代表所有版本组合均已实测
- **Node.js 24 及以上**：用于运行启动 Agent 的本地 Runtime
- **至少一个 Agent CLI**：并在准备使用的终端中完成登录和模型配置

#### 方式 1：下载安装包（推荐）

1. 从 [Releases](https://github.com/ShZhao27208/ZotAgent/releases) 下载 `zotagent-<版本>.xpi`。
2. 在 Zotero 中打开 **工具 → 插件**，选择 **从文件安装插件**。
3. 选择 XPI，安装后重启 Zotero。
4. 进入 **Zotero → 设置 → ZotAgent**，点击 **连接并检测**。

安装包包含 Runtime 源码及 Windows x64 / ARM64 终端依赖，不包含 Node.js。插件会把 Runtime 部署到 Zotero 数据目录的 `zotagent/runtime/<版本>/`，并自动查找本机 Node.js。

#### 方式 2：从源码构建

```bash
git clone https://github.com/ShZhao27208/ZotAgent.git
cd ZotAgent
npm ci
npm test
npm run build      # 输出 dist/zotagent-<版本>.xpi
npm run verify     # 校验安装包与源码一致
```

在实际运行 Runtime 的环境安装依赖；Windows 与 Linux 的终端依赖不能互换。

### ⚙️ 配置说明

先选择 Runtime 启动位置，再分别配置各 Agent 的运行环境：

| 你的使用方式 | 建议配置 |
|:-------------|:---------|
| Windows 上安装 Agent | 后端“自动”，Agent 选“自动”或“Windows”，路径留空自动检测。 |
| Windows Zotero + WSL Agent | 后端“自动”，Agent 选“WSL (Linux)”或“自动”，确认发行版。 |
| 两个系统都装了 Agent | 每个 Agent 分别选择 Windows 或 WSL，可在不同窗口同时使用；切换不会清空另一边的路径。 |
| 整个后端运行在 WSL | 后端选“WSL（手动高级配置）”，在 WSL 准备 Runtime 依赖；Node 可留空，由 WSL 登录环境（含 NVM）查找。 |

- 每个 Agent 有“Windows 路径”和“WSL 路径”两个字段，留空时连接后自动检测并回填，已填写的路径不会被覆盖。“自动”优先使用后端所在系统，未安装时改用另一系统。
- 默认工作目录决定 Agent 在哪个文件夹工作；跨系统运行时自动在 `C:\…` 与 `/mnt/c/…` 之间转换。
- WSL 字段填 `/home/...` 路径，不填 `\\wsl.localhost\Ubuntu\...`，字段值不加引号。
- Runtime 默认监听 `127.0.0.1:24119`，使用自动生成的 Token 鉴权。不要在反馈中公开 Token。

<details>
<summary><strong>Windows：查找 CLI 路径与安装 Claude Code</strong></summary>

在 PowerShell 查询实际命令位置：

```powershell
Get-Command node,codex,claude,opencode -All -ErrorAction SilentlyContinue |
  Select-Object Name,CommandType,Source,Path
where.exe claude
```

若 Windows 尚未安装 Claude Code，可选官方原生安装或 npm 安装，二选一：

```powershell
# 原生安装
irm https://claude.ai/install.ps1 | iex
& "$env:USERPROFILE\.local\bin\claude.exe" --version

# npm 安装
npm install -g @anthropic-ai/claude-code
& (Join-Path (npm prefix -g).Trim() 'claude.cmd') --version
```

向 ZotAgent 填写查询到且确实存在的绝对路径。首次运行 `claude` 完成登录，再重启 Zotero、连接并检测。WSL 中安装了 Claude，不代表 Windows 已经安装。

</details>

<details>
<summary><strong>WSL：Runtime、Node.js 与工作目录怎么填写</strong></summary>

```powershell
wsl --list --verbose
wsl -d Ubuntu
```

在 WSL 的 ZotAgent 源码目录安装依赖并查询路径：

```bash
npm ci
realpath runtime/src/index.js
command -v node && node --version
command -v codex claude opencode
```

脚本填文件、Node 填可执行文件、工作目录填已存在的文件夹。NVM 升级后需重新核对 Node 与 CLI 路径。只有把整个 Runtime 切到 WSL 时才需要准备上述依赖；Windows 后端调用 WSL Agent 不需要另起 WSL Runtime。

</details>

### 💬 使用示例

1. 在 Zotero 打开一篇 PDF，通过阅读器工具栏、**工具 → 新建 ZotAgent 对话框** 或快捷键 **Ctrl+Shift+Y** 打开面板。
2. 检查顶部主文献标题，选择 Agent，并确认归档目标子笔记。
3. 在 PDF 划选文字，需要时在面板中编辑选区，输入问题后按 **Enter** 发送（Shift+Enter 换行，中文输入法确认候选词时不发送）。
4. 需要全文分析时勾选 **附加 PDF 全文**；讨论图表时先截图并确认预览。
5. 回答完成后查看自动归档；右键点击重要回答，选择 **保存子笔记** 或 **插入光标**。

| 想完成的任务 | 操作 |
|:-------------|:-----|
| 对比多篇论文 | 在文献库多选条目 → 面板点击“导入选中文献” → 按需勾选各篇全文 → 选择“综合分析”。 |
| 对每篇执行相同问题 | 导入参考文献后选择“分别处理”。 |
| 同时做不同任务 | 再开一个对话框，选择 Agent 并独立提问；按需开关接收选区。 |
| 延续已有记录 | 在子笔记下拉框选择目标，之后的新问题追加到该笔记。 |
| 开始新阶段 | 点击记忆栏“新建”；点击前已提交的问题仍归档到原笔记。 |
| 导出与分享 | 点击记忆栏“导出”，生成 Markdown 及图片文件。 |
| 停止回答 | 点击停止立即记录中断时间并保留已收到的回答；进程实际退出取决于 CLI。 |

### 🗂️ 归档笔记与命名

归档使用 **Zotero 原生子笔记**，可直接编辑，随 Zotero 同步设置同步到其他设备。

- 同一主文献下三个 Agent、多个对话框的结构化聊天写入当前选中的同一篇笔记，逐条标注 Agent、状态、提问与完成时间、文献来源、全文提交状态和截图；不归档思考过程，不复制整篇 PDF 文本。
- 可从下拉列表选择已有子笔记作为保存目标；选择普通子笔记时保留原有正文并追加记录。
- 排序可按提问时间或回答结束时间；保存失败时显示状态并提供重试。

笔记名称默认使用年、月、日、时、分，也可在设置中编辑命名模板，例如 `{title}_ {author}_ {date}` 或 `研究笔记_{YYYY}-{MM}-{DD}_{sequence}`：

| 类别 | 可插入字段 |
|:-----|:-----------|
| 文献 | `{title}` `{shortTitle}` `{tags}` `{author}` `{authors}` |
| 标识 | `{year}` `{doi}` `{key}` |
| 创建时间 | `{date}` `{time}` `{weekday}` `{YYYY}` `{MM}` `{DD}` `{HH}` `{mm}` `{ss}` |
| 序号 | `{sequence}` |

### ❓ 常见问题

<details>
<summary><strong>Runtime 连不上，或者更新后仍像旧版本</strong></summary>

先确认 Node.js 24+ 已安装，重启 Zotero 后在设置页点击“启动 Runtime”；自动发现失败时填写实际 `node.exe` 路径。设置页提供启动、停止、重启按钮，并显示端口与 PID；只会停止通过 Token 和实例 ID 校验的 ZotAgent 服务。

内置 Runtime 按“插件版本＋源码构建指纹”隔离部署，连接检测同时核对协议与指纹。更新后若仍是旧行为，退出 Zotero，停止旧 Runtime，安装新 XPI 后重启。0.7.2 要求 Runtime 协议 8；手动启动的外置 Runtime 也需更新脚本并重启。

</details>

<details>
<summary><strong>Agent 检测失败，或 OpenCode 模型报错</strong></summary>

先在所选环境直接运行对应 CLI 的 `--version`。Windows 与 WSL 是不同的安装环境，不能因为另一边能运行就认为当前配置可用。

OpenCode 模型从下拉菜单选择真实 ID（例如 `opencode/space-bunny-free`），列表缓存在数据目录，过期时先用旧列表并在后台刷新，菜单旁“刷新”重新拉取。“跟随最近使用的模型”在每次请求前读取同一环境的最近记录；读取不到时请手动选择，不会自动退回旧默认模型。

</details>

<details>
<summary><strong>笔记、会话和全文分别存在哪里</strong></summary>

- 文献、归档子笔记与内嵌图片由 Zotero 管理，同步遵循 Zotero 设置。
- Agent 原生会话由各 CLI 管理，Zotero 同步不会同步这些会话。
- Runtime 会话索引位于用户目录的 `.local/share/zotero-full-agent/sessions.json`，截图临时文件在同目录 `tmp/`。
- PDF 文本在本地提取；提交给 Agent 后是否发往远端取决于 CLI 配置，本地 Runtime 不代表模型推理离线。

</details>

### 📁 项目结构

```
ZotAgent/
├── plugin/
│   ├── bootstrap.js            # Zotero 插件生命周期
│   ├── manifest.json
│   ├── locale/
│   └── content/
│       ├── zot-agent.js        # 对话框、阅读器上下文、Runtime 客户端、笔记写回
│       ├── archive-format.js   # 归档记录渲染、命名、排序
│       ├── conversation-archive.js  # 归档目标与串行写入
│       ├── archive-export.js   # 笔记导出 Markdown 和图片
│       ├── runtime-installer.js     # Runtime 部署与 Node 查找
│       └── preferences.*       # 设置页
├── runtime/src/
│   ├── index.js                # 本地 HTTP / WebSocket Runtime
│   ├── adapters/               # Codex、Claude Code、OpenCode 适配
│   ├── agent-launch.js         # Windows / WSL 启动与路径转换
│   ├── pty-manager.js          # 原生终端（node-pty）
│   └── opencode-models.js      # OpenCode 模型列表缓存
├── scripts/                    # 构建、校验、版本历史、冒烟测试
├── test/                       # node:test 回归测试
└── CHANGELOG.md
```

### 🤝 贡献指南

欢迎提交 issue 和 PR。目前最需要：
- 在真实 Windows Zotero 环境中的测试反馈（Agent 检测、归档显示）
- 使用中遇到的问题，请发到 [issues](https://github.com/ShZhao27208/ZotAgent/issues)

[版本说明](CHANGELOG.md) · [版本与推送历史](docs/VERSION-HISTORY.md)

---

## 📄 License

Licensed under the [Apache License 2.0](LICENSE). Third-party dependencies retain their own licenses.

本项目采用 [Apache License 2.0](LICENSE) 开源协议。第三方依赖仍适用各自的许可证。


### Automatic plugin updates / 插件自动更新

ZotAgent checks the [update feed](https://raw.githubusercontent.com/ShZhao27208/ZotAgent/main/update.json) through Zotero's plugin updater. Enable automatic add-on updates in Zotero. Only published stable releases with an uploaded XPI enter this feed; GitHub must be reachable. Installing 0.7.2 already configures the feed URL, so no reinstall is needed to enable future updates.

在 Zotero 中开启插件自动更新后，可通过更新清单检测后续正式版；需要能够访问 GitHub。0.7.2 已配置更新地址，无需重新安装来启用未来更新。同版本不会重复升级，预览版不会推送到正式更新渠道。

发布维护：先创建正式 GitHub Release 并上传 XPI，再由 `Publish Zotero update feed` 工作流更新 `main/update.json`。若创建 Release 时附件尚未上传完，上传完成后手动运行该工作流并填写版本标签；也可运行 `npm run update-manifest -- vX.Y.Z` 后提交清单。生成器确认正式版 XPI 已上传，从版本标签读取兼容信息；不下载安装包、不计算哈希值。
