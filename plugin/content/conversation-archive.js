(function () {
  "use strict";
  const root = "extensions.zotagent.";
  const format = Zotero.ZotAgent.archiveFormat;
  const queues = new Map(), listeners = new Set(), images = new Map(), written = new Set();
  const pending = new Map(), saving = new Set();
  const read = () => { try { return JSON.parse(Zotero.Prefs.get(root + "archiveTargets", true) || "{}"); } catch { return {}; } };
  const write = value => Zotero.Prefs.set(root + "archiveTargets", JSON.stringify(value), true);
  const identity = doc => `${doc.libraryID}:${doc.key}`;
  function serial(key, action) {
    const task = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(key, task);
    task.finally(() => { if (queues.get(key) === task) queues.delete(key); }).catch(() => {});
    return task;
  }
  function notify() { for (const listener of listeners) { try { listener(); } catch (e) { Zotero.logError(e); } } }
  function parse(html) { return new (Zotero.getMainWindow().DOMParser)().parseFromString(html, "text/html"); }
  function resolve(target) {
    const note = target && Zotero.Items.getByLibraryAndKey(target.libraryID, target.noteKey);
    if (!note || note.deleted || !note.isNote() || note.parentKey !== target.parentKey) throw new Error("原归档笔记已删除或移动；未改写其他笔记");
    return note;
  }
  function writable(item) {
    const library = Zotero.Libraries.get(item.libraryID);
    if (library?.editable === false) throw new Error("当前文献库只读，无法保存归档");
  }
  async function flushEditors(note) {
    for (const editor of Zotero.Notes?._editorInstances || []) {
      if (editor._item?.id !== note.id || editor._readOnly) continue;
      const getData = editor._iframeWindow?.wrappedJSObject?.getDataSync;
      if (typeof getData !== "function" || typeof editor._save !== "function") throw new Error("请先关闭当前归档笔记的编辑窗口，再重试保存");
      const data = getData(true);
      if (data) await editor._save(JSON.parse(JSON.stringify(data)));
    }
  }
  function assertEditorsSaved(note) {
    for (const editor of Zotero.Notes?._editorInstances || []) {
      if (editor._item?.id !== note.id || editor._readOnly) continue;
      const pendingData = editor._iframeWindow?.wrappedJSObject?.getDataSync(true);
      if (pendingData && pendingData.html !== note.getNote()) throw new Error("笔记正在编辑，请稍后重试归档，以保留手动修改");
    }
  }
  async function targetFor(document, force = false) {
    if (!document) return null;
    return serial("document:" + identity(document), async () => {
      const all = read(), old = all[identity(document)];
      if (!force && old) { try { resolve(old); return { ...old }; } catch {} }
      const parent = Zotero.Items.getByLibraryAndKey(document.libraryID, document.key);
      if (!parent || parent.deleted) throw new Error("主文献已不存在，无法创建归档笔记");
      writable(parent);
      const sequence = (old?.sequence || 0) + 1;
      let name = format.noteName(document, new Date(), sequence);
      const titles = new Set((parent.getNotes?.() || []).map(id => Zotero.Items.get(id)?.getNoteTitle()));
      const base = name;
      for (let i = 2; titles.has(name); i++) name = `${base}（${i}）`;
      const note = new Zotero.Item("note");
      note.libraryID = document.libraryID;
      note.parentID = parent.id;
      note.setNote(`<h1>${format.escape(name)}</h1><p>ZotAgent 对话历史 · ${format.escape(document.title)}</p>`);
      await note.saveTx();
      const target = { libraryID: document.libraryID, parentKey: document.key, noteKey: note.key, sequence, mode: format.settings().archiveSort };
      all[identity(document)] = target;
      // Another document may have finished creation while saveTx was pending.
      write({ ...read(), [identity(document)]: target });
      notify();
      return { ...target };
    });
  }
  async function importImages(record, note) {
    let keys = images.get(record.id);
    if (!keys) { keys = []; images.set(record.id, keys); }
    const win = Zotero.getMainWindow();
    for (let i = keys.length; i < (record.imageSnapshots || []).length; i++) {
      const match = record.imageSnapshots[i].match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match) throw new Error("截图格式无效，无法保存到笔记");
      const binary = win.atob(match[2]);
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
      const attachment = await Zotero.Attachments.importEmbeddedImage({ blob: new win.Blob([bytes], { type: match[1] }), parentItemID: note.id });
      keys.push(attachment.key);
    }
    return keys;
  }
  async function saveRecord(record, targetPromise) {
    if (!record.primaryDocument) return { skipped: true };
    pending.set(record.id, { record, targetPromise });
    try {
      const target = await targetPromise;
      if (!target) throw new Error("本次请求没有绑定归档笔记");
      return await serial("note:" + target.libraryID + ":" + target.noteKey, async () => {
        const note = resolve(target);
        writable(note);
        if (written.has(record.id)) { pending.delete(record.id); return { note }; }
        await flushEditors(note);
        if (format.recordsIn(parse(note.getNote())).some(r => r.meta.id === record.id)) {
          written.add(record.id); pending.delete(record.id); return { note };
        }
        const keys = await importImages(record, note);
        await flushEditors(note);
        // Re-read inside the transaction. User edits and other finished requests
        // are never replaced with the HTML that existed when the request began.
        await Zotero.DB.executeTransaction(async () => {
          assertEditorsSaved(note);
          const doc = parse(note.getNote());
          if (format.recordsIn(doc).some(r => r.meta.id === record.id)) return;
          const body = format.noteBody(doc);
          const addition = parse(format.renderRecord(record, keys, Zotero.ZotAgent.utils.markdownToNoteHTML));
          body.append(...Array.from(addition.body.childNodes));
          const active = read()[identity(record.primaryDocument)];
          const mode = active?.noteKey === target.noteKey ? active.mode : target.mode;
          const previous = note.getNote();
          try { note.setNote(format.sortRecords(doc, mode)); await note.save(); }
          catch (error) { note.setNote(previous); throw error; }
        });
        written.add(record.id); images.delete(record.id); pending.delete(record.id); notify();
        return { note };
      });
    } catch (error) { notify(); throw error; }
  }
  function save(record, targetPromise) {
    const task = saveRecord(record, targetPromise);
    saving.add(task);
    task.finally(() => saving.delete(task)).catch(() => {});
    return task;
  }
  async function reorderCurrent(mode) {
    if (!["asked", "ended"].includes(mode)) throw new Error("无效排序方式");
    const all = read();
    for (const [key, target] of Object.entries(all)) {
      await serial("note:" + target.libraryID + ":" + target.noteKey, async () => {
        let note;
        try { note = resolve(target); } catch { return; }
        writable(note); await flushEditors(note);
        await Zotero.DB.executeTransaction(async () => {
          assertEditorsSaved(note);
          const previous = note.getNote();
          try { note.setNote(format.sortRecords(parse(previous), mode)); await note.save(); }
          catch (error) { note.setNote(previous); throw error; }
        });
        const latest = read();
        if (latest[key]?.noteKey === target.noteKey) { latest[key].mode = mode; write(latest); }
      });
    }
    notify();
  }
  async function retry(document) {
    let count = 0;
    for (const entry of [...pending.values()]) {
      if (!document || identity(entry.record.primaryDocument) === identity(document)) { await save(entry.record, entry.targetPromise); count++; }
    }
    return count;
  }
  Zotero.ZotAgent.archive = { targetFor, save, resolve, parse, flushEditors, reorderCurrent, retry, pending,
    current: document => document ? read()[identity(document)] || null : null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async drain() { while (queues.size || saving.size) await Promise.allSettled([...queues.values(), ...saving]); },
  };
})();
