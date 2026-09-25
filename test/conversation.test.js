import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, deferred } from './helpers/plugin-fixture.js';
const tick = () => new Promise(resolve=>setTimeout(resolve,0));
function successfulRun(payload,onEvent) {
  onEvent({requestID:payload.requestID,windowID:payload.windowID,type:'input.submitted',data:{}});
  onEvent({requestID:payload.requestID,windowID:payload.windowID,type:'message.delta',data:{text:'complete answer'}});
  return Promise.resolve({status:'completed',endedAt:Date.now(),error:''});
}
test('all agents get all 95320 characters; note contains counts and no PDF body',async()=>{
  for (const agent of ['codex','claude-code','opencode']) {
    const f=fixture(),paper=await f.paper();const attachment=new f.Zotero.Item('attachment');await attachment.save();paper.attachments=[attachment.id];
    const pdf='文'.repeat(95320);f.Zotero.PDFWorker.getFullText=async()=>({text:pdf});
    const dialog=f.dialog(paper);dialog.agent=agent;dialog.fullTextCheckbox.checked=true;dialog.promptInput.value='summarize';
    let sent;
    dialog.runtime.run=async(p,cb)=>{sent=p;return successfulRun(p,cb);};
    await dialog.send();await f.archive.drain();
    assert.ok(sent.prompt.includes(pdf));assert.match(dialog.fullTextStatus.textContent,/提交全部 95320/);
    const note=f.archive.resolve(f.archive.current(f.format.documentSnapshot(paper)));
    assert.match(note.getNote(),/提交全部 95320/);assert.ok(!note.getNote().includes(pdf));assert.match(note.getNote(),/complete answer/);
  }
});
test('cancel during extraction prevents agent launch and writes interruption without an answer',async()=>{
  const f=fixture(),paper=await f.paper(),attachment=new f.Zotero.Item('attachment');await attachment.save();paper.attachments=[attachment.id];
  const extraction=deferred();f.Zotero.PDFWorker.getFullText=()=>extraction.promise;
  const dialog=f.dialog(paper);dialog.fullTextCheckbox.checked=true;dialog.promptInput.value='Q';let calls=0;
  dialog.runtime.run=async()=>{calls++;return {status:'completed'};};
  const sending=dialog.send();await dialog.stop();extraction.resolve({text:'full text'});await sending;await f.archive.drain();
  assert.equal(calls,0);const note=f.archive.resolve(f.archive.current(f.format.documentSnapshot(paper)));
  assert.match(note.getNote(),/用户中断时间/);assert.match(note.getNote(),/尚未收到具体回答/);
});
test('cancelled old output cannot overwrite a new request or finalize twice',async()=>{
  const f=fixture(),paper=await f.paper(),dialog=f.dialog(paper);dialog.promptInput.value='old';
  const gate=deferred();let oldCallback,oldPayload;
  dialog.runtime.run=async(p,cb)=>{oldPayload=p;oldCallback=cb;cb({requestID:p.requestID,type:'message.delta',data:{text:'partial'}});return gate.promise;};
  const old=dialog.send();await tick();await dialog.stop();
  dialog.promptInput.value='new';dialog.runtime.run=successfulRun;await dialog.send();
  oldCallback({requestID:oldPayload.requestID,type:'message.delta',data:{text:'SHOULD NOT APPEAR'}});
  gate.resolve({status:'completed',endedAt:Date.now()});await old;await f.archive.drain();
  const note=f.archive.resolve(f.archive.current(f.format.documentSnapshot(paper)));
  assert.equal(f.format.recordsIn(f.archive.parse(note.getNote())).length,2);
  assert.match(note.getNote(),/partial/);assert.match(note.getNote(),/complete answer/);assert.doesNotMatch(note.getNote(),/SHOULD NOT APPEAR/);
});
test('batch nonzero completion is failure, archived but not auto-saved as success',async()=>{
  const f=fixture(),p=await f.paper(),other=await f.paper('other'),dialog=f.dialog(p);f.prefs.set('extensions.zotagent.autoSaveNotes',true);
  dialog.extraItems=[{topItem:other,title:'other'}];dialog._multiMode='separate';dialog.promptInput.value='Q';
  let saved=0;f.api.NoteService.createChildNote=async()=>saved++;
  dialog.runtime.run=async(p,cb)=>{cb({requestID:p.requestID,type:'message.delta',data:{text:'partial failure'}});return {status:'failed',endedAt:Date.now(),error:'exit 1'};};
  await dialog.send();await f.archive.drain();
  assert.equal(saved,0);assert.match(dialog.statusElement.textContent,/0 成功, 2 失败/);
  const note=f.archive.resolve(f.archive.current(f.format.documentSnapshot(p)));assert.equal(f.format.recordsIn(f.archive.parse(note.getNote())).length,2);
});
test('unbound chat sends normally and does not create an archive',async()=>{
  const f=fixture(),dialog=f.dialog();dialog.promptInput.value='hello';dialog.runtime.run=successfulRun;
  await dialog.send();await f.archive.drain();assert.equal([...f.items.values()].filter(i=>i.isNote()).length,0);
  assert.match(dialog.archiveLabel.textContent,/本次不会自动归档/);
});
test('client cancellation while runtime starts prevents HTTP run',async()=>{
  const f=fixture(),gate=deferred(),client=new f.api.RuntimeClient(null);let calls=0;
  f.api.RuntimeManager.ensureRunning=()=>gate.promise;client.syncAgentPaths=async()=>{};f.context.fetch=async()=>{calls++;throw new Error('unexpected');};
  const promise=client.run({requestID:'r',windowID:'w'},()=>{});await client.cancel('r');gate.resolve();
  await assert.rejects(promise,/用户已中断/);assert.equal(calls,0);
});
test('client rejects oversized UTF-8 body before HTTP and never truncates',async()=>{
  const f=fixture(),client=new f.api.RuntimeClient(null);f.api.RuntimeManager.ensureRunning=async()=>{};client.syncAgentPaths=async()=>{};
  await assert.rejects(client.run({requestID:'r',prompt:'文'.repeat(1500000)},()=>{}),/4 MiB/);
});
test('client requires explicit successful terminal event, not just EOF',async()=>{
  const f=fixture(),client=new f.api.RuntimeClient(null);f.api.RuntimeManager.ensureRunning=async()=>{};client.syncAgentPaths=async()=>{};
  const reply=text=>({ok:true,body:{getReader:()=>{let first=true;return {read:async()=>first?(first=false,{value:new TextEncoder().encode(text),done:false}):{done:true}};}}});
  f.context.fetch=async()=>reply('');await assert.rejects(client.run({requestID:'r',windowID:'w'},()=>{}),/未收到完成事件/);
  f.context.fetch=async()=>reply(JSON.stringify({type:'request.completed',requestID:'r',windowID:'w',data:{code:1,stderr:'failed'}})+'\n');
  assert.equal((await client.run({requestID:'r',windowID:'w'},()=>{})).status,'failed');
});

