import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/plugin-fixture.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function openMenu(f, message) {
  message.element.dispatchEvent(new f.window.document.defaultView.Event('contextmenu', { bubbles: true, cancelable: true }));
  return f.window.document.querySelector('.zotagent-answer-menu');
}
test('right-click copy and insert use the selected answer rather than the latest one', async () => {
  const f=fixture(),d=f.dialog();
  d.addMessage('user','first question');const first=d.addMessage('assistant','first answer');
  d.addMessage('user','second question');d.addMessage('assistant','second answer');
  let copied,inserted;
  f.Zotero.Utilities={Internal:{copyTextToClipboard:text=>copied=text}};
  f.api.NoteService.insertIntoReaderCursor=(_reader,text)=>{inserted=text;return true;};
  assert.equal(d.element.querySelector('.zotagent-actions').textContent,'复制 Markdown插入光标保存子笔记历史');
  let menu=openMenu(f,first);
  assert.equal(menu.querySelectorAll('button').length,3);
  menu.querySelectorAll('button')[0].click();await tick();assert.equal(copied,'first answer');
  assert.equal(f.window.document.querySelector('.zotagent-answer-menu'),null);
  menu=openMenu(f,first);menu.querySelectorAll('button')[1].click();await tick();assert.equal(inserted,'first answer');
});
test('saving an old answer retains its original question and paper after context changes',async()=>{
  const f=fixture(),paper=await f.paper('original'),other=await f.paper('other'),d=f.dialog(paper);
  await f.archive.drain();
  d.addMessage('user','Question <literal>');const first=d.addMessage('assistant','# First answer');
  d.updateContext(other);await f.archive.drain();
  d.addMessage('user','wrong question');d.addMessage('assistant','wrong answer');
  openMenu(f,first).querySelectorAll('button')[2].click();
  assert.match(d.element.querySelector('.zotagent-save-confirm').textContent,/original/);
  d.element.querySelector('.zotagent-save-confirm button').click();await tick();
  const saved=[...f.items.values()].find(i=>i.isNote()&&i.getNote().includes('Question &lt;literal&gt;'));
  assert.ok(saved);assert.equal(saved.parentID,paper.id);
  const doc=f.archive.parse(saved.getNote());
  assert.equal(doc.querySelectorAll('table').length,2);
  assert.equal(doc.querySelector('h2').textContent,'用户问题');
  assert.equal(doc.querySelector('h3').textContent,'First answer');
  assert.doesNotMatch(saved.getNote(),/wrong question|wrong answer/);
});
test('missing original paper cannot silently save under a newly selected paper',async()=>{
  const f=fixture(),p=await f.paper(),d=f.dialog(p);d.addMessage('user','Q');const a=d.addMessage('assistant','A');
  p.deleted=true;d.updateContext(await f.paper('new'));
  await d.saveLastAnswer(a.item);assert.match(d.statusElement.textContent,/对应的文献已不存在/);
});
test('restored legacy messages infer their preceding question; explicit metadata survives restoration',async()=>{
  const f=fixture(),p=await f.paper(),d=f.dialog(p);
  const entry={agent:'codex',nativeSessionID:'session',documentKey:p.key,documentLibraryID:p.libraryID,
    messages:[{role:'user',text:'old question'},{role:'assistant',text:'old answer'},
      {role:'assistant',text:'retained answer',question:'explicit question',documents:[{key:p.key,libraryID:p.libraryID}]}]};
  Object.defineProperty(d.element.querySelector(".zotagent-agent-select"),"value",{value:"codex",writable:true});
  await d.restoreSession(entry);
  assert.equal(d.messages[1].question,'old question');assert.equal(d.messages[2].question,'explicit question');
});
test('menus close outside or on destruction, and empty answers disable all actions',()=>{
  const f=fixture(),d=f.dialog(),a=d.addMessage('assistant','');
  let menu=openMenu(f,a);assert.ok([...menu.querySelectorAll('button')].every(b=>b.disabled));
  f.window.document.body.dispatchEvent(new f.window.document.defaultView.Event('pointerdown',{bubbles:true}));
  assert.equal(f.window.document.querySelector('.zotagent-answer-menu'),null);
  openMenu(f,a);d.destroy();assert.equal(f.window.document.querySelector('.zotagent-answer-menu'),null);
});

test('automatic child-note saving and persisted history include the submitted question',async()=>{
  const f=fixture(),p=await f.paper(),d=f.dialog(p);
  f.prefs.set('extensions.zotagent.autoSaveNotes',true);
  d.promptInput.value='Actual submitted question';
  d.runtime.run=async(payload,onEvent)=>{
    onEvent({requestID:payload.requestID,type:'session.updated',nativeSessionID:'saved-session',data:{}});
    onEvent({requestID:payload.requestID,type:'message.delta',data:{text:'Actual response'}});
    return {status:'completed',endedAt:Date.now(),error:''};
  };
  await d.send();await f.archive.drain();
  const saved=[...f.items.values()].find(i=>i.isNote()&&i.getNote().startsWith('<h1>ZotAgent ·'));
  assert.ok(saved);assert.match(saved.getNote(),/Actual submitted question/);assert.match(saved.getNote(),/Actual response/);
  const messages=f.api.SessionHistory.load().find(e=>e.nativeSessionID==='saved-session').messages;
  assert.equal(messages.at(-1).question,'Actual submitted question');
  assert.equal(messages.at(-1).documents[0].key,p.key);
});

test('footer buttons keep operating on the latest answer while context menu selects older answers',async()=>{
  const f=fixture(),p=await f.paper(),d=f.dialog(p);
  d.addMessage('user','Q1');d.addMessage('assistant','A1');
  d.addMessage('user','Q2');d.addMessage('assistant','A2');
  let copied,inserted,saved;
  f.Zotero.Utilities={Internal:{copyTextToClipboard:text=>copied=text}};
  f.api.NoteService.insertIntoReaderCursor=(_reader,text)=>{inserted=text;return true;};
  f.api.NoteService.saveWithConfirmation=async(_dialog,_context,message)=>{saved=message;};
  const buttons=d.element.querySelectorAll('.zotagent-actions button');
  buttons[0].click();buttons[1].click();buttons[2].click();await tick();
  assert.equal(copied,'A2');assert.equal(inserted,'A2');
  assert.equal(saved.text,'A2');assert.equal(saved.question,'Q2');
});
