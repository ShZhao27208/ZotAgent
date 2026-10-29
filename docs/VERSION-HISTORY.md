# ZotAgent 版本与推送历史

> 本文件记录本地可见的 Git 历史（含推送前待发布提交），不代表 GitHub 每次 push 的事件日志。推送前 hook 自动更新本地历史；实际推送成功后在文末独立记录，可随下一批修改提交。

- 历史截至：2026-10-29T22:13:26+08:00
- 项目：`ShZhao27208/ZotAgent`
- 可见提交：72 个（按 Git 提交时间升序）
- 时间：ISO 8601，带时区

## 远端分支与标签

| 引用 | 提交 | 时间 | 说明 |
| --- | --- | --- | --- |
| `v0.3.10` | `06d43a68b2a6` | 2026-09-24T22:12:38+08:00 | fix(windows): preserve CMD wrapper arguments for agent execution v0.3.10 |
| `v0.3.3` | `848e20b78a43` | 2026-09-21T01:20:06+08:00 | chore: release v0.3.3 |
| `v0.3.4` | `5dc2fbc8d487` | 2026-09-21T01:35:57+08:00 | chore: release v0.3.4 |
| `v0.3.5` | `878cd563b291` | 2026-09-21T01:52:35+08:00 | chore: release v0.3.5 |
| `v0.3.6` | `52ba74fad437` | 2026-09-23T02:46:01+08:00 | docs: record v0.3.6 |
| `v0.3.7` | `9ecca53b9d3a` | 2026-09-24T16:43:22+08:00 | fix(windows): bundle runtime and bootstrap with installed Node v0.3.7 |
| `v0.3.8` | `8864a74bf9ad` | 2026-09-24T16:59:59+08:00 | fix(installer): extract local XPI without download URI credentials v0.3.8 |
| `v0.3.9` | `78a69b49d1db` | 2026-09-24T17:12:17+08:00 | fix(installer): use bootstrap version instead of jar manifest HTTP read v0.3.9 |
| `v0.4.0` | `9ab91882bf00` | 2026-09-26T00:40:42+08:00 | feat: snapshot conversation archive implementation v0.4.0 |
| `v0.4.2` | `0ac91bc45288` | 2026-09-26T02:22:51+08:00 | fix: runtime environments, archive templates and compact chat v0.4.2 |
| `v0.4.3` | `9804bfd25f06` | 2026-09-26T02:59:34+08:00 | feat: select archive notes and restore native agent sessions v0.4.3 |
| `v0.4.4` | `6983166c4c97` | 2026-09-26T03:53:01+08:00 | fix: show structured sessions in native resume pickers v0.4.4 |
| `v0.6.1` | `3d9fbeb2e862` | 2026-10-09T20:53:14+08:00 | chore: release v0.6.1 |
| `v0.6.2` | `bdbaed37ed47` | 2026-10-11T23:59:17+08:00 | chore: release v0.6.2 with compact framed archive layout |
| `v0.7.0` | `9443c7d349b3` | 2026-10-23T13:00:32+08:00 | ZotAgent 0.7.0 |
| `v0.7.2` | `d84075a1e6c2` | 2026-10-29T22:13:26+08:00 | chore: release v0.7.2 with answer actions and Apache 2.0 |

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
| `0.3.10` | 2026-09-24T22:12:38+08:00 | `06d43a6` | fix(windows): preserve CMD wrapper arguments for agent execution v0.3.10 |
| `0.3.6` | 2026-09-23T02:46:01+08:00 | `52ba74fad437` | CLI Shell 启动、默认模型信息和版本维护；安装启动仍依赖外部 Runtime。 |
| `0.3.7` | 2026-09-24T16:43:22+08:00 | `9ecca53` | XPI 内置 Runtime 与 Windows PTY，自动部署本机后端并复用已有 Node，无需 WSL。 |
| `0.3.8` | 2026-09-24T16:59:59+08:00 | `8864a74` | fix(installer): extract local XPI without download URI credentials v0.3.8 |
| `0.3.9` | 2026-09-24T17:12:17+08:00 | `78a69b4` | fix(installer): use bootstrap version instead of jar manifest HTTP read v0.3.9 |
| `0.4.0` | 2026-09-26T00:40:42+08:00 | `9ab9188` | feat: snapshot conversation archive implementation v0.4.0 |
| `0.4.2` | 2026-09-26T02:22:51+08:00 | `0ac91bc` | fix: runtime environments, archive templates and compact chat v0.4.2 |
| `0.4.3` | 2026-09-26T02:59:34+08:00 | `9804bfd` | feat: select archive notes and restore native agent sessions v0.4.3 |
| `0.4.4` | 2026-09-26T03:53:01+08:00 | `6983166` | fix: show structured sessions in native resume pickers v0.4.4 |
| `0.6.1` | 2026-10-09T20:53:14+08:00 | `3d9fbeb` | chore: release v0.6.1 |
| `0.6.2` | 2026-10-11T23:59:17+08:00 | `bdbaed3` | chore: release v0.6.2 with compact framed archive layout |
| `0.7.0` | 2026-10-23T13:00:32+08:00 | `9443c7d349b3` | ZotAgent 0.7.0 |
| `0.7.2` | 2026-10-29T22:13:26+08:00 | `d84075a` | chore: release v0.7.2 with answer actions and Apache 2.0 |