test('restoring history rebinds its paper and clears stale selection and screenshots',async()=>{
  const f=fixture(),a=await f.paper('A'),b=await f.paper('B'),dialog=f.dialog(a);
  const select=dialog.element.querySelector('.zotagent-agent-select');Object.defineProperty(select,'value',{value:'codex',writable:true});
  dialog.selectionInput.value='selection A';dialog.capturedImage='old image';
  dialog.restoreSession({agent:'codex',nativeSessionID:'B-session',documentLibraryID:b.libraryID,documentKey:b.key});
  assert.equal(dialog.context.topItem.id,b.id);assert.equal(dialog.selectionInput.value,'');assert.equal(dialog.capturedImage,null);
  await f.archive.drain();assert.ok(f.archive.current(f.format.documentSnapshot(b)));
  dialog._requestState='running';dialog.restoreSession({agent:'codex',documentLibraryID:a.libraryID,documentKey:a.key});assert.equal(dialog.context.topItem.id,b.id);
});
test('locked main paper survives ambient selection changes until explicit history restore',async()=>{
  const f=fixture(),a=await f.paper('A'),b=await f.paper('B'),dialog=f.dialog(a);
  dialog.controller.getActiveContext=()=>({topItem:b,title:'B'});dialog.updateContext();assert.equal(dialog.context.topItem.id,a.id);
  await f.archive.drain();
});
test('client preserves stderr details for unsuccessful completion',async()=>{
  const f=fixture(),client=new f.api.RuntimeClient(null);f.api.RuntimeManager.ensureRunning=async()=>{};client.syncAgentPaths=async()=>{};
  const event={type:'request.completed',requestID:'r',windowID:'w',data:{code:7,stderr:'provider quota exhausted'}};
  f.context.fetch=async()=>({ok:true,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode(JSON.stringify(event)+'\n')})};}}});
  const result=await client.run({requestID:'r',windowID:'w'},()=>{});assert.equal(result.status,'failed');assert.match(result.error,/quota exhausted/);
});

