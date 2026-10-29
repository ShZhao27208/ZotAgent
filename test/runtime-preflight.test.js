import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './helpers/plugin-fixture.js';
const delay = ms => new Promise(r=>setTimeout(r,ms));
async function setup(t,{slow=0,fail=false}={}) {
  const dir=await mkdtemp(path.join(tmpdir(),'zotagent-preflight-'));
  const executable=path.join(dir,'fake-opencode');
  await writeFile(executable,`#!${process.execPath}
const fs=require('fs'),path=require('path');const dir=${JSON.stringify(dir)};const args=process.argv.slice(2);
fs.appendFileSync(path.join(dir,'calls'),args[0]+'\\n');
if(args[0]==='models') { fs.writeFileSync(path.join(dir,'model-pid'),String(process.pid));setTimeout(()=>{${fail ? "console.error('provider directory unavailable');process.exit(2);" : "console.log('opencode/a\\nopencode/b');"}},${slow}); }
else if(args[0]==='debug') console.log('state '+dir);
else if(args[0]==='run') { fs.appendFileSync(path.join(dir,'runs'),JSON.stringify(args)+'\\n');console.log(JSON.stringify({type:'text',part:{text:'fixture answer'}})); }
else console.log('test-version');
`,{mode:0o755});
  await writeFile(path.join(dir,'model.json'),JSON.stringify({recent:[{providerID:'opencode',modelID:'a'}]}));
  const child=spawn(process.execPath,['runtime/src/index.js','--port','0','--token','preflight-test'],{cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,ZOTAGENT_DATA_DIR:path.join(dir,'data')},stdio:['ignore','ignore','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  let log='';child.stderr.on('data',c=>log+=c);
  for(let i=0;i<150&&!log.includes('listening on');i++)await delay(20);
  const port=log.match(/127\.0\.0\.1:(\d+)/)?.[1];assert.ok(port,log);
  const request=(route,body,signal)=>fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{authorization:'Bearer preflight-test','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal});
  assert.equal((await request('/v1/config/agents',{executables:{opencode:executable}})).status,200);
  const run=(id,extra={},signal)=>request('/v1/run',{agent:'opencode',requestID:id,windowID:'window',prompt:'hello',cwd:dir,...extra},signal);
  const events=async response=>(await response.text()).trim().split('\n').map(JSON.parse);
  const waitModels=async()=>{for(let i=0;i<150&&!existsSync(path.join(dir,'model-pid'));i++)await delay(20);assert.ok(existsSync(path.join(dir,'model-pid')));};
  return {dir,request,run,events,waitModels,child};
}
const options={skip:process.platform==='win32',timeout:25000};
test('slow preparation exceeds former 10s limit but headers arrive immediately and run completes',options,async t=>{
  const f=await setup(t,{slow:11000});const start=Date.now();
  const response=await f.run('slow');assert.ok(Date.now()-start<3000,'response headers blocked by preparation');
  const health=await(await f.request('/v1/health')).json();assert.equal(health.preparingRequests,1);assert.equal(health.runningRequests,1);
  assert.equal((await f.request('/v1/runtime/stop',{instanceID:health.instanceID})).status,409);
  const events=await f.events(response);assert.equal(events[0].type,'request.preparing');assert.equal(events.at(-1).type,'request.completed');assert.equal(events.at(-1).data.code,0);
  assert.ok(Date.now()-start>=11000);assert.ok(events.every(e=>e.requestID==='slow'&&e.windowID==='window'));
});
test('preparation failure is a scoped error followed by explicit completion',options,async t=>{
  const f=await setup(t,{fail:true});const events=await f.events(await f.run('failed'));
  assert.match(events.find(e=>e.type==='error').data.message,/provider directory unavailable/);
  assert.equal(events.at(-1).data.code,1);assert.ok(events.every(e=>e.requestID==='failed'&&e.windowID==='window'));
  assert.equal(existsSync(path.join(f.dir,'runs')),false);
});
test('cancel during preparation terminates discovery and never starts Agent',options,async t=>{
  const f=await setup(t,{slow:15000});const response=await f.run('cancel');await f.waitModels();
  assert.equal((await f.request('/v1/requests/cancel/cancel',{})).status,202);
  const events=await f.events(response);assert.match(events.find(e=>e.type==='error').data.message,/中断/);assert.equal(events.at(-1).data.code,1);
  const pid=Number(await readFile(path.join(f.dir,'model-pid'),'utf8'));
  for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{break;}await delay(20);}
  assert.throws(()=>process.kill(pid,0));assert.equal(existsSync(path.join(f.dir,'runs')),false);
  assert.equal((await(await f.request('/v1/health')).json()).runningRequests,0);
});
test('disconnected preparation cannot launch an orphan Agent',options,async t=>{
  const f=await setup(t,{slow:15000});const controller=new AbortController();const response=await f.run('disconnect',{},controller.signal);await f.waitModels();controller.abort();
  await assert.rejects(response.text());
  for(let i=0;i<100;i++){if(!(await(await f.request('/v1/health')).json()).runningRequests)break;await delay(20);}
  assert.equal((await(await f.request('/v1/health')).json()).runningRequests,0);assert.equal(existsSync(path.join(f.dir,'runs')),false);
});
test('concurrent model preparation shares discovery while cancelling only one subscriber',options,async t=>{
  const f=await setup(t,{slow:800});const a=await f.run('a'),b=await f.run('b');await f.waitModels();
  await f.request('/v1/requests/a/cancel',{});
  assert.equal((await f.events(a)).at(-1).data.code,1);assert.equal((await f.events(b)).at(-1).data.code,0);
  await writeFile(path.join(f.dir,'model.json'),JSON.stringify({recent:[{providerID:'opencode',modelID:'b'}]}));
  await f.events(await f.run('new-recent'));
  const calls=(await readFile(path.join(f.dir,'calls'),'utf8')).split('\n');assert.equal(calls.filter(x=>x==='models').length,1);assert.equal(calls.filter(x=>x==='debug').length,1);
  const runs=(await readFile(path.join(f.dir,'runs'),'utf8')).trim().split('\n').map(JSON.parse);assert.ok(runs[1].includes('opencode/b'));
  assert.equal((await f.request('/v1/opencode/models?refresh=1')).status,200);
  assert.equal((await readFile(path.join(f.dir,'calls'),'utf8')).split('\n').filter(x=>x==='models').length,2);
});
test('explicit model skips recent path discovery and preparing sessions are reserved',options,async t=>{
  const f=await setup(t,{slow:500});const first=await f.run('first',{model:'opencode/a',nativeSessionID:'same'});
  assert.equal((await f.run('second',{nativeSessionID:'same'})).status,400);
  assert.equal((await f.events(first)).at(-1).data.code,0);
  assert.ok(!(await readFile(path.join(f.dir,'calls'),'utf8')).includes('debug'));
});
test('matching protocol but stale or missing build fingerprint is rejected by plugin',async()=>{
  const f=fixture();f.Zotero.ZotAgent._runtimeBuildID='a'.repeat(64);const manager=f.api.RuntimeManager;
  for(const buildID of [undefined,'b'.repeat(64),'a'.repeat(64)]) {
    manager.request=async()=>({ok:true,json:async()=>({platform:'wsl',protocolVersion:8,buildID})});
    assert.equal(await manager.probe(),buildID==='a'.repeat(64)?'running':'outdated');
  }
});

test('force stop during preparation aborts discovery without running Agent',options,async t=>{
  const f=await setup(t,{slow:15000});const response=await f.run('stop');await f.waitModels();
  const health=await(await f.request('/v1/health')).json();
  assert.equal((await f.request('/v1/runtime/stop',{instanceID:health.instanceID,force:true})).status,202);
  const events=await f.events(response);assert.equal(events.at(-1).data.code,1);assert.equal(existsSync(path.join(f.dir,'runs')),false);
});

test('approval endpoint does not cancel a preparing request',options,async t=>{
  const f=await setup(t,{slow:500});const response=await f.run('approve');
  assert.equal((await f.request('/v1/requests/approve/approve',{approved:true})).status,404);
  assert.equal((await f.events(response)).at(-1).data.code,0);
});

test('Runtime fingerprint ignores Windows line endings but detects changed source',async t=>{
  const {runtimeBuildID}=await import('../runtime/src/runtime-identity.js');
  const dir=await mkdtemp(path.join(tmpdir(),'zotagent-identity-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=path.join(dir,'index.js');await writeFile(source,'const version = 1;\n');const original=runtimeBuildID(dir);
  await writeFile(source,'const version = 1;\r\n');assert.equal(runtimeBuildID(dir),original);
  await writeFile(source,'const version = 2;\r\n');assert.notEqual(runtimeBuildID(dir),original);
});
