(function () {
  "use strict";
  const AGENTS = { opencode: "OpenCode", codex: "Codex", "claude-code": "Claude Code" };
  const choices = {
    archiveSort: ["排序", "asked", [["asked", "按提问时间"], ["ended", "按结束时间"]]],
    archiveNamePreset: ["命名预设", "chinese", [
      ["chinese", "中文年月日时分"], ["chineseSeconds", "中文年月日时分秒"], ["iso", "ISO 日期＋时分"],
      ["isoSeconds", "ISO 日期＋时分秒"], ["compact", "紧凑日期时间"], ["date", "仅日期"],
      ["title", "文献标题＋日期时间"], ["author", "第一作者＋日期时间"], ["authorYear", "作者＋发表年份＋日期时间"],
      ["key", "文献 key＋日期时间"], ["sequence", "日期时间＋序号"], ["custom", "自定义组合"],
    ]],
    archiveNameDate: ["日期格式", "YYYY年MM月DD日", ["YYYY年MM月DD日", "YYYY-MM-DD", "YYYY/MM/DD", "YYYY.MM.DD", "YYYYMMDD", "MM月DD日", ""]],
    archiveNameTime: ["时间格式", "HH时mm分", ["HH时mm分", "HH时mm分ss秒", "HH:mm", "HH:mm:ss", "HHmm", "HHmmss", ""]],
    archiveNameDocument: ["文献字段", "", [["", "不显示"], ["title", "标题"], ["shortTitle", "短标题"], ["author", "第一作者"], ["year", "发表年份"], ["doi", "DOI"], ["key", "条目 key"], ["authorYear", "第一作者＋年份"]]],
    archiveNameOrder: ["字段顺序", "dateFirst", [["dateFirst", "日期时间在前"], ["documentFirst", "文献在前"], ["prefixFirst", "前缀＋文献＋日期时间"], ["sequenceFirst", "文献＋序号＋日期时间"]]],
    archiveNameSeparator: ["分隔符", "", [["", "无"], [" ", "空格"], [" - ", "短横线"], ["_", "下划线"], [" | ", "竖线"], [" · ", "中点"]]],
    archiveNamePrefix: ["固定前缀", "", [["", "无"], ["ZotAgent", "ZotAgent"], ["对话记录", "对话记录"], ["研究笔记", "研究笔记"], ["文献讨论", "文献讨论"], ["custom", "自定义文字"]]],
    archiveNameSequence: ["序号", "collision", [["collision", "仅重名时追加"], ["always", "始终显示"], ["2", "两位补零"], ["3", "三位补零"]]],
    archiveNameWeekday: ["星期", "", [["", "不显示"], ["星期", "中文星期"], ["周", "中文周"], ["english", "英文缩写"]]],
    archiveNameTimezone: ["时区", "local", [["local", "系统本地"], ["Asia/Shanghai", "Asia/Shanghai"], ["UTC", "UTC"]]],
    archiveNameTitleLength: ["标题长度", "60", [["20", "20 字符"], ["40", "40 字符"], ["60", "60 字符"], ["100", "100 字符"], ["0", "不限制"]]],
  };
  const namingTokens = {
    title: "文献标题", shortTitle: "短标题", tags: "标签", author: "第一作者", authors: "全部作者",
    year: "发表年份", doi: "DOI", key: "条目 key", date: "创建日期", time: "创建时间",
    weekday: "星期", sequence: "笔记序号", YYYY: "创建年", MM: "创建月", DD: "创建日",
    HH: "创建时", mm: "创建分", ss: "创建秒",
  };
  const visibleChoices = Object.fromEntries(Object.entries(choices).filter(([name]) =>
    ["archiveSort", "archiveNameDate", "archiveNameTime", "archiveNameTimezone", "archiveNameTitleLength", "archiveNameSequence"].includes(name)));
  visibleChoices.archiveNameSequence = ["序号格式", "collision", [["collision", "不补零"], ["2", "两位补零"], ["3", "三位补零"]]];
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function settings() {
    const result = {};
    for (const [name, [, fallback]] of Object.entries(choices)) result[name] = Zotero.Prefs.get("extensions.zotagent." + name, true) ?? fallback;
    result.archiveNameCustomPrefix = Zotero.Prefs.get("extensions.zotagent.archiveNameCustomPrefix", true) || "";
    result.archiveNameTemplate = Zotero.Prefs.get("extensions.zotagent.archiveNameTemplate", true);
    if (result.archiveNameTemplate == null) {
      const migrated = resolveLegacyPreset(result);
      const sep = migrated.archiveNameSeparator;
      const date = [migrated.archiveNameDate && "{date}", migrated.archiveNameTime && "{time}", migrated.archiveNameWeekday && "{weekday}"].filter(Boolean).join(sep);
      const doc = migrated.archiveNameDocument === "authorYear" ? "{author} {year}" : migrated.archiveNameDocument ? `{${migrated.archiveNameDocument}}` : "";
      const prefix = migrated.archiveNamePrefix === "custom" ? migrated.archiveNameCustomPrefix.trim() : migrated.archiveNamePrefix;
      const number = migrated.archiveNameSequence === "collision" ? "" : "{sequence}";
      const fields = migrated.archiveNameOrder === "sequenceFirst" ? [prefix, doc, number, date] : migrated.archiveNameOrder === "dateFirst" ? [prefix, date, doc, number] : [prefix, doc, date, number];
      result.archiveNameTemplate = fields.filter(Boolean).join(sep) || "ZotAgent 对话记录";
      for (const name of ["archiveNameDate", "archiveNameTime", "archiveNameSequence"]) result[name] = migrated[name];
      if (result.archiveNameSequence === "always") result.archiveNameSequence = "collision";
      for (const name of ["archiveNameTemplate", "archiveNameDate", "archiveNameTime", "archiveNameSequence"])
        Zotero.Prefs.set("extensions.zotagent." + name, result[name], true);
    }
    return result;
  }
  function documentSnapshot(item) {
    if (!item) return null;
    const field = name => { try { return String(item.getField(name) || ""); } catch { return ""; } };
    let creators = [];
    try { creators = item.getCreators().map(c => c.lastName || c.name).filter(Boolean); } catch {}
    let tags = [];
    try { tags = item.getTags().map(t => t.tag).filter(Boolean); } catch {}
    let link = "";
    try {
      const group = Zotero.Libraries.get(item.libraryID)?.libraryType === "group" ? Zotero.Groups.getGroupIDFromLibraryID(item.libraryID) : null;
      link = `zotero://select/${group ? `groups/${group}` : "library"}/items/${item.key}`;
    } catch { link = `zotero://select/library/items/${item.key}`; }
    return { id: item.id, libraryID: item.libraryID, key: item.key, title: field("title") || "未命名文献", shortTitle: field("shortTitle"),
      tags: tags.join(", "), author: creators[0] || "", authors: creators.join(", "), year: field("date").match(/\d{4}/)?.[0] || "", doi: field("DOI"), link };
  }
  function resolveLegacyPreset(config) {
    const c = { ...config };
    const presets = {
      chinese: ["YYYY年MM月DD日", "HH时mm分"], chineseSeconds: ["YYYY年MM月DD日", "HH时mm分ss秒"],
      iso: ["YYYY-MM-DD", "HH:mm"], isoSeconds: ["YYYY-MM-DD", "HH:mm:ss"], compact: ["YYYYMMDD", "HHmmss"], date: ["YYYY-MM-DD", ""],
      title: ["YYYY-MM-DD", "HH:mm", "title"], author: ["YYYY-MM-DD", "HH:mm", "author"],
      authorYear: ["YYYY-MM-DD", "HH:mm", "authorYear"], key: ["YYYYMMDD", "HHmm", "key"], sequence: ["YYYY-MM-DD", "HH:mm"],
    };
    if (presets[c.archiveNamePreset]) {
      const [date, time, doc = ""] = presets[c.archiveNamePreset];
      Object.assign(c, { archiveNameDate: date, archiveNameTime: time, archiveNameDocument: doc,
        archiveNameOrder: doc ? "documentFirst" : "dateFirst", archiveNameSeparator: /^(chinese|compact)/.test(c.archiveNamePreset) ? "" : " " });
      if (c.archiveNamePreset === "sequence") c.archiveNameSequence = "always";
    }
    return c;
  }
  function noteName(document, at = new Date(), sequence = 1, c = settings()) {
    const timeZone = c.archiveNameTimezone === "local" ? undefined : c.archiveNameTimezone;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at).map(p => [p.type, p.value]));
    const clock = { YYYY: parts.year, MM: parts.month, DD: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second };
    const format = value => String(value || "").replace(/YYYY|MM|DD|HH|mm|ss/g, t => clock[t]);
    const limit = value => Number(c.archiveNameTitleLength) ? Array.from(String(value || "")).slice(0, Number(c.archiveNameTitleLength)).join("") : String(value || "");
    const values = { ...document, ...clock, title: limit(document?.title), shortTitle: limit(document?.shortTitle || document?.title),
      date: format(c.archiveNameDate), time: format(c.archiveNameTime),
      weekday: new Intl.DateTimeFormat("zh-CN", { timeZone, weekday: "long" }).format(at),
      sequence: String(sequence).padStart(Number(c.archiveNameSequence) || 1, "0"),
    };
    return String(c.archiveNameTemplate ?? "{date}{time}").replace(/\{([A-Za-z]+)\}/g, (token, key) =>
      Object.hasOwn(namingTokens, key) ? String(values[key] ?? "") : token).trim() || "ZotAgent 对话记录";
  }
  function fullTextDescription(entry) {
    if (entry.state === "extracting") return "全文提取未完成，未提交。";
    if (!entry.extractedChars) return "未提取到 PDF 文本，本次未附加该文献全文。";
    const count = entry.extractedChars;
    if (entry.state === "submitted") return `已附加 PDF 提取文本：共提取 ${count} 字符，本次提交全部 ${count} 字符。\n提交内容仍受请求体大小、Agent CLI 和模型上下文限制。`;
    if (entry.state === "received") return `已提取 ${count} 字符；Runtime 已接收请求，Agent 输入提交状态未确认。`;
    if (entry.state === "sending") return `已提取 ${count} 字符；请求已发出，提交状态未确认。`;
    return `已提取 ${count} 字符；预计提交全部 ${count} 字符，尚未提交。\n提交内容仍受请求体大小、Agent CLI 和模型上下文限制。`;
  }
  const labels = { completed: "完成", cancelled: "用户中断", failed: "执行失败", disconnected: "连接异常" };
  function renderRecord(record, imageKeys, markdown) {
    const meta = encodeURIComponent(JSON.stringify({ id: record.id, asked: record.submittedAt, ended: record.endedAt }));
    const date = value => new Date(value).toLocaleString("zh-CN", { hour12: false }) + " " + new Date(value).toString().match(/GMT[+-]\d+/)?.[0];
    const color = { codex: "#245fa5", "claude-code": "#8755a4", opencode: "#256d3f" }[record.agent] || "#245fa5";
    const badge = text => `<strong><span style="color: ${color}; background-color: #edf2f7">${escape(text)}</span></strong>`;
    const metadata = text => `<span style="color: #52677b">${escape(text)}</span>`;
    // Zotero's note schema has no generic container, so a 1x1 table draws the border.
    const frame = html => `<table><tbody><tr><td>${html}</td></tr></tbody></table>`;
    const source = (d, label) => d ? `<p>${badge(label + "：")}<a href="${escape(d.link)}">${escape(d.title)}</a>${escape([d.authors, d.year, d.doi && `DOI: ${d.doi}`].filter(Boolean).map(v => ` · ${v}`).join(""))}</p>` : "";
    const endLabel = record.status === "cancelled" ? "用户中断时间" : record.status === "completed" ? "回答完成时间" : "失败时间";
    return `<h2 id="zotagent-record-${meta}">${badge("Agent · " + (AGENTS[record.agent] || record.agent))} · ${escape(labels[record.status] || record.status)}</h2>`
      + `<p>${badge("提问时间：")}${metadata(date(record.submittedAt))}<br/>${badge(endLabel + "：")}${metadata(date(record.endedAt))}${record.model ? `<br/>${badge("模型：")}${metadata(record.model)}` : ""}</p>`
      + source(record.primaryDocument, "主文献") + (record.references || []).map(d => source(d, "参考文献")).join("")
      + (record.targetDocument ? source(record.targetDocument, "本次分别处理文献") : "")
      + (record.fullTextAttachments || []).map(e => `<p>${escape(e.title)}<br/>${escape(fullTextDescription(e)).replaceAll("\n", "<br/>")}</p>`).join("")
      + frame(`<h3>${badge("问题")}</h3><p>${escape(record.question).replaceAll("\n", "<br/>")}</p>`
        + (record.selection ? `<h3>选区${record.selectionLabel ? ` · ${escape(record.selectionLabel)}` : ""}</h3>${source(record.selectionDocument, "选区来源")}<p>${escape(record.selection).replaceAll("\n", "<br/>")}</p>` : "")
        + imageKeys.map(key => `<p><img data-attachment-key="${escape(key)}" alt="本次提问的 PDF 截图"/></p>`).join(""))
      + frame(`<h3>${badge("回答 · " + (AGENTS[record.agent] || record.agent))}</h3>${record.answer ? markdown(record.answer) : "<p>尚未收到具体回答。</p>"}`
        + (record.failureSummary ? `<p>说明：${escape(record.failureSummary)}</p>` : ""))
      + `<h6 id="zotagent-end-${escape(record.id)}">记录结束</h6>`;
  }
  function noteBody(doc) { return doc.body.querySelector(":scope > div[data-schema-version], :scope > div.zotero-note") || doc.body; }
  function recordsIn(doc) {
    const body = noteBody(doc), found = [], ids = new Set();
    let active = null;
    for (const node of body.childNodes) {
      const id = node.nodeType === 1 ? node.getAttribute("id") || "" : "";
      if (id.startsWith("zotagent-record-")) {
        if (active) throw new Error("归档记录边界已被修改，请恢复记录结束标题后重试");
        let meta;
        try { meta = JSON.parse(decodeURIComponent(id.slice(16))); } catch { throw new Error("归档记录标记无法识别"); }
        if (!meta.id || !Number.isFinite(meta.asked) || !Number.isFinite(meta.ended) || ids.has(meta.id)) throw new Error("归档记录标记重复或无效");
        ids.add(meta.id); active = { meta, nodes: [] };
      }
      if (active) active.nodes.push(node);
      if (id.startsWith("zotagent-end-")) {
        if (!active || id !== `zotagent-end-${active.meta.id}`) throw new Error("归档记录边界不完整，请保留现有笔记并检查记录标题");
        found.push(active); active = null;
      }
    }
    if (active) throw new Error("归档记录缺少结束标题，请恢复后重试");
    return found;
  }
  function sortRecords(doc, mode) {
    const records = recordsIn(doc);
    const sorted = [...records].sort((a, b) => a.meta[mode === "ended" ? "ended" : "asked"] - b.meta[mode === "ended" ? "ended" : "asked"] || a.meta.id.localeCompare(b.meta.id));
    const slots = records.map(r => { const marker = doc.createComment("archive-slot"); r.nodes[0].before(marker); return marker; });
    records.forEach(r => r.nodes.forEach(n => n.remove()));
    slots.forEach((slot, i) => { slot.before(...sorted[i].nodes); slot.remove(); });
    return doc.body.innerHTML;
  }
  Zotero.ZotAgent.archiveFormat = { AGENTS, choices: visibleChoices, namingTokens, settings, escape, documentSnapshot, noteName, fullTextDescription, renderRecord, recordsIn, noteBody, sortRecords, labels };
})();
