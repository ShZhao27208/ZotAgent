# Windows 安装故障：0.3.9 修复记录

日期：2026-09-24。

## 症状与原因

0.3.8 在填写 Runtime 和 Node 路径前报 `NS_ERROR_FAILURE [nsIURI.username]`。
安装器先找到 Node，再通过 `Zotero.File.getContentsAsync(jar:…/manifest.json)` 读取版本；该调用失败，尚未保存任何路径。

核对 Zotero 官方 main 源码（本次查询时）：

- [file.js](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/file.js)：`getContentsAsync` 将 jar URI 字符串转交 `Zotero.HTTP.request`。
- [http.js](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/http.js)：`_parseURI` 访问 `uri.username`，jar URI 不支持该属性。
- [plugins.js](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/plugins.js)：启动参数已包含 `version: addon.version`，无需自行读取 manifest。

0.3.8 只移除了压缩包下载调用，遗漏了更早的 manifest 读取。此前测试将 manifest 读取模拟为成功，没有覆盖宿主 API 的实际行为。

## 改动与验证

- 使用 Zotero 启动参数中的版本号；本地安装流程不再调用 File.getContentsAsync 或 File.download。
- Node 检测成功立即保存路径；失败提示区分检测、版本读取、创建目录、提取包、解压和保存脚本路径。
- 修正测试替身后，旧实现出现同一 `nsIURI.username` 错误；应用修复后，20 项安装和启动回归测试全部通过。
- 构建、脚本语法检查、XPI/内嵌 ZIP 完整性检查通过。
- 尚未在用户目标 Windows Zotero 实机完成安装与连接验收，模拟测试不等同于实机验证。
