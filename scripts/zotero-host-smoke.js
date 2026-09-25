// Loaded only by the isolated Windows host test package, never by production.
(async function () {
  const checks = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const output = Services.prefs.getStringPref('extensions.zotagent.testOutput');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const A = Zotero.ZotAgent;
  try {
    await Zotero.uiReadyPromise;
    const win = Zotero.getMainWindow();
    const paper = new Zotero.Item('journalArticle');
    paper.libraryID = Zotero.Libraries.userLibraryID;
    paper.setField('title', 'ZotAgent isolated archive verification'); paper.setField('date', '2026');
    await paper.saveTx();
    const document = A.archiveFormat.documentSnapshot(paper);
    const [target, same] = await Promise.all([A.archive.targetFor(document), A.archive.targetFor(document)]);
    assert(target.noteKey === same.noteKey, 'concurrent creation shares one native note');
    const note = A.archive.resolve(target);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    const record = (id, asked, ended) => ({id,submittedAt:asked,endedAt:ended,agent:'claude-code',status:'completed',question:'Test **question**',answer:'## Answer\n\nvisible answer\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',primaryDocument:document,references:[],imageSnapshots:[],fullTextAttachments:[]});
    const first = record('host-first',1000,4000); first.imageSnapshots=[png];
    first.fullTextAttachments=[{title:document.title,extractedChars:95320,state:'submitted'}];
    await A.archive.save(first,Promise.resolve(target));
    await A.archive.save(record('host-second',2000,3000),Promise.resolve(target));
    const html = note.getNote();
    const parsed = A.archive.parse(html);
    assert(A.archiveFormat.recordsIn(parsed).length===2,'native note stores both completed records');
    const key=parsed.querySelector('img').getAttribute('data-attachment-key');
    const image=Zotero.Items.getByLibraryAndKey(note.libraryID,key);
    assert(image.parentID===note.id && await image.getFilePathAsync(),'embedded screenshot is a native image attachment');
    assert(!html.includes('base64,'),'note has no temporary image or inline base64 dependency');
    const editor=await Zotero.Notes.open(note.id);
    for(let i=0;i<100&&!editor?._iframeWindow?.wrappedJSObject?.getDataSync(false);i++) await pause(100);
    const data=editor._iframeWindow.wrappedJSObject.getDataSync(false);
    assert(A.archiveFormat.recordsIn(A.archive.parse(data.html)).length===2,'record IDs survive real note-editor schema serialization');
    await editor._save(JSON.parse(JSON.stringify(data)));
    editor._postMessage({action:'insertHTML',pos:null,html:'<p>MANUAL EDIT PRESERVED</p>'});
    await pause(1500);
    await A.archive.flushEditors(note);
    assert(note.getNote().includes('MANUAL EDIT PRESERVED'),'native editor manual change saved');
    await A.archive.reorderCurrent('ended');
    await pause(800);
    assert(note.getNote().includes('MANUAL EDIT PRESERVED'),'sort retains manual change');
    assert(A.archiveFormat.recordsIn(A.archive.parse(note.getNote()))[0].meta.id==='host-second','completion-time sort works in Zotero');
    await A.archive.save(record('host-third',3000,5000),Promise.resolve(target));
    assert(note.getNote().includes('MANUAL EDIT PRESERVED'),'later request does not overwrite manual edit');
    const destination=Zotero.File.pathToFile(output).parent; destination.append('exported.md');
    await A.archiveExport.writeNote(target,destination);
    const markdown=await Zotero.File.getContentsAsync(destination);
    assert(markdown.includes('MANUAL EDIT PRESERVED') && markdown.includes('_images/'),'Markdown export contains edited text and relative image link');
    const newTarget=await A.archive.targetFor(document,true);
    await A.archive.save(record('host-old-late',4000,6000),Promise.resolve(target));
    assert(A.archiveFormat.recordsIn(A.archive.parse(note.getNote())).some(r=>r.meta.id==='host-old-late'),'late answer stays in old native note after rotation');
    assert(A.archiveFormat.recordsIn(A.archive.parse(A.archive.resolve(newTarget).getNote())).length===0,'new note is not polluted by old request');
    // Exercise the real plugin DOM without making any Agent/model request.
    const controller=A.controllers.get(win);
    const getContext=controller.getActiveContext;
    controller.getActiveContext=()=>({topItem:paper,title:document.title});
    const dialog=controller.addDialog(); controller.getActiveContext=getContext;
    dialog.promptInput.value='Native dialog question';
    dialog.runtime.run=async(payload,callback)=>{
      callback({type:'message.delta',requestID:payload.requestID,windowID:payload.windowID,data:{text:'Native dialog answer'}});
      return {status:'completed',endedAt:Date.now(),error:''};
    };
    await dialog.send(); await A.archive.drain();
    assert(A.archive.resolve(newTarget).getNote().includes('Native dialog answer'),'real dialog automatically archives its answer');
    dialog.destroy();
    await Zotero.File.putContentsAsync(output,JSON.stringify({ok:true,zoteroVersion:Zotero.version,checks},null,2));
  } catch(error) {
    await Zotero.File.putContentsAsync(output,JSON.stringify({ok:false,zoteroVersion:Zotero.version,checks,error:String(error),stack:error.stack},null,2));
  } finally {
    setTimeout(()=>Services.startup.quit(Components.interfaces.nsIAppStartup.eForceQuit),500);
  }
})();
