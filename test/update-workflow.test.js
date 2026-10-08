import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './helpers/plugin-fixture.js';
import { parseModels, recentModel, selectModel, createModelCatalog } from '../runtime/src/opencode-models.js';
import { createAgentLauncher, nativePlatform } from '../runtime/src/agent-launch.js';

test('OpenCode model IDs and recent choice are validated without default fallback', () => {
  const models = parseModels('warning\n\x1b[32mopencode/space-bunny-free\x1b[0m\nopencode/space-bunny-free\nopencode/mimo-v2.6-flash-free\n');
  assert.deepEqual(models,['opencode/space-bunny-free','opencode/mimo-v2.6-flash-free']);
  const recent=recentModel('{"recent":[{"providerID":"opencode","modelID":"space-bunny-free"}]}');
  assert.equal(selectModel(models,'',recent),recent);
  assert.equal(selectModel(models,models[1],null),models[1]);
  assert.throws(()=>selectModel(models,'',null,'permission denied'),/permission denied/);
  assert.throws(()=>selectModel(models,'','opencode/removed'),/不在当前可用列表/);
  assert.throws(()=>selectModel(models,'opencode/Bunny Space Free',recent),/重新选择/);
  assert.throws(()=>recentModel('{"recent":[]}'),/没有最近/);
});

test('catalog follows executable state path, reads changed recent record and preserves literal cwd', async t => {
  const directory=await mkdtemp(path.join(tmpdir(),"zotagent models ' "));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const executable=path.join(directory,'fake-opencode');
  await writeFile(executable,`#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2);if(args[0]==='models')console.log('opencode/a\\nopencode/b');else if(args[0]==='debug')console.log('state      '+process.cwd());`,{mode:0o755});
  const launcher=createAgentLauncher({shell:{name:'bash'},defaultCwd:directory,platforms:{opencode:nativePlatform},executables:{opencode:executable}});
  const location=await launcher.resolve('opencode'),catalog=createModelCatalog(launcher);
  for(const model of ['a','b']) {
    await writeFile(path.join(directory,'model.json'),JSON.stringify({recent:[{providerID:'opencode',modelID:model}]}));
    assert.equal((await catalog(location)).recent,`opencode/${model}`);
  }
  await rm(path.join(directory,'model.json'));
  const missing=await catalog(location);assert.equal(missing.recent,null);assert.match(missing.recentError,/ENOENT/);
});

test('bulk full text only changes attachment selection and Enter respects IME and Shift',async()=>{
  const f=fixture(),p=await f.paper(),d=f.dialog(p);d.extraItems=[{topItem:await f.paper('B'),title:'B',includeFullText:false}];
  let sent=0;d.send=()=>sent++;
  d.setAllFullText(true);assert.equal(d.fullTextCheckbox.checked,true);assert.equal(d.extraItems[0].includeFullText,true);assert.equal(sent,0);
  d.setAllFullText(false);assert.equal(d.extraItems[0].includeFullText,false);
  for(const options of [{shiftKey:true},{isComposing:true},{keyCode:229},{repeat:true},{}]) {
    const event=f.window.document.createEvent('Event');event.initEvent('keydown',true,true);Object.assign(event,{key:'Enter',...options});d.promptInput.dispatchEvent(event);
    assert.equal(event.defaultPrevented,Object.keys(options).length===0);
  }
  assert.equal(sent,1);
});

test('PDF exports use active main PDF, preferred reference PDF, unique names and isolate failures',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'zotagent-export-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const f=fixture(),p=await f.paper('Same title'),q=await f.paper('Same title'),bad=await f.paper('Missing');
  const attachment=async()=>{const a=new f.Zotero.Item('attachment');await a.save();return a;};
  const active=await attachment(),best=await attachment(),wrong=await attachment();
  p.attachments=[active.id];p.getBestAttachment=async()=>wrong;q.attachments=[wrong.id,best.id];q.getBestAttachment=async()=>best;
  const d=f.dialog(p);let extracted=[];f.Zotero.PDFWorker.getFullText=async id=>{extracted.push(id);return {text:'FULL '+id};};
  class File {
    constructor(p){this.path=p;} clone(){return new File(this.path);} append(name){this.path=path.join(this.path,name);} exists(){return fs.existsSync(this.path);} remove(){fs.unlinkSync(this.path);}
    createUnique(){const base=this.path;for(let n=1;;n++){this.path=n===1?base:base.replace(/\.md$/,`-${n}.md`);try{fs.closeSync(fs.openSync(this.path,'wx'));break;}catch(e){if(e.code!=='EEXIST')throw e;}}}
  }
  f.context.Components={interfaces:{nsIFile:{NORMAL_FILE_TYPE:0}}};
  f.Zotero.File={pathToFile:p=>new File(p),getValidFileName:s=>s,putContentsAsync:(file,text)=>writeFile(file.path,text)};
  await writeFile(path.join(dir,'Same title.md'),'existing');
  const result=await d.exportPDFTexts([d.context,{topItem:q,title:'Same title',attachment:wrong},{topItem:bad,title:'Missing'}],dir);
  assert.equal(result.saved.length,2);assert.equal(result.failed.length,1);assert.deepEqual(extracted,[active.id,best.id]);
  assert.equal(await readFile(path.join(dir,'Same title.md'),'utf8'),'existing');
  assert.match(await readFile(result.saved[1],'utf8'),new RegExp('FULL '+best.id));
});