## 本地可见提交

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
| 55 | 2026-09-24T22:12:38+08:00 | `0.3.10` | `06d43a6` | fix(windows): preserve CMD wrapper arguments for agent execution v0.3.10 |
| 56 | 2026-09-26T00:40:42+08:00 | `0.4.0` | `9ab9188` | feat: snapshot conversation archive implementation v0.4.0 |
| 57 | 2026-09-26T02:22:51+08:00 | `0.4.2` | `0ac91bc` | fix: runtime environments, archive templates and compact chat v0.4.2 |
| 58 | 2026-09-26T02:59:34+08:00 | `0.4.3` | `9804bfd` | feat: select archive notes and restore native agent sessions v0.4.3 |
| 59 | 2026-09-26T03:53:01+08:00 | `0.4.4` | `6983166` | fix: show structured sessions in native resume pickers v0.4.4 |
| 60 | 2026-09-26T04:50:13+08:00 | `0.4.4` | `e4072da` | docs: rewrite README around research workflow and setup |
| 61 | 2026-10-08T11:30:57+08:00 | `0.5.0` | `2fbde93` | feat: improve agent compatibility, PDF tools and adaptive UI v0.5.0 |
| 62 | 2026-10-09T17:21:57+08:00 | `0.5.1` | `e790952` | fix: handle slow OpenCode preparation and verify Runtime builds v0.5.1 |
| 63 | 2026-10-09T18:43:02+08:00 | `0.5.1` | `8a9bdfc` | fix: prevent orphan terminals, repeated agent detection and slow model lookups |
| 64 | 2026-10-09T18:43:02+08:00 | `0.5.1` | `e704d31` | test: cover orphan terminals, detection reuse and persisted model list |
| 65 | 2026-10-09T18:43:45+08:00 | `0.6.0` | `def01d5` | chore: release v0.6.0 |
| 66 | 2026-10-09T20:51:24+08:00 | `0.6.0` | `9b91577` | feat: frame archived questions and answers in notes |
| 67 | 2026-10-09T20:51:24+08:00 | `0.6.0` | `2cd6223` | test: cover framed archive records and Markdown export |
| 68 | 2026-10-09T20:53:14+08:00 | `0.6.1` | `3d9fbeb` | chore: release v0.6.1 |
| 69 | 2026-10-11T23:59:17+08:00 | `0.6.2` | `bdbaed3` | chore: release v0.6.2 with compact framed archive layout |
| 70 | 2026-10-23T13:00:24+08:00 | `0.7.0` | `ec0e703` | feat: run Windows and WSL agents side by side and use ruled archive records |
| 71 | 2026-10-23T13:00:24+08:00 | `0.7.0` | `b16f52f` | test: cover per-system agent paths, cmd escaping and ruled archive records |
| 72 | 2026-10-29T22:13:26+08:00 | `0.7.2` | `d84075a` | chore: release v0.7.2 with answer actions and Apache 2.0 |

