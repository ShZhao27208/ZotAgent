# 0.4.2 — 运行环境、命名模板与聊天布局修复

本批次包含 0.4.0 之后的环境修复和本机验收反馈。0.4.1 仅作为本地测试包交付，本次统一提交为 0.4.2。

## 改动

- 修复 Windows / WSL Agent 平台选择、路径检测与回填；按后端保存配置；防止复用错误环境或旧协议 Runtime。
- OpenCode 多行上下文通过 stdin 完整传递。显式模型必须使用 `provider/model` ID；留空时不添加 `--model`。保留供应商嵌套错误的具体消息与模型 ID。
- 命名预设界面改为自由模板与字段插入下拉菜单，支持 `{title}`、`{tags}`、`{author}`、`{date}`、`{time}` 等 18 种字段；保留日期时间格式、时区、标题长度、序号补零和即时预览。旧命名组合迁移为模板，已有笔记不改名。
- Windows Node 与 WSL Runtime 由插件隐藏启动；设置页显示运行环境、监听端口、PID 和地址。旧控制台不强制关闭，WSL 代理设置不改写。
- 记忆笔记栏改为紧凑单行，提供打开、新建、导出和按需出现的重试；删除“模型：Agent 默认模型”整行。回答区随窗口伸缩，文献/选区按内容排列并在不足时滚动，截图与清除按钮分开；终端调整字符行列。
- 兼容 Zotero 原生 `div.zotero-note` 笔记容器；异步启动避免等待 UI 就绪时阻塞插件初始化。README 补充本机 WSL 路径、Windows Claude 安装/查找命令与 OpenCode 模型诊断。

## OpenCode 诊断边界

本机 `opencode models opencode` 列出 `opencode/mimo-v2.6-flash-free`。当时 Zotero 保存的 `MiMo-V2.6-Flash Free/OpenCode Zen` 是显示名称，不是对应 ID；WSL 部分 OpenCode Agent 配置还引用 `minimax/minimax-m2.5-free`，与最近交互使用的模型不同。

现有证据支持模型配置不一致及错误详情丢失；不能据此断言所有退出码 1 均由同一原因导致。本轮没有付费模型调用，没有自动改写用户模型配置，也不自动换模型重试。

## 验证

- `npm test -- --test-isolation=none`：137 项，136 通过、1 跳过、0 失败。跳过项需要原生 Windows CMD。
- `npm run build`、`npm run verify`、`git diff --check` 通过。验证包含语法、清单、XPI 与源码一致性、Runtime 源码及 Windows PTY 二进制打包。
- 自动化覆盖三 Agent 完整 95320 字符输入、取消与归档、截图保存、模板迁移/字段展开、模型参数省略与校验、嵌套错误、隐藏进程启动参数、平台切换等。
- 用户已确认上一测试包的基本归档、Claude/Codex 截图识别和归档嵌图、新建笔记，以及原验收清单功能 9/10 正常。该反馈不能代替新版真实界面验证。
- 按用户要求未引入浏览器测试依赖，未启动独立 Zotero 窗口；新布局在真实 Zotero 的外观、Windows 隐藏启动及原生终端尺寸需要本机验收。可选 Windows smoke 脚本本轮未运行。
- Claude/Codex 原生终端历史可见性尚未解决，不宣称本次已打通结构化与原生终端会话显示。跨设备同步不在本轮实测范围。

## 最小本机验收

1. 设置命名为 `{title}_ {tags}_ {author}_ {date}`，从下拉菜单插入字段，检查预览并新建记忆笔记。
2. 退出旧 Runtime 后启动 Zotero，确认不再弹出 Runtime 控制台；设置页显示实际端口与 PID。
3. 打开对话、附加截图、缩小/放大窗口，确认回答区伸缩、“清除”和发送等操作可访问；切换原生终端检查行列随窗口变化。
4. OpenCode 分别留空模型、填写当前有效 ID，发起简短提问；如留空仍失败，保留新版显示的完整错误以核对原生配置。再附加 PDF 验证字符数记录。

安装包：`dist/zotagent-0.4.2.xpi`。

SHA-256：`298cc056a03608e5f90dfc9c574a266119680f432ed02e23524fe27248a9de34`。

提交和推送的实际时间、SHA 与远端核对结果将在成功后写入本地 `VERSION-HISTORY.md`。
