import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DOMParser, parseHTML } from 'linkedom';

export function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
export function fixture() {
  const prefs = new Map(), items = new Map();
  let nextID = 1;
  const { window: domWindow } = parseHTML('<html><head></head><body></body></html>');
  class BrowserParser { parseFromString(html, type) { return new DOMParser().parseFromString(/<html[\s>]/i.test(html) ? html : '<html><body>' + html + '</body></html>', type); } }
  const window = { document: domWindow.document, DOMParser: BrowserParser, Blob, AbortController, atob, addEventListener() {}, removeEventListener() {} };
  const errors = [];
  let writes = 0, imports = 0;
  class Item {
    constructor(type) { this.itemType = type; this.libraryID = 1; this.deleted = false; this.fields = {}; this.html = ''; this.attachments = []; }
    get parentKey() { return items.get(this.parentID)?.key; }
    getField(name) { return this.fields[name] || ''; }
    getCreators() { return [{ lastName: 'Author' }]; }
    getAttachments() { return this.attachments; }
    getNotes() { return [...items.values()].filter(i => i.parentID === this.id && i.isNote()).map(i => i.id); }
    isNote() { return this.itemType === 'note'; }
    isAttachment() { return this.itemType === 'attachment'; }
    setNote(html) { this.html = html; }
    getNote() { return this.html; }
    getNoteTitle() { return new DOMParser().parseFromString('<html><body>' + this.html + '</body></html>', 'text/html').body.firstElementChild?.textContent || ''; }
    async save() { if (!this.id) { this.id = nextID++; this.key = 'KEY' + String(this.id).padStart(5, '0'); } items.set(this.id, this); writes++; return this.id; }
    async saveTx() { return this.save(); }
  }
  const Zotero = {
    Item, Prefs: { get: key => prefs.get(key), set: (key, value) => prefs.set(key, value) },
    Items: { get: id => items.get(id), getAsync: async id => items.get(id), getByLibraryAndKey: (lib, key) => [...items.values()].find(i => i.libraryID === lib && i.key === key) },
    Libraries: { get: () => ({ editable: true, libraryType: 'user' }) },
    Notes: { _editorInstances: [], open: async () => {} }, DB: { executeTransaction: async action => action() },
    Attachments: { importEmbeddedImage: async ({blob, parentItemID}) => { imports++; const item = new Item('attachment'); item.parentID = parentItemID; item.blob = blob; await item.save(); return item; } },
    PDFWorker: { getFullText: async () => ({ text: 'pdf content' }) },
    getMainWindow: () => window, debug() {}, logError: error => errors.push(error),
  };
  const context = { Zotero, Services: {}, console, setTimeout, clearTimeout, DOMParser, TextEncoder, TextDecoder, Uint8Array, AbortController, Blob,
    fetch: async () => { throw new Error('Unexpected network call'); } };
  vm.createContext(context);
  const read = name => readFileSync(new URL('../../plugin/content/' + name, import.meta.url), 'utf8');
  vm.runInContext(read('zot-agent.js').replace('  Zotero.ZotAgent = {', '  globalThis.testAPI = { AgentDialog, RuntimeClient, RuntimeManager, SessionHistory, NoteService };\n  Zotero.ZotAgent = {'), context);
  for (const name of ['archive-format.js', 'conversation-archive.js', 'archive-export.js']) vm.runInContext(read(name), context);
  // linkedom expects a full HTML document, whereas the browser parser supplies it.
  Zotero.ZotAgent.archive.parse = html => new DOMParser().parseFromString('<html><body>' + html + '</body></html>', 'text/html');

  const api = context.testAPI;
  async function paper(title = 'Paper A') { const p = new Item('journalArticle'); p.fields = { title, date: '2026' }; await p.save(); return p; }
  function dialog(paper = null) {
    const controller = { win: window, doc: window.document, layer: window.document.body, dialogs: new Map(), getActiveContext: () => paper ? { topItem: paper, title: paper.getField('title'), attachment: items.get(paper.attachments[0]) } : null };
    const dialog = new api.AgentDialog(controller); controller.dialogs.set(dialog.id, dialog); return dialog;
  }
  const format = Zotero.ZotAgent.archiveFormat;
  function record(paper, id = 'r1', asked = 1, ended = 2) { return { id, submittedAt: asked, endedAt: ended, agent: 'codex', status: 'completed', question: 'question', answer: 'answer', primaryDocument: format.documentSnapshot(paper), references: [], fullTextAttachments: [], imageSnapshots: [] }; }
  return { context, Zotero, api, archive: Zotero.ZotAgent.archive, format, window, prefs, items, paper, dialog, record, errors, counts: () => ({writes, imports}) };
}