## 维护规则

1. 新提交或新远端引用出现后，运行 `npm run version-history`。
2. pre-push 更新本地历史，并检查版本及构建产物，不要求为历史再创建递归提交。
3. 成功推送并核对远端 HEAD 后，在实际推送记录区域追加 SHA、提交时间、推送时间、分支、验证和产物信息。
4. 推送后的本地记录可留到下一完整批次提交；生成器保留该区域原文。

<!-- ACTUAL-PUSH-LEDGER -->
## 实际推送记录

仅在推送成功并核对远端 HEAD 后追加；不从 Git 作者时间推算。

### 0.4.0 对话归档当前实现快照

- 提交：`9ab91882bf001f189617b9f1c56df0941e7e21b1`（`9ab9188`）。
- Git committer 时间：2026-09-26T00:40:42+08:00。
- 推送成功及远端核对后的记录时间：2026-09-26T00:43:40+08:00（Asia/Shanghai；未追溯精确网络完成时刻）。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；标签：`v0.4.0`；已通过 `git ls-remote` 核对二者均为上述完整 SHA。
- 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.4.0 。
- 主要改动：原生对话归档、全文不截断、前端取消、截图输入、命名与导出；详见 `RELEASE-0.4.0.md`。
- 验证：本次构建、语法与产物一致性检查通过；此前自动化结果 124 通过、1 跳过。按用户要求停止运行测试。原生 Zotero 归档记录数量实测失败未修复，Windows/WSL 路径与 OpenCode 问题待处理。
- 产物：`dist/zotagent-0.4.0.xpi`，14071421 字节。
- SHA-256：`1bf76c9f4a61719567e5db1795dc40dc99be73e47aadf3b1de3e872b580745aa`。
- 用户明确要求先推送当前快照再修复；本条为推送后的本地记录，留待下一批提交纳入。

### 0.4.2 运行环境、命名模板与聊天布局修复

- 提交：`0ac91bc4528816df863c974bb14a5eaae54d4b56`（`0ac91bc`）。
- Git committer 时间：2026-09-26T02:22:51+08:00。
- 推送成功、远端核对及安装包上传后的记录时间：2026-09-26T02:26:29+08:00（Asia/Shanghai；未追溯精确网络完成时刻）。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；标签：`v0.4.2`。使用一次 `git push --atomic` 推送，之后以 `git ls-remote` 核对分支与标签均为上述完整 SHA。
- 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.4.2 。
- 本批次合并先前 0.4.1 本地验收修复及新反馈，一次提交；详见 `RELEASE-0.4.2.md` 和 README。
- 验证：137 项，136 通过、1 项 Windows 专用测试跳过；构建、语法、XPI/Runtime 内容一致性和 diff 检查通过。未运行独立 Zotero/浏览器测试或付费模型调用；新版 UI 与 Windows 隐藏启动仍待本机验收。
- 产物：`dist/zotagent-0.4.2.xpi`，14078436 字节。
- SHA-256：`298cc056a03608e5f90dfc9c574a266119680f432ed02e23524fe27248a9de34`。
- 本条为推送完成后的本地记录，按约定留待下一完整批次提交，不为记录自身再追加推送。

### 0.4.3 已有子笔记选择、归档样式与原生会话恢复

