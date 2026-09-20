# ZotAgent

> 将 Codex、Claude Code 与 OpenCode 直接接入 Zotero，在阅读文献的同时使用完整的本地 Agent 能力。

ZotAgent 是一个面向学术阅读与研究工作的 Zotero 插件。它不是在 Zotero 中重新实现一套聊天机器人，而是把已经安装在电脑上的 **Codex CLI、Claude Code 和 OpenCode** 连接到 Zotero 阅读环境中：Zotero 负责文献、PDF、选区、批注和笔记，Agent 继续使用各自原生的模型、配置、工具、Skills、MCP 与会话系统。

项目同时面向 **Windows 与 WSL** 环境。Agent 可按实际安装位置配置为 Windows 或 WSL 命令，Runtime Host 负责鉴权、进程管理、流式输出和原生终端通信。

当前版本：**0.3.4**

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
   每个对话框都可以在 OpenCode、Codex 和 Claude Code 之间切换。Agent 可执行文件、运行平台、默认工作目录和 OpenCode 模型在 `Zotero 设置 -> ZotAgent` 中统一配置。

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

本机源码构建的 XPI 会记录构建时的 Runtime 脚本和 Node.js 位置，安装后无需手填当前项目路径。请保留源码目录及其 `node_modules`；XPI 本身不包含 Node.js 或 Runtime 依赖。复制到另一台电脑或移动源码后，需要在设置中更新 Runtime 脚本路径与 Node.js 路径。

更新时建议退出旧的原生终端并重启 Zotero。如果安装新版本后行为仍与旧版一致，请确认旧 Runtime 没有继续占用 `24119` 端口。

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

| 设置 | 说明 | 默认值示例 |
| --- | --- | --- |
| Endpoint | Zotero 连接 Runtime 的本地地址 | `http://127.0.0.1:24119` |
| Token | 本地 Bearer Token；留空时插件自动生成 | 自动生成 |
| Runtime 脚本 | `runtime/src/index.js` 的 WSL 绝对路径 | `/home/user/.../ZotAgent/runtime/src/index.js` |
| WSL Node.js | WSL 中 Node.js 可执行文件 | `/home/user/.nvm/.../bin/node` |
| WSL 发行版 | `wsl.exe -d` 使用的发行版名称 | `Ubuntu` |
| 默认工作目录 | Agent 启动和工具执行目录 | `/home/user` |

保持“启动 Zotero 时自动启动并连接 Runtime”开启，插件会生成 Token 并通过 `wsl.exe` 启动 Runtime。启动时通过 `wsl.exe --exec` 直接调用 Bash 并加载 NVM 环境，连接成功后自动检测 Codex、Claude Code 和 OpenCode，并将可用 CLI 的绝对路径回填到设置。检测范围包括 PATH、当前 Node.js 目录、`~/.local/bin` 和 NVM 安装目录；手动填写的绝对路径会保留。默认工作目录为空时，会从 Runtime 读取其默认目录。也可以点击“立即启动”和“检测连接”检查状态。

需要手动启动时：

```bash
cd /path/to/ZotAgent
ZOTAGENT_TOKEN='与插件设置一致的-token' npm run runtime
```

### Agent 命令

为每个 Agent 配置：

- 可执行文件的绝对路径；
- 平台：`WSL (Linux)` 或 `Windows`；
- 默认 Agent；
- 可选的 OpenCode 模型，格式为 `provider/model`。留空时使用 OpenCode 自己的默认模型。

示例：

```text
OpenCode:    /home/user/.nvm/versions/node/v24.x/bin/opencode
Codex CLI:   /home/user/.nvm/versions/node/v24.x/bin/codex
Claude Code: /home/user/.nvm/versions/node/v24.x/bin/claude
```

Windows CLI 路径应填写 Runtime 能访问的路径，例如 `/mnt/c/Users/<用户名>/.../claude.exe`，并把平台设置为 Windows。配置后分别点击三个“测试”按钮确认可用性。

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

在 Agent 下拉框中选择目标 Agent，然后点击“打开原生终端”。终端使用当前窗口的工作目录。Claude Code 首次进入陌生目录时可能要求确认信任；OpenCode 和其他 Agent 的模型或安全确认由其原生界面管理。

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

连接检查使用明确的超时，不会无限停留在“正在连接”。设置中粘贴的 `home\用户\...` 路径会转换为 `/home/用户/...`；Linux 路径区分大小写。Runtime 确认主目录不存在且仅大小写不匹配时，插件会采用真实主目录。

确认 Endpoint、Token、WSL 发行版、Node.js 路径和 Runtime 脚本路径正确。若提示 Token 不匹配，通常是旧 Runtime 仍占用端口；停止旧进程后重新启动。

### Agent 显示不可用

在 WSL 或 Windows 终端直接运行对应的 `--version`，确认 CLI 已安装、路径正确且完成登录，然后在 ZotAgent 设置中重新检测。

### OpenCode 模型服务失败

在设置中填写明确的 `provider/model`，使用 OpenCode `models` 命令列出的有效模型。ZotAgent 只负责调用本地 OpenCode；模型供应商、额度和网络错误仍由 OpenCode/provider 返回。

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
