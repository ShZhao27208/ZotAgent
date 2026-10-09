(function () {
  "use strict";
  const escape = text => String(text).replace(/([\\`*_[\]<>])/g, "\\$1");
  function toMarkdown(doc) {
    const children = node => Array.from(node.childNodes).map(convert).join("");
    function convert(node) {
      if (node.nodeType === 3) return escape(node.nodeValue);
      if (node.nodeType !== 1) return "";
      const tag = node.localName.toLowerCase();
      if (["script", "style"].includes(tag)) return "";
      if ((node.id || "").startsWith("zotagent-end-")) return "\n---\n\n";
      if (tag === "pre") {
        const text = node.textContent;
        const size = Math.max(3, ...(text.match(/`+/g) || []).map(s => s.length + 1));
        const fence = "`".repeat(size);
        return `\n${fence}\n${text}\n${fence}\n\n`;
      }
      if (tag === "code") {
        const text = node.textContent;
        const fence = "`".repeat(Math.max(1, ...(text.match(/`+/g) || []).map(s => s.length + 1)));
        return `${fence} ${text} ${fence}`;
      }
      if (tag === "img") return `![${escape(node.getAttribute("alt") || "图片")}](${(node.getAttribute("src") || "").replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29")})`;
      if (tag === "table") {
        // Archive frames are 1x1 tables; a Markdown table would squash their headings and lists into one cell.
        const ownRows = node.querySelectorAll(":scope > tr, :scope > * > tr");
        if (ownRows.length === 1 && ownRows[0].children.length === 1) return "\n" + children(ownRows[0].children[0]).trim() + "\n\n";
        const rows = [...node.querySelectorAll("tr")].map(tr => [...tr.children].map(cell => children(cell).trim().replaceAll("|", "\\|").replace(/\n/g, "<br>")));
        if (!rows.length) return "";
        const width = Math.max(...rows.map(r => r.length));
        const line = cells => "| " + Array.from({ length: width }, (_, i) => cells[i] || "").join(" | ") + " |";
        return "\n" + [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n") + "\n\n";
      }
      if (tag === "ul" || tag === "ol") {
        return "\n" + [...node.children].map((li, i) => {
          const prefix = tag === "ol" ? `${Number(node.getAttribute("start") || 1) + i}. ` : "- ";
          return prefix + children(li).trim().replaceAll("\n", "\n" + " ".repeat(prefix.length));
        }).join("\n") + "\n\n";
      }
      const content = children(node);
      if (/^h[1-6]$/.test(tag)) return `\n${"#".repeat(Number(tag[1]))} ${content.trim()}\n\n`;
      if (["p", "div"].includes(tag)) return content + "\n\n";
      if (tag === "br") return "  \n";
      if (tag === "hr") return "\n---\n\n";
      if (tag === "blockquote") return "\n" + content.trim().split("\n").map(line => "> " + line).join("\n") + "\n\n";
      if (["b", "strong"].includes(tag)) return `**${content}**`;
      if (["i", "em"].includes(tag)) return `*${content}*`;
      if (["s", "del"].includes(tag)) return `~~${content}~~`;
      if (tag === "a") return `[${content}](<${(node.getAttribute("href") || "").replaceAll(">", "%3E").replaceAll("<", "%3C")}>)`;
      return content;
    }
    return children(doc.body).trim() + "\n";
  }
  async function exportNote(target, win) {
    const archive = Zotero.ZotAgent.archive;
    const note = archive.resolve(target);
    await archive.flushEditors(note);
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const picker = new FilePicker();
    picker.init(win, "导出记忆笔记为 Markdown", picker.modeSave);
    picker.defaultString = Zotero.File.getValidFileName(note.getNoteTitle() || "ZotAgent") + ".md";
    picker.defaultExtension = "md";
    picker.appendFilter("Markdown", "*.md");
    const choice = await picker.show();
    if (choice !== picker.returnOK && choice !== picker.returnReplace) return false;
    return writeNote(target, picker.file);
  }
  async function writeNote(target, destination) {
    const archive = Zotero.ZotAgent.archive;
    const note = archive.resolve(target);
    // Read the current note after the file dialog, including any user edits.
    await archive.flushEditors(note);
    const doc = archive.parse(note.getNote());
    const output = Zotero.File.pathToFile(destination);
    const directory = output.parent.clone();
    directory.append(output.leafName.replace(/\.md$/i, "") + "_images");
    const imageNodes = [...doc.querySelectorAll("img[data-attachment-key]")];
    if (imageNodes.length && !directory.exists()) directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
    const copied = new Map();
    for (const image of imageNodes) {
      const key = image.getAttribute("data-attachment-key");
      if (!copied.has(key)) {
        const attachment = Zotero.Items.getByLibraryAndKey(note.libraryID, key);
        if (!attachment || attachment.parentID !== note.id) throw new Error("无法找到笔记内嵌图片：" + key);
        const path = await attachment.getFilePathAsync();
        if (!path) throw new Error("图片尚未同步到本机，请先同步后导出");
        const source = Zotero.File.pathToFile(path);
        const extension = source.leafName.split(".").at(-1).replace(/[^a-z0-9]/gi, "") || "png";
        let name = `${key}.${extension}`;
        let dest = directory.clone(); dest.append(name);
        for (let n = 2; dest.exists(); n++) { name = `${key}-${n}.${extension}`; dest = directory.clone(); dest.append(name); }
        source.copyTo(directory, name);
        copied.set(key, directory.leafName + "/" + name);
      }
      image.setAttribute("src", copied.get(key));
      image.removeAttribute("data-attachment-key");
    }
    await Zotero.File.putContentsAsync(output, toMarkdown(doc));
    return true;
  }
  Zotero.ZotAgent.archiveExport = { toMarkdown, exportNote, writeNote };
})();