- 提交：`9804bfd25f061c38fda77d14e8fd6f64a4c092cb`（`9804bfd`）。
- Git committer 时间：2026-09-26T02:59:34+08:00。
- 推送成功、远端核对及安装包上传后的记录时间：2026-09-26T03:01:50+08:00（Asia/Shanghai；未追溯精确网络完成时刻）。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；标签：`v0.4.3`。一次 `git push --atomic` 推送；`git ls-remote` 已核对分支和标签均为上述完整 SHA。
- 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.4.3 。
- 主要改动：已有子笔记计数/选择、跨窗口目标同步、新归档元数据配色、Claude 按 ID 恢复、Codex 恢复方法与会话信息、同一会话并发保护；详见 `RELEASE-0.4.3.md`。
- 验证：146 项，145 通过、1 项 Windows 专用测试跳过；构建及安装包一致性检查通过。集成测试仅运行临时模拟 CLI；未启动 Zotero/浏览器或调用模型。真实 GUI 与 Claude 原生内容显示仍待用户验收。
- 产物：`dist/zotagent-0.4.3.xpi`，14080921 字节。
- SHA-256：`a41c3e52a0cc9395c0b2024d7b55bea25176115d778757f5dc3ebe0253ce3f32`。
- 本条按约定仅在本地追加，留待下一完整批次提交，不为记录自身再次推送。

### 0.4.4 原生终端默认显示插件会话

- 提交：`6983166c4c9762dcb41d5491e5c05086dfc75f48`（`6983166`）。
- Git committer 时间：2026-09-26T03:53:01+08:00。
- 推送成功、远端核对及安装包上传后的记录时间：2026-09-26T03:55:48+08:00（Asia/Shanghai；未追溯精确网络完成时刻）。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；标签：`v0.4.4`。一次 `git push --atomic` 推送；`git ls-remote` 已核对分支和标签均为上述完整 SHA。
- 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.4.4 。
- 主要改动：Codex 默认打开包含非交互历史的恢复列表；Claude 原生终端以 SDK 入口显示之前插件对话；跨环境子进程变量传递、跨窗口占用保护、恢复信息和 README；详见 `RELEASE-0.4.4.md`。
- 验证：149 项，148 通过、1 项 Windows 专用测试跳过；构建和安装包一致性检查通过。真实 Claude 2.1.282 TUI 已在临时测试配置下验证列出 SDK 来源记录，选中后显示测试问题与回答。没有付费模型调用、浏览器下载或独立 Zotero 窗口；Windows Zotero 内嵌终端仍待本机验收。
- 产物：`dist/zotagent-0.4.4.xpi`，14081854 字节。
- SHA-256：`95b2aca4ad38640e04e950f49aa581655eac621ecf1d43e5ac3199f97234a3f5`。
- 本条按约定仅在推送完成后本地追加，留待下一完整批次提交，不为记录自身再次推送。

### README 重写（插件版本仍为 0.4.4）

- 提交：`e4072daec51e127f9e68f5d7603ed865f76cf533`（`e4072da`）。
- Git committer 时间：2026-09-26T04:50:13+08:00。
- 推送成功、远端核对后的记录时间：2026-09-26T05:08:06+08:00（Asia/Shanghai；未追溯精确网络完成时刻）。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；一次提交推送，`git ls-remote` 已核对远端 HEAD 为上述完整 SHA。
- 内容：README 按项目定位、优势、功能、使用方法重新组织；补全全文、多文献、多窗口、截图、笔记写回、共享自动归档和命名模板；整理 Windows/WSL 配置及恢复命令，修正旧版本说明。随提交纳入上批次 0.4.4 实际发布记录。
- 验证：本地文档链接、目录锚点、代码围栏、折叠区及 diff 格式检查通过；pre-push 安装包一致性校验通过。纯文档变更，未重新运行功能测试、构建或创建版本标签。
- 本条为推送后的本地记录，留待下一完整批次提交，不为记录自身再次推送。

### 0.5.0 — OpenCode 兼容、PDF 工具和界面适配

- 核对时间：2026-10-08T11:31:07+08:00。
- 提交：`2fbde93ec8b7fe3a608514b65f18ea662d6a3d16`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；已推送 origin，`git ls-remote` 核对远端 HEAD 一致。
- 本轮全部源码、测试、README 和版本说明合为一次提交；未创建 GitHub Release。
- 验证：161 项，160 通过，1 项 Windows 专用测试跳过；安装包一致性及 diff 检查通过。
- 安装包：`dist/zotagent-0.5.0.xpi`，14089845 字节，SHA-256 `fbc215133f7b372079976f014973d2f8d317a028eb7b9dd8e631f358109809ee`。
- 此条为推送成功后的本地记录，留待下一批修改纳入，不为记录自身再次提交。

