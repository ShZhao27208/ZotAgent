import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

// All agents below are a local fixture, never a real provider/CLI invocation.
for (const agent of ['claude-code','codex']) test(`Runtime opens ${agent} picker and reserves its sessions across windows`, {timeout:15000,skip:process.platform==='win32'}, async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'zotagent-resume-'));
  const executable=path.join(directory,'fake-agent');
  await writeFile(executable,`#!${process.execPath}\nconsole.log(JSON.stringify({type:'fixture.ready',args:process.argv.slice(2),session_id:'fixture-session',entrypoint:process.env.CLAUDE_CODE_ENTRYPOINT}));\nprocess.stdin.resume();\nsetInterval(()=>{},1000);\n`,{mode:0o755});
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['runtime/src/index.js','--port',String(port),'--token','fixture-token'],{
    cwd:path.resolve(import.meta.dirname,'..'),env:{...process.env,ZOTAGENT_DATA_DIR:path.join(directory,'data')},stdio:['ignore','ignore','pipe']
  });
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(directory,{recursive:true,force:true});});
  const request=(route,body)=>fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{authorization:'Bearer fixture-token','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  let stderr='';child.stderr.on('data',part=>stderr+=part);
  for(let i=0;i<120&&!stderr.includes('listening on');i++) {
    if(child.exitCode!==null)throw new Error('Runtime exited: '+stderr);
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.match(stderr,/listening on/);
  assert.equal((await request('/v1/config/agents',{executables:{[agent]:executable}})).status,200);
  const initial=await request('/v1/run',{agent,windowID:'window',requestID:'request',prompt:'fixture input',cwd:directory});
  const iterator=initial.body[Symbol.asyncIterator]();let nativeSessionID,received='',ready=false;
  while(!ready){const {value,done}=await iterator.next();assert.equal(done,false);received+=Buffer.from(value).toString();
    for(const line of received.split('\n').slice(0,-1)){const event=JSON.parse(line);nativeSessionID ||= event.nativeSessionID;if(event.data?.raw?.type==='fixture.ready')ready=true;}
  }
  assert.ok(nativeSessionID);
  const busy=await request('/v1/pty/create',{agent,cwd:directory,sessionID:nativeSessionID});
  assert.equal(busy.status,400);assert.match(await busy.text(),/会话仍在/);
  await request('/v1/requests/request/cancel',{});
  while(!(await iterator.next()).done){}
  const terminal=await request('/v1/pty/create',{agent,cwd:directory,sessionID:nativeSessionID});
  assert.equal(terminal.status,200);const info=await terminal.json();
  assert.equal(info.nativeSessionID,null);assert.equal(info.previousNativeSessionID,nativeSessionID);assert.equal(info.resumeMode,'picker');assert.equal(info.cwd,directory);assert.equal(info.executable,executable);
  const controller=new AbortController();
  const read=await fetch(`http://127.0.0.1:${port}/v1/pty/read?id=${info.ptyID}`,{headers:{authorization:'Bearer fixture-token'},signal:controller.signal});
  let output='';
  try {for await(const part of read.body){for(const line of Buffer.from(part).toString().split('\n').filter(Boolean)){const event=JSON.parse(line);output+=event.data||'';}if(output.includes('fixture.ready'))break;}}
  finally {controller.abort();}
  const terminalReady=JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('{')&&line.includes('fixture.ready')));
  if(agent==='claude-code'){assert.deepEqual(terminalReady.args,['--resume']);assert.equal(terminalReady.entrypoint,'sdk-cli');}
  else assert.deepEqual(terminalReady.args,['--cd',directory,'resume','--all','--include-non-interactive']);
  assert.ok(!terminalReady.args.includes(nativeSessionID));
  const second=await request('/v1/run',{agent,windowID:'other',requestID:'other',prompt:'must not launch',nativeSessionID,cwd:directory});
  assert.equal(second.status,400);assert.match(await second.text(),/会话仍在/);
  const fresh=await request('/v1/run',{agent,windowID:'third',requestID:'fresh',prompt:'also blocked',cwd:directory});
  assert.equal(fresh.status,400);assert.match(await fresh.text(),/会话仍在/);
  await request('/v1/pty/close',{ptyID:info.ptyID});
  const after=await request('/v1/run',{agent,windowID:'third',requestID:'after',prompt:'now allowed',cwd:directory});
  assert.equal(after.status,200);
  const afterIterator=after.body[Symbol.asyncIterator]();let afterOutput='';
  while(!afterOutput.includes('fixture.ready')){const chunk=await afterIterator.next();assert.equal(chunk.done,false);afterOutput+=Buffer.from(chunk.value).toString();}
  await request('/v1/requests/after/cancel',{});
  while(!(await afterIterator.next()).done){}
});