test('manual Runtime stop verifies ownership and prevents auto-start until explicit start',async()=>{
  const f=fixture(),m=f.api.RuntimeManager;let calls=0;
  m.request=async route=>{calls++;if(route==='/v1/runtime/stop')return {ok:true};if(calls>2)throw new Error('connection refused');return {ok:true,json:async()=>({service:'zotagent',instanceID:'owned',activeRequests:[],activeTerminals:[]})};};
  assert.equal(await m.stop({confirm:()=>true}),true);
  await assert.rejects(m.ensureRunning(true),/已手动停止/);
  m._ensureRunning=async()=>({status:'disabled'});await m.start();assert.equal(m._manualStopped,false);
  m.request=async()=>({ok:true,json:async()=>({service:'other'})});await assert.rejects(m.stop({}),/不支持安全停止/);
});

test('stop endpoint requires auth and instance ID and releases its listener',async t=>{
  const child=spawn(process.execPath,['runtime/src/index.js','--port','0','--token','test-stop'],{cwd:path.resolve(import.meta.dirname,'..'),stdio:['ignore','ignore','pipe']});
  t.after(()=>child.kill());
  let log='';child.stderr.on('data',chunk=>log+=chunk);
  for(let i=0;i<100&&!log.includes('listening on');i++)await new Promise(r=>setTimeout(r,20));
  const port=log.match(/127\.0\.0\.1:(\d+)/)?.[1];assert.ok(port&&port!=='0',log);
  const url=`http://127.0.0.1:${port}`,headers={authorization:'Bearer test-stop','content-type':'application/json'};
  const health=await(await fetch(url+'/v1/health',{headers})).json();assert.equal(health.service,'zotagent');
  assert.equal((await fetch(url+'/v1/runtime/stop',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(url+'/v1/runtime/stop',{method:'POST',headers,body:'{}'})).status,409);
  const exited=once(child,'exit');
  assert.equal((await fetch(url+'/v1/runtime/stop',{method:'POST',headers,body:JSON.stringify({instanceID:health.instanceID})})).status,202);
  await exited;await assert.rejects(fetch(url+'/v1/health',{headers}));
});

test('busy Runtime stop cancellation leaves service and automatic startup unchanged',async()=>{
  const f=fixture(),m=f.api.RuntimeManager;let requests=0,confirmation='';
  m.request=async()=>{requests++;return {ok:true,json:async()=>({service:'zotagent',instanceID:'owned',activeRequests:[{agent:'opencode',requestID:'busy'}]})};};
  assert.equal(await m.stop({confirm:message=>{confirmation=message;return false;}}),false);
  assert.match(confirmation,/opencode · busy/);assert.equal(requests,1);assert.notEqual(m._manualStopped,true);
});

test('missing explicit agent path fails instead of falling back to installed CLI',async()=>{
  const launcher=createAgentLauncher({platforms:{opencode:nativePlatform},executables:{opencode:'/nonexistent/zotagent/opencode'},defaultCwd:process.cwd()});
  await assert.rejects(launcher.resolve('opencode'),/手动配置.*路径无效/);
});

test('content fitting grows for references, stays within viewport and respects minimization',()=>{
  const f=fixture(),d=f.dialog();f.window.innerWidth=1000;f.window.innerHeight=1000;
  d.element.getBoundingClientRect=()=>({left:700,top:600,width:460,height:680});
  for(const child of d.element.children) child.getBoundingClientRect=()=>({height:30});
  const region=d.element.querySelector('.zotagent-context-details');
  Object.defineProperty(region,'scrollHeight',{value:600,configurable:true});
  Object.defineProperty(d.messagesElement,'scrollHeight',{value:100,configurable:true});
  d.extraItems=Array.from({length:12},()=>({}));d.fitContent();
  assert.equal(d.element.style.width,'520px');
  assert.ok(parseFloat(d.element.style.height)>680);
  assert.ok(parseFloat(d.element.style.left)+parseFloat(d.element.style.width)<=988);
  assert.ok(parseFloat(d.element.style.top)+parseFloat(d.element.style.height)<=988);
  f.window.innerWidth=400;f.window.innerHeight=500;d.fitContent();
  assert.equal(d.element.style.width,'376px');assert.equal(d.element.style.height,'476px');
  const size=d.element.style.height;d.element.classList.add('is-minimized');f.window.innerHeight=900;d.fitContent();assert.equal(d.element.style.height,size);
});

test('manual sizing pauses automatic fitting and remains authoritative after release',()=>{
  const f=fixture(),d=f.dialog();f.window.innerWidth=1000;f.window.innerHeight=1000;
  let rect={left:30,top:30,width:460,height:680};d.element.getBoundingClientRect=()=>rect;
  for(const child of d.element.children) child.getBoundingClientRect=()=>({height:30});
  Object.defineProperty(d.element.querySelector('.zotagent-context-details'),'scrollHeight',{value:900});
  f.window.requestAnimationFrame=()=>1;f.window.cancelAnimationFrame=()=>{};
  d.installAutoFit();d._beginManualFit();
  rect={...rect,width:350,height:450};const before=d.element.style.cssText;d.fitContent();assert.equal(d.element.style.cssText,before);
  d._rememberManualSize();d.extraItems=Array.from({length:40},()=>({}));d.fitContent();
  assert.equal(d.element.style.width,'350px');assert.equal(d.element.style.height,'450px');
  for(let i=0;i<10;i++)d.fitContent();assert.equal(d.element.style.height,'450px');
  d.destroy();
});
