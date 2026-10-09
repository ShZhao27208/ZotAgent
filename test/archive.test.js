import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/plugin-fixture.js';

test('simultaneous windows share a persistent note; another paper stays separate', async () => {
  const f = fixture(), paper = await f.paper(), doc = f.format.documentSnapshot(paper);
  const [a,b,c] = await Promise.all([f.archive.targetFor(doc),f.archive.targetFor(doc),f.archive.targetFor(doc)]);
  assert.equal(a.noteKey,b.noteKey); assert.equal(b.noteKey,c.noteKey); assert.equal(paper.getNotes().length,1);
  assert.equal((await f.archive.targetFor(doc)).noteKey,a.noteKey);
  assert.notEqual((await f.archive.targetFor(f.format.documentSnapshot(await f.paper('B')))).noteKey,a.noteKey);
  f.archive.resolve(a).deleted = true;
  assert.notEqual((await f.archive.targetFor(doc)).noteKey,a.noteKey);
});
test('in-flight requests keep old target while new questions use the new note', async () => {
  const f = fixture(), p = await f.paper(), doc = f.format.documentSnapshot(p);
  const old = f.archive.targetFor(doc);
  const fresh = f.archive.targetFor(doc,true);
  await f.archive.save(f.record(p,'new',3,4),fresh);
  await Promise.all([f.archive.save(f.record(p,'old-a',1,6),old), f.archive.save(f.record(p,'old-b',2,5),old)]);
  assert.deepEqual(f.format.recordsIn(f.archive.parse(f.archive.resolve(await old).getNote())).map(r=>r.meta.id).join(','),['old-a','old-b'].join(','));
  assert.deepEqual(f.format.recordsIn(f.archive.parse(f.archive.resolve(await fresh).getNote())).map(r=>r.meta.id).join(','),['new'].join(','));
});
test('concurrent terminal saves are idempotent and preserve manual edits when sorting', async () => {
  const f = fixture(),p=await f.paper(),target=f.archive.targetFor(f.format.documentSnapshot(p));
  await f.archive.save(f.record(p,'later',2,3),target);
  const note = f.archive.resolve(await target);
  note.setNote(note.getNote().replace('answer','manually edited answer')+'<p>personal tail</p>');
  const early=f.record(p,'early',1,4);
  await Promise.all([f.archive.save(early,target),f.archive.save(early,target)]);
  assert.match(note.getNote(),/manually edited answer/); assert.match(note.getNote(),/personal tail/);
  assert.deepEqual(f.format.recordsIn(f.archive.parse(note.getNote())).map(r=>r.meta.id).join(','),['early','later'].join(','));
  await f.archive.reorderCurrent('ended');
  assert.deepEqual(f.format.recordsIn(f.archive.parse(note.getNote())).map(r=>r.meta.id).join(','),['later','early'].join(','));
  assert.match(note.getNote(),/manually edited answer/);
});
test('retry reuses embedded images and does not store PDF text or image data URLs in note', async () => {
  const f=fixture(),p=await f.paper(),target=f.archive.targetFor(f.format.documentSnapshot(p));
  const note=f.archive.resolve(await target),original=note.save;
  const r=f.record(p);r.imageSnapshots=['data:image/png;base64,aGVsbG8='];r.fullTextAttachments=[{title:'paper',extractedChars:95320,state:'submitted'}];
  note.save=async()=>{throw new Error('disk failure');};
  await assert.rejects(f.archive.save(r,target),/disk failure/);
  note.save=original;
  await f.archive.retry(f.format.documentSnapshot(p));
  assert.equal(f.counts().imports,1);assert.match(note.getNote(),/data-attachment-key/);
  assert.doesNotMatch(note.getNote(),/base64/);assert.match(note.getNote(),/本次提交全部 95320 字符/);
});
test('deleted frozen target is never silently replaced on save', async () => {
  const f=fixture(),p=await f.paper(),doc=f.format.documentSnapshot(p),target=f.archive.targetFor(doc);
  f.archive.resolve(await target).deleted=true;
  await f.archive.targetFor(doc,true);
  await assert.rejects(f.archive.save(f.record(p),target),/原归档笔记已删除/);
});
test('damaged record boundaries preserve user content and report an actionable error', async()=>{
  const f=fixture(),p=await f.paper(),target=f.archive.targetFor(f.format.documentSnapshot(p));
  await f.archive.save(f.record(p),target);const note=f.archive.resolve(await target);
  note.setNote(note.getNote().replace(/<h6[^>]*>记录结束<\/h6>/,''));const before=note.getNote();
  await assert.rejects(f.archive.save(f.record(p,'r2'),target),/结束标题/);assert.equal(note.getNote(),before);
});
test('custom naming expands metadata, date fields, missing tags and sequence without recursive expansion',async()=>{
  const f=fixture(), settings={...f.format.settings(),archiveNameTimezone:'UTC'};
  const at=new Date('2026-09-25T01:02:03Z');
  assert.equal(f.format.noteName({},at,1,settings),'2026年09月25日01时02分');
  Object.assign(settings,{archiveNameTemplate:'{title}_ {tags}_ {author}_ {date}_{sequence}',archiveNameDate:'YYYY-MM-DD',archiveNameSequence:'3'});
  const p=await f.paper('Title {author}');p.getTags=()=>[{tag:'review'},{tag:'PDF'}];
  assert.equal(f.format.noteName(f.format.documentSnapshot(p),at,2,settings),'Title {author}_ review, PDF_ Author_ 2026-09-25_002');
  assert.equal(f.format.noteName({},at,2,settings),'_ _ _ 2026-09-25_002');
  assert.equal(f.format.noteName({},at,1,{...settings,archiveNameTemplate:'{YYYY}/{MM}/{DD} {HH}:{mm}:{ss}'}),'2026/09/25 01:02:03');
  assert.equal(f.format.noteName({},at,1,{...settings,archiveNameTemplate:'{unknown}'}),'{unknown}');
});
test('old naming presets migrate once and template edits win over legacy preferences',()=>{
  const f=fixture();f.prefs.set('extensions.zotagent.archiveNamePreset','authorYear');
  let settings=f.format.settings();settings.archiveNameTimezone='UTC';
  assert.equal(settings.archiveNameTemplate,'{author} {year} {date} {time}');
  assert.equal(f.format.noteName({author:'张',year:'2025'},new Date('2026-09-25T01:02:03Z'),1,settings),'张 2025 2026-09-25 01:02');
  f.prefs.set('extensions.zotagent.archiveNameTemplate','自定义 {tags}');
  assert.equal(f.format.settings().archiveNameTemplate,'自定义 {tags}');
  assert.equal(f.format.choices.archiveNamePreset,undefined);
});
test('Markdown export reads edited DOM and preserves tables, code, links and image paths',()=>{
  const f=fixture();const doc=f.archive.parse('<h1>Edited title</h1><p>user edits <strong>bold</strong> <a href="https://example.com">link</a></p><pre><code>a\n\n\nb</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p><img alt="截图" src="note_images/one.png"></p>');
  const md=f.Zotero.ZotAgent.archiveExport.toMarkdown(doc);
  assert.match(md,/# Edited title/);assert.match(md,/\*\*bold\*\*/);assert.match(md,/\| 1 \| 2 \|/);assert.match(md,/a\n\n\nb/);assert.match(md,/!\[截图\]\(note_images\/one.png\)/);
});

test('native legacy note wrapper preserves old records, sorting, and idempotency', async () => {
  const f=fixture(),p=await f.paper(),target=f.archive.targetFor(f.format.documentSnapshot(p));
  await f.archive.save(f.record(p,'late',2,3),target);
  const note=f.archive.resolve(await target);
  note.setNote('<div class="zotero-note znv1">'+note.getNote()+'</div>');
  await f.archive.save(f.record(p,'early',1,4),target);
  await f.archive.save(f.record(p,'late',2,3),target);
  assert.equal(f.format.recordsIn(f.archive.parse(note.getNote())).map(r=>r.meta.id).join(','),'early,late');
  await f.archive.reorderCurrent('ended');
  assert.equal(f.format.recordsIn(f.archive.parse(note.getNote())).map(r=>r.meta.id).join(','),'late,early');
});

async function childNote(f,parent,title='Existing note') {
  const note=new f.Zotero.Item('note');note.parentID=parent.id;note.libraryID=parent.libraryID;
  note.setNote('<h1>'+title+'</h1><p>My manual content</p>');await note.save();return note;
}
test('existing child notes are counted, selectable, and append keeps user content and in-flight destination',async()=>{
  const f=fixture(),p=await f.paper(),doc=f.format.documentSnapshot(p);
  const manual=await childNote(f,p),deleted=await childNote(f,p,'deleted');deleted.deleted=true;
  const other=await f.paper('Other'),foreign=await childNote(f,other);
  const original=await f.archive.targetFor(doc);
  assert.equal(f.archive.listNotes(doc).length,2);
  const next=f.archive.selectTarget(doc,manual.key);
  const nextQuestion=f.archive.targetFor(doc);
  assert.equal((await nextQuestion).noteKey,manual.key);
  await f.archive.save(f.record(p,'old-question'),original);
  await f.archive.save(f.record(p,'new-question'),next);
  assert.match(manual.getNote(),/My manual content/);
  assert.equal(f.format.recordsIn(f.archive.parse(manual.getNote()))[0].meta.id,'new-question');
  assert.equal(f.format.recordsIn(f.archive.parse(f.archive.resolve(original).getNote()))[0].meta.id,'old-question');
  assert.equal(f.archive.current(doc).noteKey,manual.key);
  await assert.rejects(f.archive.selectTarget(doc,foreign.key),/删除或移动/);
  await assert.rejects(f.archive.selectTarget(doc,deleted.key),/删除或移动/);
  assert.equal(f.archive.current(doc).noteKey,manual.key);
});
test('existing synced archive is discovered when device has no target mapping',async()=>{
  const f=fixture(),p=await f.paper(),doc=f.format.documentSnapshot(p);
  const earlier=await f.archive.targetFor(doc);await f.archive.save(f.record(p),earlier);
  f.prefs.delete('extensions.zotagent.archiveTargets');
  const before=f.counts().writes;
  assert.equal((await f.archive.targetFor(doc)).noteKey,earlier.noteKey);
  assert.equal(f.counts().writes,before);
});
test('all windows reflect selected target and renamed or removed child notes through Zotero notifier',async()=>{
  const f=fixture(),p=await f.paper(),doc=f.format.documentSnapshot(p);
  let observer,unregistered=false;
  f.Zotero.Notifier={registerObserver:o=>(observer=o,17),unregisterObserver:id=>{assert.equal(id,17);unregistered=true;}};
  const a=f.dialog(p),b=f.dialog(p);await f.archive.drain();
  const manual=await childNote(f,p);
  observer.notify();assert.match(a.archiveLabel.textContent,/2/);
  await f.archive.selectTarget(doc,manual.key);
  for(const dialog of [a,b])assert.equal(dialog.archiveSelect.value,manual.key);
  manual.setNote('<h1>Renamed by user</h1>');observer.notify();
  assert.match(a.archiveSelect.textContent,/Renamed by user/);
  manual.deleted=true;observer.notify();assert.doesNotMatch(a.archiveSelect.textContent,/Renamed by user/);
  a.destroy();assert.equal(unregistered,false);b.destroy();assert.equal(unregistered,true);
});
test('native color spans distinguish metadata while archive parsing and Markdown export keep labels',()=>{
  const f=fixture();const record={id:'styled',agent:'codex',status:'completed',submittedAt:1,endedAt:2,question:'Q',answer:'Answer',primaryDocument:{title:'Paper',link:'zotero://select/library/items/KEY'}};
  const html=f.format.renderRecord(record,[],text=>'<p>'+text+'</p>'),doc=f.archive.parse(html);
  assert.match(doc.querySelector('h2 span').getAttribute('style'),/color:/);
  assert.equal(f.format.recordsIn(doc).length,1);
  const md=f.Zotero.ZotAgent.archiveExport.toMarkdown(doc);
  for(const text of ['Agent · Codex','提问时间：','主文献：','Answer']) assert.ok(md.includes(text));
});

test('failed target selection restores the dropdown to the actual previous destination',async()=>{
  const f=fixture(),p=await f.paper(),dialog=f.dialog(p);await f.archive.drain();
  const doc=f.format.documentSnapshot(p),original=f.archive.current(doc);
  const manual=await childNote(f,p);dialog.updateArchiveBar();
  for(const option of dialog.archiveSelect.options) option.selected=option.value===manual.key;
  f.Zotero.Libraries.get=()=>({editable:false});
  dialog.archiveSelect.dispatchEvent(new f.window.document.defaultView.Event('change'));
  await f.archive.drain();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.archive.current(doc).noteKey,original.noteKey);
  assert.equal(dialog.archiveSelect.value,original.noteKey);
  assert.match(dialog.statusElement.textContent,/无法切换归档笔记/);
});

