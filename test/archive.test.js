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
test('name defaults, custom fields, timezone and missing metadata are deterministic',()=>{
  const f=fixture();const settings=f.format.settings();settings.archiveNameTimezone='UTC';
  assert.equal(f.format.noteName({},new Date('2026-09-25T01:02:03Z'),1,settings),'2026年09月25日01时02分');
  Object.assign(settings,{archiveNamePreset:'custom',archiveNameDate:'YYYY-MM-DD',archiveNameTime:'',archiveNameDocument:'authorYear',archiveNameSeparator:'_',archiveNameOrder:'documentFirst',archiveNameSequence:'3'});
  assert.equal(f.format.noteName({author:'张',year:'2025'},new Date('2026-09-25T01:02:03Z'),2,settings),'张 2025_2026-09-25_002');
  for(const [preset] of f.format.choices.archiveNamePreset[2]) assert.doesNotMatch(f.format.noteName({},new Date(),1,{...settings,archiveNamePreset:preset}),/undefined|null/);
});
test('Markdown export reads edited DOM and preserves tables, code, links and image paths',()=>{
  const f=fixture();const doc=f.archive.parse('<h1>Edited title</h1><p>user edits <strong>bold</strong> <a href="https://example.com">link</a></p><pre><code>a\n\n\nb</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p><img alt="截图" src="note_images/one.png"></p>');
  const md=f.Zotero.ZotAgent.archiveExport.toMarkdown(doc);
  assert.match(md,/# Edited title/);assert.match(md,/\*\*bold\*\*/);assert.match(md,/\| 1 \| 2 \|/);assert.match(md,/a\n\n\nb/);assert.match(md,/!\[截图\]\(note_images\/one.png\)/);
});