### 0.5.1 — Windows Runtime 慢准备与升级一致性修复

- 核对时间：2026-10-09T17:22:06+08:00。
- 提交：`e7909528696a9e8791cf99e8c22c3f5e6d4ade01`。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；推送 origin 成功，已用 git ls-remote 核对远端 HEAD。
- 验证：172 项，171 通过，1 项 Windows CMD 专用测试跳过；构建、源码/安装包一致性和指纹检查通过。
- 覆盖超过 10 秒准备、失败事件、取消/断线无孤立 Agent、并发共享与停止、同版本部署与跨系统换行指纹。
- 本机 OpenCode 模型目录 207 项，首轮 3550 ms，缓存轮次小于 1 ms；未直接在故障 Windows 电脑复验。
- 安装包：`dist/zotagent-0.5.1.xpi`，14092843 字节；SHA-256 `8ff08832781ad1f2d2738c8cc7cdbb27631ada403ad1a77de8232e73c283b942`。
- 本次只提交推送，不创建 GitHub Release。预先存在的 README 删除与未跟踪文件未纳入提交。
- 本条为推送成功后的本地记录，留待下一批修改纳入，不为记录自身重复提交。

### 0.6.1 — 归档问题与回答加边框

- 核对时间：2026-10-09T20:54:00+08:00。
- 提交：`3d9fbeb2e862b2a8ab881013a9b23b9d3e82626e`（Git committer 时间 2026-10-09T20:53:14+08:00）；同批包含 `9b91577` 实现与 `2cd6223` 测试。
- 分支：`fix/auto-detect-runtime-and-cli-paths`；推送 origin 成功，已用 git ls-remote 核对远端 HEAD。
- 验证：179 项，178 通过，1 项 Windows CMD 专用测试跳过；构建、源码/安装包一致性和指纹检查通过。未在 Zotero 宿主中运行原生笔记编辑器验证。
- 安装包：`dist/zotagent-0.6.1.xpi`，14094314 字节；SHA-256 `ecf674a78601f6a3e12ab3dcdd2148ae40173794f1f04faf755228ff0ff28c8e`。
- 标签：`v0.6.1`（轻量标签，指向上述提交），已用 git ls-remote 核对。
- 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.6.1 ；上传后 GitHub 返回的 digest 与本地 SHA-256 一致。
- 预先存在的 README 删除与未跟踪文件未纳入提交。
- 本条为推送成功后的本地记录，留待下一批修改纳入，不为记录自身重复提交。

### 0.6.2 — 紧凑双层归档布局

