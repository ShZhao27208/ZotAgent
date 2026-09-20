# 2026-09-21 Runtime 启动回归调查

基准：大修前 `6244597`；调查开始时 HEAD 为 `ff126f2`。

| 提交（北京时间） | 改动 | 对故障的影响 |
| --- | --- | --- |
| `f5042a2`（09-20 22:35） | 删除开发者绝对路径，Runtime 脚本和工作目录设为空，Node 与 CLI 改为命令名 | 没有同时提供安装后路径发现，依赖原默认值的用户失去可用配置；这是直接回归来源 |
| `76edfc6`（09-21 00:50） | 从插件 rootURI 推算源码目录；增加 CLI 路径回填 | 调查开始时倒数第三个提交。源码布局下有用，但安装 XPI 的 `jar:file:...!/` 无法推出源码位置；回填仍依赖消息发送流程 |
| `fc697ee`（09-21 01:02） | 转换 UNC 路径，在 PATH 中加入 NVM 通配符 | UNC 转换有效；PATH 中的 `*/bin` 不会被命令查找展开 |
| `ff126f2`（09-21 01:06） | 改用 `bash -lc` | 非交互登录 shell 不保证加载 NVM；没有修复 XPI 路径来源，参数也未进行 shell 引用 |

## 修复

构建时写入本机 Runtime / Node 位置，bootstrap 加载后用于缺省启动；显式加载 NVM，正确引用 shell 参数。连接成功后进行 CLI 发现和设置回填；Runtime health 返回默认工作目录，插件仅在该设置为空时采用它。保留用户指定的绝对路径。

本机源码构建的 XPI 不是独立 Runtime 分发包：源码目录及依赖必须保留，跨机器或移动目录需要重新配置路径。未回滚今晚其他功能修复。

## 验证边界

回归测试模拟 Zotero 安装包 URI 和进程调用，并验证 Runtime health、CLI 发现及并发启动。本机 Codex / Claude Code / OpenCode 的版本检测成功。尚未在 Windows Zotero UI 内完成端到端安装验证。

## 0.3.3 安装后的现场复查

确认 Windows Zotero 实际安装的是 0.3.3。保存的 Runtime / Node 设置为 `home\shzhao\...`，缺少开头的 `/`；工作目录为不存在的 `/home/ShZhao`。Windows 对没有监听进程的端口请求会超时，而原先 health fetch 没有设置截止时间，因此可能一直停在启动前的探测阶段。

使用 Windows ProcessStartInfo 调用插件产生的 WSL 启动参数后，进一步复现 `exec: : not found`。`wsl.exe -- bash -lc` 经过默认 shell，提前展开了传给 Bash 的变量。改为 `wsl.exe --exec bash -lc` 后，在独立端口完成了实际 Windows → WSL → Runtime 的鉴权 health 检查，以及 OpenCode 1.18.31、Codex 0.154.0、Claude Code 2.1.278 的可用性检测；测试进程已关闭。

0.3.4 增加有超时的 Zotero HTTP 请求、已保存路径规范化、直接 WSL exec、进程提前退出诊断，以及经 Runtime 确认不存在后才应用的主目录大小写修复。尚未直接操作 Zotero UI 安装新版。