test('question and answer are framed as separate 1x1 tables that keep boundaries and export as plain Markdown',()=>{
  const f=fixture();
  const record={id:'framed',agent:'codex',status:'completed',submittedAt:1,endedAt:2,question:'Q',answer:'A\n\n| X | Y |\n| --- | --- |\n| 1 | 2 |',
    selection:'picked',selectionLabel:'p.3',primaryDocument:{title:'Paper',link:'zotero://select/library/items/KEY'}};
  const doc=f.archive.parse(f.format.renderRecord(record,['IMG'],f.Zotero.ZotAgent.utils.markdownToNoteHTML));
  const frames=[...f.format.noteBody(doc).children].filter(node=>node.localName==='table');
  assert.equal(frames.length,2);
  assert.match(frames[0].textContent,/问题[\s\S]*Q[\s\S]*picked/);
  assert.ok(frames[0].querySelector('img[data-attachment-key="IMG"]'));
  assert.match(frames[1].querySelector('h3').textContent,/回答/);
  assert.ok(frames[1].querySelector('td table'));
  assert.equal(f.format.recordsIn(doc).length,1);
  const md=f.Zotero.ZotAgent.archiveExport.toMarkdown(doc);
  assert.match(md,/^### .*问题/m);assert.match(md,/^### .*回答/m);assert.match(md,/^\| 1 \| 2 \|$/m);
  assert.doesNotMatch(md,/<br>|^\| .*问题/m);
});