test('nested CLI error remains failure even after exit zero and reaches the UI callback',async()=>{
  const f=fixture(),client=new f.api.RuntimeClient(null);f.api.RuntimeManager.ensureRunning=async()=>{};client.syncAgentPaths=async()=>{};
  const events=[{type:'error',requestID:'r',windowID:'w',data:{raw:{error:{data:{message:'Model unavailable'}}}}},{type:'request.completed',requestID:'r',windowID:'w',data:{code:0}}];
  let first=true;
  f.context.fetch=async()=>({ok:true,body:{getReader:()=>({read:async()=>first?(first=false,{value:new TextEncoder().encode(events.map(e=>JSON.stringify(e)).join('\n')),done:false}):{done:true}})}});
  const received=[];const result=await client.run({requestID:'r',windowID:'w'},e=>received.push(e));
  assert.equal(result.status,'failed');assert.equal(result.error,'Model unavailable');
  assert.equal(received[0].data.message,'Model unavailable');
});
test('selection clear still removes screenshot and text after archive toolbar restructuring',()=>{
  const f=fixture(),dialog=f.dialog();dialog.capturedImage='data:image/png;base64,aGVsbG8=';dialog.capturePreview.style.display='';dialog.selectionInput.value='selected PDF text';
  const clear=[...dialog.element.querySelectorAll('button')].find(b=>b.textContent==='清除');
  clear.click();assert.equal(dialog.capturedImage,null);assert.equal(dialog.selectionInput.value,'');assert.equal(dialog.capturePreview.style.display,'none');
  assert.equal(dialog.element.querySelector('.zotagent-model-bar'),null);
  assert.ok(dialog.element.querySelector('.zotagent-context-details').contains(dialog.selectionBox));
});

test('cannot open a competing native writer during an active structured request',async()=>{
  const f=fixture(),dialog=f.dialog();dialog._requestState='running';let starts=0;dialog.startPty=async()=>starts++;
  await dialog.togglePtyMode();assert.equal(starts,0);assert.match(dialog.statusElement.textContent,/等待当前回答结束/);
});
test('terminal mode blocks hidden structured sends and switches back with controls restored',async()=>{
  const f=fixture(),dialog=f.dialog();dialog.startPty=async()=>{};
  await dialog.togglePtyMode();assert.equal(dialog._ptyMode,true);assert.equal(dialog.sendButton.disabled,true);
  dialog.promptInput.value='do not send';let sends=0;dialog.runtime.run=async()=>sends++;
  await dialog.send();assert.equal(sends,0);assert.equal(dialog.promptInput.value,'do not send');
  await dialog.togglePtyMode();assert.equal(dialog._ptyMode,false);assert.equal(dialog.sendButton.disabled,false);
  assert.equal(dialog.modeToggle.textContent,'打开原生终端');
});
test('native session information identifies exact recovery context and the non-interactive picker',()=>{
  const f=fixture(),dialog=f.dialog();dialog.agent='codex';
  dialog.showTerminalInfo({nativeSessionID:'test-uuid',platform:'wsl',cwd:'/original/cwd',executable:'/bin/codex',wslDistro:'Ubuntu'});
  assert.match(dialog.terminalInfoText.textContent,/codex resume test-uuid/);
  assert.match(dialog.terminalInfoText.textContent,/--include-non-interactive/);
  assert.match(dialog.terminalInfoText.textContent,/\/original\/cwd/);
});
