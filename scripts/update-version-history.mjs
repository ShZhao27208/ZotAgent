import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "docs", "VERSION-HISTORY.md");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
}

const commits = git([
  "log", "--all", "--reverse", "--date=iso-strict",
  "--format=%H%x09%h%x09%aI%x09%s",
  "--", ".", ":(exclude)docs/VERSION-HISTORY.md",
]).split("\n").filter(Boolean).map((line) => {
  const [hash, short, date, ...subjectParts] = line.split("\t");
  const subject = subjectParts.join("\t").replaceAll("|", "\\|");
  let version = "未标版本";
  try {
    const packageJSON = git(["show", `${hash}:package.json`]);
    version = JSON.parse(packageJSON).version || version;
  } catch {}
  return { hash, short, date, version, subject };
});

const refs = git([
  "for-each-ref", "--sort=refname",
  "--format=%(refname)\t%(objectname)\t%(creatordate:iso-strict)\t%(subject)",
  "refs/remotes", "refs/tags",
]).split("\n").filter(Boolean).map((line) => {
  const [ref, hash, date, ...subjectParts] = line.split("\t");
  return { ref, hash: hash.slice(0, 12), date, subject: subjectParts.join("\t") };
});

const tags = refs.filter((ref) => ref.ref.startsWith("refs/tags/"));
// Remote branch pointers move whenever this branch is pushed and would make
// the history file self-changing. The full commit table below remains the
// source of truth for every pushed commit; only stable tags are listed here.
const branches = [];
const latestCommitDate = commits.at(-1)?.date || "未知";

const lines = [
  "# ZotAgent 版本与推送历史",
  "",
  "> 本文件记录本地可见的 Git 历史（含推送前待发布提交），不代表 GitHub 每次 push 的事件日志。每次推送前运行 `npm run version-history`；本地 `.githooks/pre-push` 会在历史变化且文件未更新时阻止推送。",
  "",
  `- 历史截至：${latestCommitDate}`,
  "- 项目：`ShZhao27208/ZotAgent`",
  `- 可见提交：${commits.length} 个（按 Git 提交时间升序）`,
  "- 时间：ISO 8601，带时区",
  "",
  "## 远端分支与标签",
  "",
  "| 引用 | 提交 | 时间 | 说明 |",
  "| --- | --- | --- | --- |",
  ...[...branches, ...tags].map((ref) => `| \`${ref.ref.replace(/^refs\/(?:remotes\/|tags\/)/, "")}\` | \`${ref.hash}\` | ${ref.date} | ${ref.subject.replaceAll("|", "\\|")} |`),
  "",
  "## 正式版本",
  "",
  "| 版本 | 时间 | 提交 | 主要改动 |",
  "| --- | --- | --- | --- |",
  "| `0.1.1` | 2026-08-28 | `8f50b77` | 首个可构建骨架：Zotero 插件、Runtime Host、三种 Agent Adapter、鉴权 NDJSON、会话恢复、笔记写回和 XPI 构建。 |",
  "| `0.2.0` | 2026-09-01 | `991ff62` | 增加 Zotero PDF 全文抽取，并在 Agent 请求前注入全文上下文。 |",
  "| `0.2.1` | 2026-09-01 | `c6538f9` | 恢复 PDF 选中文本捕获。 |",
  "| `0.2.2` | 2026-09-01 | `2ce2945` | 重做阅读器选区和滚动区域捕获。 |",
  "| `0.2.3` | 2026-09-01 | `33ba935` | 移除 Claude 不支持的 `cwd` 参数。 |",
  "| `0.2.4` | 2026-09-01 | `ec5d825` | 支持把回答插入 PDF 注释弹窗光标。 |",
  "| `0.2.5` | 2026-09-01 | `368a0a2` | 支持显式配置 OpenCode 模型。 |",
  "| `0.2.6` | 2026-09-01 | `a6e6a34` | 修复 Claude CLI 在 PTY 会话中的路径解析。 |",
  "| `0.2.7` | 2026-09-01 | `28c7e0f` | 原生终端使用各 Agent 的真实名称。 |",
  "| `0.2.8` | 2026-09-01 | `7fe3d09` | 请求失败时显示 Agent stderr。 |",
  "| `0.2.9` | 2026-09-01 | `c4c7388` | 原生终端不再错误传递结构化会话参数；同时补充大批测试。 |",
  "| `0.3.0` | 2026-09-01 | `6a550b5` | 版本跃迁；此前提交已加入可选 PDF 全文和多文献参考池。 |",
  "| `0.3.1` | 2026-09-01 | `cb46b4e` | OpenCode 原生 TUI 接收项目路径。 |",
  "| `0.3.2` | 2026-09-02 | `0647718` | 锁定主文献并加入参考文献导入；随后重写 README 和使用指南。 |",
  "| `0.3.3` | 2026-09-21 | `848e20b` | 安装后 XPI 保留 Runtime 来源；自动发现 CLI、初始化 NVM、同步 Agent 路径和默认工作目录。 |",
  "| `0.3.4` | 2026-09-21 | `5dc2fbc` | 增加连接超时、路径规范化、`wsl.exe --exec` 启动、主目录大小写修复和早退诊断。 |",
  "| `0.3.5` | 2026-09-21 | `878cd56` | 恢复直接 `env → Node → Runtime` 启动；传递自定义端口；默认端口失败时经鉴权回退到 `24129`。 |",
  ...tags.filter(ref => /^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref.ref) && ref.ref.replace("refs/tags/v", "").localeCompare("0.3.5", undefined, { numeric: true }) > 0).map(ref => {
    const commit = commits.find(c => c.hash.startsWith(ref.hash));
    const description = ref.ref.endsWith("0.3.6") ? "CLI Shell 启动、默认模型信息和版本维护；安装启动仍依赖外部 Runtime。" : ref.ref.endsWith("0.3.7") ? "XPI 内置 Runtime 与 Windows PTY，自动部署本机后端并复用已有 Node，无需 WSL。" : (commit?.subject || ref.subject);
    return `| \`${ref.ref.replace("refs/tags/v", "")}\` | ${ref.date} | \`${commit?.short || ref.hash}\` | ${description} |`;
  }),
  "",
  "## 全部推送提交",
  "",
  "下表保留代码提交的短编号、作者时间、当时的 package 版本和提交说明；Git 无法还原每次 push 的实际时间，纯历史文件维护提交不列入表中。版本号表示该提交中的 `package.json` 版本；没有单独发版的修复也会保留。",
  "",
  "| # | 时间 | 版本 | 提交 | 主要改动点 |",
  "| --- | --- | --- | --- | --- |",
  ...commits.map((commit, index) => `| ${index + 1} | ${commit.date} | \`${commit.version}\` | \`${commit.short}\` | ${commit.subject} |`),
  "",
  "## 维护规则",
  "",
  "1. 新提交或新远端引用出现后，运行 `npm run version-history`。",
  "2. 将本文件和生成脚本一起提交，再执行 `git push`。",
  "3. 如果 pre-push 检查提示历史已变化，先提交更新后的本文件，再重新推送。",
  "",
];

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n"), "utf8");
process.stdout.write(`Updated ${path.relative(root, output)} (${commits.length} commits)\n`);
