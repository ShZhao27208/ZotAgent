import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeInvocation,createAgentLauncher } from '../runtime/src/agent-launch.js';
import { loadConfig } from '../runtime/src/config.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zotagent-cli-'));
const checks=[], reports=[];
const record=name=>{checks.push(name);console.log('PASS '+name);};
let child;
try {
  const config=loadConfig();const launcher=createAgentLauncher(config);
  for(const agent of ['opencode','codex','claude-code']) {
    const location=await launcher.resolve(agent);
    const command=nativeInvocation(location.executable,['--version'],agent,config.shell);
    try {
      const result=await promisify(execFile)(command.command,command.args,{timeout:15000,windowsHide:true,windowsVerbatimArguments:command.windowsVerbatimArguments});
      reports.push({agent,executable:location.executable,command:command.command,version:result.stdout.trim()});
      record('installed Windows '+agent+' version check');
    } catch(error) {
      reports.push({agent,available:false,error:error.message});
      if(agent==='opencode') throw error;
    }
  }
  // Runtime and native dependencies are copied into this test's temp directory.
  await fs.cp(path.join(root,'build/runtime'),path.join(temp,'runtime'),{recursive:true});
  const fake=path.join(temp,'fake agent.cjs');await fs.copyFile(path.join(root,'scripts/fake-agent.cjs'),fake);
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const token='isolated-smoke-token';
  child=spawn(process.execPath,[path.join(temp,'runtime/src/index.js'),'--port',String(port),'--token',token],{cwd:temp,env:{...process.env,ZOTAGENT_DATA_DIR:path.join(temp,'data')},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  for(let i=0;i<150&&!stderr.includes('listening on');i++) { if(child.exitCode!==null)throw new Error(stderr);await new Promise(r=>setTimeout(r,100)); }
  assert.match(stderr,/listening on/);
  const headers={authorization:'Bearer '+token,'content-type':'application/json'};
  const request=(route,body)=>fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
  const configure=async(platform,executable)=>{const response=await request('/v1/config/agents',{platforms:Object.fromEntries(['opencode','codex','claude-code'].map(a=>[a,platform])),executables:Object.fromEntries(['opencode','codex','claude-code'].map(a=>[a,executable])),wslDistro:'Ubuntu'});assert.equal(response.status,200,await response.text());};
  const hash=input=>createHash('sha256').update(input).digest('hex');
  const prompt='## Zotero 文献上下文\n'+ '文😀'.repeat(95320)+'\n## 用户问题\n完整保留尾部 %PATH% & | "quotes" `tick` $(not_a_command)';
  async function run(agent,extra={}) {
    const response=await request('/v1/run',{windowID:'smoke',requestID:crypto.randomUUID(),agent,prompt,cwd:temp,...extra});
    assert.equal(response.status,200,await (response.ok?Promise.resolve(''):response.text()));
    const events=(await response.text()).trim().split('\n').map(JSON.parse);
    const completion=events.find(e=>e.type==='request.completed');assert.ok(completion);
    return {events,completion,text:events.filter(e=>e.type==='message.delta').map(e=>e.data.text).join('')};
  }
  await configure('windows',fake);
  for(const agent of ['opencode','codex','claude-code']) {
    const result=await run(agent);assert.equal(result.completion.data.code,0);
    const received=JSON.parse(result.text);assert.equal(received.sha256,hash(prompt));assert.equal(received.bytes,Buffer.byteLength(prompt));assert.ok(!received.args.includes(prompt));
    assert.equal(result.events.filter(e=>e.type==='input.submitted').length,1);
    record('Windows '+agent+' complete multiline stdin and submission event');
  }
  const screenshot='data:image/png;base64,aGVsbG8=';
  const result=await run('opencode',{image:screenshot});const received=JSON.parse(result.text);assert.equal(received.files[0].exists,true);
  await assert.rejects(fs.access(received.files[0].file));record('Windows screenshot available during request and cleaned after exit');
  const failure=await run('opencode',{prompt:'FAIL_TEST',image:screenshot});assert.equal(failure.completion.data.code,1);assert.match(failure.completion.data.stderr,/specific fake CLI failure/);record('failed CLI preserves stdout diagnostic');
  assert.deepEqual(await fs.readdir(path.join(temp,'data/tmp')),[]);record('failed request cleans its screenshot');
  const claude=await run('claude-code',{image:screenshot});const input=JSON.stringify({type:'user',message:{role:'user',content:[{type:'text',text:prompt},{type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}}]}})+'\n';
  assert.equal(JSON.parse(claude.text).sha256,hash(input));record('Claude structured screenshot and complete text reach stdin');
  const cancelID=crypto.randomUUID();const response=await request('/v1/run',{windowID:'smoke',requestID:cancelID,agent:'opencode',cwd:temp,prompt:'CANCEL_TEST',image:screenshot});
  const reader=response.body.getReader();let stream='';while(!stream.includes('partial answer')) {const chunk=await reader.read();assert.ok(!chunk.done);stream+=new TextDecoder().decode(chunk.value);}
  assert.equal((await request(`/v1/requests/${cancelID}/cancel`,{})).status,202);
  while(true){const chunk=await reader.read();if(chunk.done)break;stream+=new TextDecoder().decode(chunk.value);}
  assert.match(stream,/request.completed/);assert.deepEqual(await fs.readdir(path.join(temp,'data/tmp')),[]);record('cancel retains partial output and removes owned image');
  assert.equal((await request('/v1/run',{agent:'opencode',prompt:'x'.repeat(4*1024*1024)})).status,400);record('oversized body rejected without killing Runtime');
  if(process.argv[2]) {
    await configure('wsl',process.argv[2]);
    for(const agent of ['opencode','codex','claude-code']) {const result=await run(agent);assert.equal(result.completion.data.code,0,JSON.stringify(result.events));assert.equal(JSON.parse(result.text).sha256,hash(prompt));record('Windows Runtime to WSL '+agent+' complete stdin');}
    const result=await run('opencode',{image:screenshot});const received=JSON.parse(result.text);assert.equal(received.files[0].exists,true);assert.match(received.files[0].file,/^\/mnt\//);record('WSL reads Windows screenshot through converted path');
  }
  console.log(JSON.stringify({ok:true,checks,reports},null,2));
} finally {
  if(child && child.exitCode===null) {child.kill();await new Promise(resolve=>child.once('close',resolve));}
  await fs.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
