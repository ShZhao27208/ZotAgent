# ZotAgent 版本与推送历史

> 本文件记录本地可见的 Git 历史（含推送前待发布提交），不代表 GitHub 每次 push 的事件日志。每次推送前运行 `npm run version-history`；本地 `.githooks/pre-push` 会在历史变化且文件未更新时阻止推送。

- 历史截至：2026-09-24T17:12:17+08:00
- 项目：`ShZhao27208/ZotAgent`
- 可见提交：54 个（按 Git 提交时间升序）
- 时间：ISO 8601，带时区

## 远端分支与标签

| 引用 | 提交 | 时间 | 说明 |
| --- | --- | --- | --- |
| `v0.3.3` | `848e20b78a43` | 2026-09-21T01:20:06+08:00 | chore: release v0.3.3 |
| `v0.3.4` | `5dc2fbc8d487` | 2026-09-21T01:35:57+08:00 | chore: release v0.3.4 |
| `v0.3.5` | `878cd563b291` | 2026-09-21T01:52:35+08:00 | chore: release v0.3.5 |
| `v0.3.6` | `52ba74fad437` | 2026-09-23T02:46:01+08:00 | docs: record v0.3.6 |
| `v0.3.7` | `9ecca53b9d3a` | 2026-09-24T16:43:22+08:00 | fix(windows): bundle runtime and bootstrap with installed Node v0.3.7 |
| `v0.3.8` | `8864a74bf9ad` | 2026-09-24T16:59:59+08:00 | fix(installer): extract local XPI without download URI credentials v0.3.8 |
| `v0.3.9` | `78a69b49d1db` | 2026-09-24T17:12:17+08:00 | fix(installer): use bootstrap version instead of jar manifest HTTP read v0.3.9 |

## 正式版本

| 版本 | 时间 | 提交 | 主要改动 |
| --- | --- | --- | --- |
| `0.1.1` | 2026-08-28 | `8f50b77` | 首个可构建骨架：Zotero 插件、Runtime Host、三种 Agent Adapter、鉴权 NDJSON、会话恢复、笔记写回和 XPI 构建。 |
| `0.2.0` | 2026-09-01 | `991ff62` | 增加 Zotero PDF 全文抽取，并在 Agent 请求前注入全文上下文。 |
| `0.2.1` | 2026-09-01 | `c6538f9` | 恢复 PDF 选中文本捕获。 |
| `0.2.2` | 2026-09-01 | `2ce2945` | 重做阅读器选区和滚动区域捕获。 |
| `0.2.3` | 2026-09-01 | `33ba935` | 移除 Claude 不支持的 `cwd` 参数。 |
| `0.2.4` | 2026-09-01 | `ec5d825` | 支持把回答插入 PDF 注释弹窗光标。 |
| `0.2.5` | 2026-09-01 | `368a0a2` | 支持显式配置 OpenCode 模型。 |
| `0.2.6` | 2026-09-01 | `a6e6a34` | 修复 Claude CLI 在 PTY 会话中的路径解析。 |
| `0.2.7` | 2026-09-01 | `28c7e0f` | 原生终端使用各 Agent 的真实名称。 |
| `0.2.8` | 2026-09-01 | `7fe3d09` | 请求失败时显示 Agent stderr。 |
| `0.2.9` | 2026-09-01 | `c4c7388` | 原生终端不再错误传递结构化会话参数；同时补充大批测试。 |
| `0.3.0` | 2026-09-01 | `6a550b5` | 版本跃迁；此前提交已加入可选 PDF 全文和多文献参考池。 |
| `0.3.1` | 2026-09-01 | `cb46b4e` | OpenCode 原生 TUI 接收项目路径。 |
| `0.3.2` | 2026-09-02 | `0647718` | 锁定主文献并加入参考文献导入；随后重写 README 和使用指南。 |
| `0.3.3` | 2026-09-21 | `848e20b` | 安装后 XPI 保留 Runtime 来源；自动发现 CLI、初始化 NVM、同步 Agent 路径和默认工作目录。 |
| `0.3.4` | 2026-09-21 | `5dc2fbc` | 增加连接超时、路径规范化、`wsl.exe --exec` 启动、主目录大小写修复和早退诊断。 |
| `0.3.5` | 2026-09-21 | `878cd56` | 恢复直接 `env → Node → Runtime` 启动；传递自定义端口；默认端口失败时经鉴权回退到 `24129`。 |
| `0.3.6` | 2026-09-23T02:46:01+08:00 | `52ba74fad437` | CLI Shell 启动、默认模型信息和版本维护；安装启动仍依赖外部 Runtime。 |
| `0.3.7` | 2026-09-24T16:43:22+08:00 | `9ecca53` | XPI 内置 Runtime 与 Windows PTY，自动部署本机后端并复用已有 Node，无需 WSL。 |
| `0.3.8` | 2026-09-24T16:59:59+08:00 | `8864a74` | fix(installer): extract local XPI without download URI credentials v0.3.8 |
| `0.3.9` | 2026-09-24T17:12:17+08:00 | `78a69b4` | fix(installer): use bootstrap version instead of jar manifest HTTP read v0.3.9 |