- 推送、发布成功并核对后的记录时间：2026-10-12T00:00:32+08:00（Asia/Shanghai，非追溯的精确网络完成时刻）。
- 提交：`bdbaed37ed47a91c57547d9791a63f827cf0f858`；Git committer 时间：2026-10-11T23:59:17+08:00。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`；分支 `fix/auto-detect-runtime-and-cli-paths` 与标签 `v0.6.2` 已推送，git ls-remote 核对两者均指向上述提交。
- 内容：一次问答整体外框，内部记录标题、用户问题、Agent 回答、上下文与记录信息四框紧凑排列，不插入空白段落；回答标题降级，旧记录兼容，不调用模型、不额外消耗 token。
- 验证：181 项，180 通过，1 项 Windows 专用测试跳过；构建、安装包一致性、diff 格式检查通过。Zotero 原生编辑器保存重开显示效果尚未实测。
- 安装包：`dist/zotagent-0.6.2.xpi`，14094885 字节；SHA-256 `c1b1922cec7b4060bc8583687e483a76666068037e6c95f37875cf6517ba0d20`。GitHub 上传状态、大小及 digest 均已核对。
- GitHub 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.6.2。
- 预先存在的 README 段落删除与无关未跟踪文件未纳入提交。
- 本条为推送后的本地记录，留待下一完整批次提交，不为记录自身重复推送。

### 0.7.0 — Windows 与 WSL Agent 并行、分隔线归档

- 推送、发布成功并核对后的记录时间：2026-10-23T13:01:24+08:00（Asia/Shanghai，非追溯的精确网络完成时刻）。
- 提交：`ec0e703`（实现）、`b16f52f`（测试）、`db40f49`（补记 0.6.2 推送记录）；HEAD `db40f49e6bbad432af76f586c27afedf430e6914`，Git committer 时间：2026-10-23T13:00:32+08:00。
- 远端：`origin` / `git@github.com:ShZhao27208/ZotAgent.git`；分支 `fix/auto-detect-runtime-and-cli-paths` 与标签 `v0.7.0` 已推送，git ls-remote 核对两者均指向上述 HEAD。
- 内容：Windows 与 WSL 的 Agent 路径分别保存、同时检测并回填，各 Agent 可分别选择系统并同时使用；WSL 后端可经互操作启动 Windows Agent；检测连接列出两个系统的 Node.js；旧默认命令名不再阻止回填。归档记录去掉表格外框，记录间双分隔线、内部单分隔线。修复 cmd.exe 参数转义；Runtime 报告真实版本，协议 8；内部错误返回 500；数据目录统一；依赖版本固定，新增覆盖率脚本；旧发布与修复说明不再随仓库发布（本地保留）。
- 验证：183 项，182 通过，1 项 Windows 专用测试跳过；构建与安装包一致性检查通过。WSL 中实测双系统检测、从 WSL 后端启动 Windows OpenCode，cmd 转义在 Windows Node 下实测。Windows Zotero 界面交互与归档显示尚未实测。
- 安装包：`dist/zotagent-0.7.0.xpi`，14100875 字节；SHA-256 `4c07f0c25ef242b3f9e1e6e4538696d23b4190a635ae3150b4d05b2594b9a23e`。GitHub 上传大小及 digest 已核对。
- GitHub 预览版及安装包：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.7.0。
- 本条为推送后的本地记录，留待下一完整批次提交，不为记录自身重复推送。

### 0.7.2 — 正式发布：回答操作与 Apache 2.0

- 发布成功并核对后的记录时间：2026-10-29T22:15:30+08:00；Git committer 时间：2026-10-29T22:13:26+08:00。
- 提交：`d84075a1e6c288f09c63cc13f511762c9e42e082`；远端 `origin`，分支 `fix/auto-detect-runtime-and-cli-paths` 与标签 `v0.7.2` 已核对一致。
- GitHub 正式版：https://github.com/ShZhao27208/ZotAgent/releases/tag/v0.7.2；非草稿、非预览版，已核对为 Latest。
- 内容：恢复底部按钮并保留逐条回答右键菜单；子笔记保存对应问题与回答；补充新版双语 README，添加 Apache License 2.0。
- 清理：删除重复 README、Windows Zone.Identifier 及 runtime/src/.omc 嵌套工具缓存。保留并忽略本地测试数据库、依赖、构建产物和工作状态；新增环境文件、覆盖率和临时文件忽略规则。
- 构建修复：过滤源码目录的隐藏文件及临时文件，校验安装包无本地状态文件，校验项目与依赖许可证。
- 验证：190 项测试，189 通过，1 项 Windows 专用测试跳过；构建、安装包一致性、许可证、diff 检查通过。发布源码凭据模式扫描无匹配（非完整安全审计）。Zotero 实际 UI 尚未实测。
- 安装包：`dist/zotagent-0.7.2.xpi`，14110716 字节；SHA-256 `3e0400485ed8fdf16b6fb3b2f6131b54431abd25571ae8d304479be6ad088247`，GitHub 资产 digest 已核对。
- 本条为推送后本地记录，不为记录自身重复提交推送。