## 全部推送提交

下表保留代码提交的短编号、作者时间、当时的 package 版本和提交说明；Git 无法还原每次 push 的实际时间，纯历史文件维护提交不列入表中。版本号表示该提交中的 `package.json` 版本；没有单独发版的修复也会保留。

| # | 时间 | 版本 | 提交 | 主要改动点 |
| --- | --- | --- | --- | --- |
| 1 | 2026-08-28T21:00:21+08:00 | `0.1.1` | `8f50b77` | first commit |
| 2 | 2026-08-28T21:17:25+08:00 | `0.1.1` | `f5f8bb5` | fix terminal screenshot and annotation insertion |
| 3 | 2026-08-28T21:33:46+08:00 | `0.1.1` | `15b9cf8` | feat(terminal): add xterm rendering and migrate runtime path |
| 4 | 2026-08-28T22:10:05+08:00 | `0.1.1` | `dd3bfa2` | fix(startup): migrate runtime path after repository move |
| 5 | 2026-08-28T22:25:17+08:00 | `0.1.1` | `d45ecd6` | fix(capture): isolate PDF screenshot interaction |
| 6 | 2026-08-28T22:35:09+08:00 | `0.1.1` | `1fc7962` | fix(annotation): preserve selected target through screenshot |
| 7 | 2026-09-01T17:07:01+08:00 | `0.1.1` | `61665b9` | feat(capture): add scrollable long screenshots |
| 8 | 2026-09-01T17:31:01+08:00 | `0.2.0` | `991ff62` | feat(pdf): read text through Zotero before agent requests |
| 9 | 2026-09-01T17:36:01+08:00 | `0.2.0` | `b1d0346` | fix(isolation): keep terminal renderer private to addon |
| 10 | 2026-09-01T17:47:43+08:00 | `0.2.0` | `0fa4411` | fix(capture): restore addon after long screenshot |
| 11 | 2026-09-01T17:53:48+08:00 | `0.2.0` | `acb3ac8` | feat(capture): add screenshot action toolbar |
| 12 | 2026-09-01T18:08:58+08:00 | `0.2.0` | `d79eb00` | fix(runtime): restore agent terminals and addon update idempotency |
| 13 | 2026-09-01T18:12:39+08:00 | `0.2.0` | `2212145` | fix(capture): stabilize long crop and text selection |
| 14 | 2026-09-01T18:21:15+08:00 | `0.2.0` | `566e5ae` | fix(capture): restore scroll capture and PDF selection |
| 15 | 2026-09-01T18:33:07+08:00 | `0.2.1` | `c6538f9` | fix(pdf): restore selected text capture |
| 16 | 2026-09-01T18:49:04+08:00 | `0.2.2` | `2ce2945` | fix(reader): capture selections and scrolling regions |
| 17 | 2026-09-01T19:46:27+08:00 | `0.2.3` | `33ba935` | fix(claude): remove unsupported cwd option |
| 18 | 2026-09-01T20:11:51+08:00 | `0.2.4` | `ec5d825` | fix(annotation): insert answers into reader popup cursor |
| 19 | 2026-09-01T20:21:02+08:00 | `0.2.5` | `368a0a2` | feat(opencode): allow explicit model selection |
| 20 | 2026-09-01T20:36:39+08:00 | `0.2.6` | `a6e6a34` | fix(claude): resolve cli path for pty sessions |
| 21 | 2026-09-01T20:47:36+08:00 | `0.2.7` | `28c7e0f` | fix(terminal): use native agent terminal labels |
| 22 | 2026-09-01T20:56:17+08:00 | `0.2.8` | `7fe3d09` | fix(runtime): surface agent stderr on failed requests |
| 23 | 2026-09-01T20:59:14+08:00 | `0.2.9` | `c4c7388` | fix(terminal): start native clients without session flags |
| 24 | 2026-09-01T21:55:41+08:00 | `0.2.9` | `31084d3` | fix: resolve PTY terminal launch failures and _getReaderIframeWindow bug |
| 25 | 2026-09-01T21:55:52+08:00 | `0.2.9` | `f8f89d2` | test: add 41 tests covering classify, protocol, sessions and plugin utils |
| 26 | 2026-09-01T23:35:01+08:00 | `0.2.9` | `16e5e0a` | feat: optional PDF full-text toggle and multi-reference import |
| 27 | 2026-09-01T23:38:48+08:00 | `0.3.0` | `6a550b5` | chore: bump version to 0.3.0 |
| 28 | 2026-09-01T23:55:26+08:00 | `0.3.1` | `cb46b4e` | fix(opencode): pass project path to native tui |
| 29 | 2026-09-02T00:03:36+08:00 | `0.3.2` | `0647718` | fix(context): lock primary paper and import references |
| 30 | 2026-09-02T01:38:01+08:00 | `0.3.2` | `628e751` | docs: rewrite project README and usage guide |
| 31 | 2026-09-10T23:47:39+08:00 | `0.3.2` | `6244597` | fix(selection): prevent stale PDF text from overwriting native selections |
| 32 | 2026-09-20T22:35:01+08:00 | `0.3.2` | `f5042a2` | fix: remove hardcoded developer paths from defaults (#11) |
| 33 | 2026-09-20T22:35:42+08:00 | `0.3.2` | `da2ec27` | fix: resource lifecycle — PTY cleanup, atomic writes, temp files (#10) |
| 34 | 2026-09-20T22:35:59+08:00 | `0.3.2` | `de48f77` | fix: PTY subscribe replay data-only for live sessions (#3) |
| 35 | 2026-09-20T22:40:20+08:00 | `0.3.2` | `df3cbc6` | feat: pass images to CLI adapters with capability flags (#4) |
| 36 | 2026-09-20T22:40:30+08:00 | `0.3.2` | `0444321` | fix: hide approval UI when adapter lacks support (#6) |
| 37 | 2026-09-20T22:51:04+08:00 | `0.3.2` | `6b5b7ff` | fix: request lifecycle — reentrant guard, agent snapshot, stale answer (#9, #2, #1) |
| 38 | 2026-09-20T22:53:03+08:00 | `0.3.2` | `b17e3df` | fix: sendSeparate entry condition, batch cancel, and document context restore (#5, #8, #7) |
| 39 | 2026-09-20T22:53:22+08:00 | `0.3.2` | `3615fdd` | chore: remove outdated STATUS.md |
| 40 | 2026-09-21T00:50:40+08:00 | `0.3.2` | `76edfc6` | fix: auto-detect runtime script path and CLI executable locations |
| 41 | 2026-09-21T01:02:37+08:00 | `0.3.2` | `fc697ee` | fix: convert UNC paths to WSL and add NVM to runtime PATH |
| 42 | 2026-09-21T01:06:25+08:00 | `0.3.2` | `ff126f2` | fix: use bash -lc to launch runtime, resolving NVM PATH detection |
| 43 | 2026-09-21T01:19:51+08:00 | `0.3.2` | `240fa76` | fix(runtime): restore installed XPI startup and automatic agent discovery |
| 44 | 2026-09-21T01:20:06+08:00 | `0.3.3` | `848e20b` | chore: release v0.3.3 |
| 45 | 2026-09-21T01:35:44+08:00 | `0.3.3` | `0bfc7de` | fix(runtime): bound connection checks and launch WSL without shell re-expansion |
| 46 | 2026-09-21T01:35:57+08:00 | `0.3.4` | `5dc2fbc` | chore: release v0.3.4 |
| 47 | 2026-09-21T01:52:23+08:00 | `0.3.4` | `a4d3f1b` | fix(runtime): restore direct Node launch and recover unreachable default port |
| 48 | 2026-09-21T01:52:35+08:00 | `0.3.5` | `878cd56` | chore: release v0.3.5 |
| 49 | 2026-09-23T02:40:34+08:00 | `0.3.5` | `fb95985` | feat(runtime): inherit default shell and report agent model |
| 50 | 2026-09-23T02:45:25+08:00 | `0.3.6` | `3eef0c0` | chore: release v0.3.6 |
| 51 | 2026-09-23T02:48:44+08:00 | `0.3.6` | `158a652` | fix(docs): make version history stable across pushes |
| 52 | 2026-09-24T16:43:22+08:00 | `0.3.7` | `9ecca53` | fix(windows): bundle runtime and bootstrap with installed Node v0.3.7 |
| 53 | 2026-09-24T16:59:59+08:00 | `0.3.8` | `8864a74` | fix(installer): extract local XPI without download URI credentials v0.3.8 |
| 54 | 2026-09-24T17:12:17+08:00 | `0.3.9` | `78a69b4` | fix(installer): use bootstrap version instead of jar manifest HTTP read v0.3.9 |

## 维护规则

1. 新提交或新远端引用出现后，运行 `npm run version-history`。
2. 将本文件和生成脚本一起提交，再执行 `git push`。
3. 如果 pre-push 检查提示历史已变化，先提交更新后的本文件，再重新推送。
